"""Auth routes: phone OTP entry, identity resolution, onboarding, staff."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

import config
from audit import log_action
from auth import (create_access_token, get_current_user, hash_password,
                  list_memberships, require_business, require_role,
                  role_at_least, verify_password)
from database import db
from errors import AppError, Forbidden, NotFound, Unauthorized
from identity import customer_profiles_for_user
from otp_service import request_otp, verify_otp
from phones import new_id, normalize_phone

router = APIRouter()

SHOP_CATEGORIES = [
    {'value': 'agriculture', 'label_mr': '🌾 कृषी सेवा / बियाणे / खते',
     'label_en': 'Agriculture / Seeds / Fertilizer'},
    {'value': 'kirana', 'label_mr': '🛒 किराणा / जनरल स्टोअर',
     'label_en': 'Grocery / General Store'},
    {'value': 'apparel', 'label_mr': '👕 कपडे / टेक्सटाईल',
     'label_en': 'Clothing / Textile'},
    {'value': 'electronics', 'label_mr': '📱 मोबाईल / इलेक्ट्रॉनिक्स',
     'label_en': 'Mobile / Electronics'},
    {'value': 'hardware', 'label_mr': '🔩 हार्डवेअर / इलेक्ट्रिकल',
     'label_en': 'Hardware / Electrical'},
    {'value': 'other', 'label_mr': '📦 इतर व्यवसाय', 'label_en': 'Other Business'},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# public config
# ---------------------------------------------------------------------------
@router.get('/config')
async def public_config():
    return config.public_config()


@router.get('/categories')
async def categories():
    return SHOP_CATEGORIES


# ---------------------------------------------------------------------------
# phone OTP
# ---------------------------------------------------------------------------
class OtpRequest(BaseModel):
    phone: str
    intent: Optional[str] = None  # 'merchant' | 'customer' (hint only)


class OtpVerify(BaseModel):
    phone: str
    code: str = Field(min_length=4, max_length=8)


@router.post('/request-otp')
async def api_request_otp(req: OtpRequest):
    if not config.AUTH_GATES['phone_otp']:
        raise Forbidden('Phone OTP entry is disabled on this deployment.',
                        'फोन OTP प्रवेश या डिप्लॉयमेंटवर बंद आहे.')
    phone = normalize_phone(req.phone)
    if not phone:
        raise AppError('Please enter a valid 10-digit mobile number.',
                       400, 'invalid_phone',
                       'कृपया वैध 10 अंकी मोबाईल नंबर भरा.')
    return await request_otp(phone)


@router.post('/verify-otp')
async def api_verify_otp(req: OtpVerify):
    if not config.AUTH_GATES['phone_otp']:
        raise Forbidden('Phone OTP entry is disabled on this deployment.',
                        'फोन OTP प्रवेश या डिप्लॉयमेंटवर बंद आहे.')
    phone = normalize_phone(req.phone)
    if not phone:
        raise AppError('Please enter a valid 10-digit mobile number.',
                       400, 'invalid_phone',
                       'कृपया वैध 10 अंकी मोबाईल नंबर भरा.')
    if not await verify_otp(phone, str(req.code).strip()):
        raise AppError('Incorrect code. Please try again.', 400, 'otp_invalid',
                       'चुकीचा कोड. कृपया पुन्हा प्रयत्न करा.')

    user = await db.users.find_one({'phone_normalized': phone}, {'_id': 0})
    is_new = user is None
    if not user:
        user = {
            'id': new_id(),
            'phone': phone,
            'phone_normalized': phone,
            'name': None,
            'is_active': True,
            'created_at': _now(),
        }
        try:
            await db.users.insert_one(dict(user))
        except Exception:
            user = await db.users.find_one({'phone_normalized': phone}, {'_id': 0})
            is_new = False
    user.pop('_id', None)

    payload = await identity_resolution(user)
    token = create_access_token(user['id'])
    return {
        'token': token,
        'is_new': is_new,
        'user': _safe_user(user),
        'identities': payload,
    }


async def identity_resolution(user: dict) -> dict:
    """What identities does this authenticated person hold?"""
    memberships = await list_memberships(user['id'])
    shops = []
    for m in memberships:
        shop = await db.businesses.find_one({'id': m['shop_id']}, {'_id': 0})
        if shop:
            s = shop.get('settings') or {}
            shops.append({
                'id': shop['id'], 'name': shop['name'],
                'category': shop.get('category'), 'role': m.get('role', 'cashier'),
                'location': shop.get('location') or shop.get('address'),
                # non-sensitive shop settings the SPA needs (loyalty maths, safe price policy)
                'settings': {
                    'loyalty_points_per_100': int(s.get('loyalty_points_per_100', 1) or 0),
                    'redemption_value_paise': int(s.get('redemption_value_paise',
                        round(float(s.get('redemption_value', 0.1) or 0.1) * 100))),
                    'loyalty_enabled': bool(s.get('loyalty_enabled', True)),
                    'prevent_below_min': bool(s.get('prevent_below_min', False)),
                },
            })
    profiles = await customer_profiles_for_user(user)
    customer_profiles = [
        {'customer_id': p['id'], 'nm_id': p['nm_id'], 'name': p.get('name'),
         'phone': p.get('phone')}
        for p in profiles
    ]
    return {
        'shops': shops,
        'customer_profiles': customer_profiles,
        'kind': (
            'both' if shops and customer_profiles else
            'merchant' if shops else
            'customer' if customer_profiles else
            'new'
        ),
    }


def _safe_user(user: dict) -> dict:
    return {k: v for k, v in user.items()
            if k not in ('password_hash', '_id', 'phone_normalized')}


async def ensure_supabase_person(payload: dict) -> Optional[dict]:
    """Idempotent app-profile creation for a Supabase session.

    * One profile per auth UUID (the Supabase ``sub`` IS the app user id) —
      repeated logins/refreshes never create duplicate rows.
    * Only verified token claims are used (never client-supplied ids).
    * Missing fields are filled on later logins; user-edited values are never
      overwritten. Accounts that merely share an email are NOT merged — the
      Supabase profile simply keeps the email out of the shared unique column
      (support can link them deliberately later).
    """
    if not payload.get('supabase'):
        return None
    uid = payload['user_id']
    meta = payload.get('user_metadata') or {}
    claim_name = (meta.get('full_name') or meta.get('name') or '').strip() or None
    claim_email = (payload.get('email') or '').strip().lower() or None
    claim_phone = normalize_phone(payload.get('phone')) if payload.get('phone') else None

    person = await db.users.find_one({'id': uid}, {'_id': 0})
    if person:
        sets = {}
        if not person.get('email') and claim_email:
            if not await db.users.find_one({'email': claim_email}, {'_id': 1}):
                sets['email'] = claim_email
        if not person.get('name') and claim_name:
            sets['name'] = claim_name
        if not person.get('phone_normalized') and claim_phone:
            if not await db.users.find_one({'phone_normalized': claim_phone}, {'_id': 1}):
                sets['phone'] = claim_phone
                sets['phone_normalized'] = claim_phone
        if sets:
            sets['updated_at'] = _now()
            try:
                await db.users.update_one({'id': uid}, {'$set': sets})
            except Exception:
                pass  # unique-index race — keep the existing row as-is
            person = await db.users.find_one({'id': uid}, {'_id': 0})
        return person

    doc = {
        'id': uid,
        'supabase_uid': uid,
        'name': claim_name,
        'business_id': None,
        'role': 'owner',
        'is_active': True,
        'created_at': _now(),
        'created_via': 'supabase',
    }
    # Unique columns: only claim them when they are actually free (§8: never
    # merge with an existing account that happens to share an email/phone).
    if claim_email and not await db.users.find_one({'email': claim_email}, {'_id': 1}):
        doc['email'] = claim_email
    elif claim_email:
        doc['supabase_email'] = claim_email
    if claim_phone and not await db.users.find_one({'phone_normalized': claim_phone}, {'_id': 1}):
        doc['phone'] = claim_phone
        doc['phone_normalized'] = claim_phone
    elif claim_phone:
        doc['supabase_phone'] = claim_phone
    try:
        await db.users.insert_one(dict(doc))
        doc.pop('_id', None)
        return doc
    except Exception:
        # concurrent first login — reuse the row the other request created
        return await db.users.find_one({'id': uid}, {'_id': 0})


@router.get('/me')
async def me(user: dict = Depends(get_current_user)):
    if user.get('scope') == 'portal':
        raise Forbidden('Not available for customer portal sessions.')
    if user.get('supabase'):
        person = await ensure_supabase_person(user)
    else:
        person = await db.users.find_one({'id': user['user_id']}, {'_id': 0})
    if not person:
        raise Unauthorized('Please sign in again.', 'कृपया पुन्हा साइन इन करा.')
    return {
        'user': _safe_user(person),
        'identities': await identity_resolution(person),
    }


# ---------------------------------------------------------------------------
# account profile (name + optional mobile number — information, never OTP)
# ---------------------------------------------------------------------------
class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    # '' or null removes the number; the field stays optional everywhere.
    phone_number: Optional[str] = None


@router.put('/profile')
async def update_my_profile(req: ProfileUpdate, user: dict = Depends(get_current_user)):
    """Edit own name / optional mobile number (no verification claimed).

    Uses the existing profile schema's `phone` + `phone_normalized` columns
    (10-digit canonical Indian form — see phones.normalize_phone); ownership
    comes from the verified session, never from a client-supplied id.
    """
    if user.get('scope') == 'portal':
        raise Forbidden('Not available for customer portal sessions.')
    if user.get('supabase'):
        person = await ensure_supabase_person(user)
    else:
        person = await db.users.find_one({'id': user['user_id']}, {'_id': 0})
    if not person:
        raise Unauthorized('Please sign in again.', 'कृपया पुन्हा साइन इन करा.')

    sets = {}
    unset = {}
    if req.name is not None:
        sets['name'] = req.name.strip()
    if req.phone_number is not None:
        raw = req.phone_number.strip()
        if not raw:
            unset['phone'] = ''
            unset['phone_normalized'] = ''
            sets.pop('phone', None)
        else:
            norm = normalize_phone(raw)
            if not norm:
                raise AppError('Please enter a valid 10-digit mobile number.',
                               400, 'invalid_phone',
                               'कृपया वैध 10 अंकी मोबाईल नंबर भरा.')
            taken = await db.users.find_one(
                {'phone_normalized': norm, 'id': {'$ne': person['id']}}, {'_id': 1})
            if taken:
                raise AppError('This mobile number is already linked to another account.',
                               400, 'phone_taken',
                               'हा मोबाईल नंबर दुसऱ्या खात्याशी जोडलेला आहे.')
            sets['phone'] = norm
            sets['phone_normalized'] = norm

    update = {}
    if sets:
        sets['updated_at'] = _now()
        update['$set'] = sets
    if unset:
        update['$unset'] = unset
    if update:
        await db.users.update_one({'id': person['id']}, update)
    fresh = await db.users.find_one({'id': person['id']}, {'_id': 0}) or person
    return {'user': _safe_user(fresh)}


# ---------------------------------------------------------------------------
# onboarding
# ---------------------------------------------------------------------------
class ShopOnboard(BaseModel):
    owner_name: str = Field(min_length=2, max_length=80)
    shop_name: str = Field(min_length=2, max_length=120)
    category: str
    address: Optional[str] = None   # village / city line
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class CustomerOnboard(BaseModel):
    name: str = Field(min_length=2, max_length=80)


@router.post('/onboard/shop')
async def onboard_shop(req: ShopOnboard, payload: dict = Depends(get_current_user)):
    """~2 minute merchant registration: name, shop, category, location. Nothing else."""
    user_id = payload['user_id']
    person = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not person:
        raise Unauthorized()

    valid_categories = [c['value'] for c in SHOP_CATEGORIES]
    if req.category not in valid_categories:
        raise AppError('Please choose a valid shop category.', 400, 'bad_category',
                       'कृपया वैध दुकान प्रकार निवडा.')

    existing = await db.memberships.find_one({'user_id': user_id, 'status': 'active'}, {'_id': 1})
    if existing:
        raise AppError('This account already has a shop. Use Switch Account to manage it.',
                       409, 'shop_exists',
                       'या खात्याला आधीच दुकान आहे.')

    shop_id = new_id()
    now = _now()
    shop_doc = {
        'id': shop_id,
        'name': req.shop_name.strip(),
        'category': req.category,
        'owner_id': user_id,
        'location': (req.location or '').strip() or None,
        'address': ((req.address or '').strip() or (req.location or '').strip() or None),
        'latitude': req.latitude,
        'longitude': req.longitude,
        'phone': person.get('phone'),
        'subscription_plan': 'pilot',
        'settings': {
            'loyalty_points_per_100': 1,
            'redemption_value_paise': 10,
            'loyalty_enabled': True,
            'prevent_below_min': False,
            'currency': 'INR',
        },
        'created_at': now,
    }
    await db.businesses.insert_one(dict(shop_doc))
    await db.memberships.insert_one({
        'id': new_id(), 'shop_id': shop_id, 'user_id': user_id,
        'role': 'owner', 'status': 'active', 'created_at': now,
    })
    await db.users.update_one({'id': user_id}, {'$set': {
        'name': req.owner_name.strip(),
        'updated_at': now,
    }})
    await log_action(shop_id, user_id, 'shop_created', 'shop', shop_id,
                     {'field': req.category})
    shop_doc.pop('_id', None)
    return {'shop': shop_doc, 'identities': await identity_resolution(
        await db.users.find_one({'id': user_id}, {'_id': 0}))}


@router.post('/onboard/customer')
async def onboard_customer(req: CustomerOnboard, payload: dict = Depends(get_current_user)):
    from identity import ensure_global_customer, ensure_shop_link
    user_id = payload['user_id']
    person = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not person:
        raise Unauthorized()
    if not person.get('name'):
        await db.users.update_one({'id': user_id},
                                  {'$set': {'name': req.name.strip(), 'updated_at': _now()}})
    customer = await ensure_global_customer(
        name=req.name.strip(), phone=person.get('phone_normalized') or person.get('phone'),
        user_id=user_id)
    # The owner is also a customer of their own shop(s): create the link so
    # CRM surfaces (segments, requirements visibility, billing) see them.
    for m in await db.memberships.find({'user_id': user_id},
                                       {'_id': 0, 'shop_id': 1}).to_list(10):
        await ensure_shop_link(m['shop_id'], customer,
                               normalized_phone=person.get('phone_normalized'),
                               source='self')
    return {'customer': {'customer_id': customer['id'], 'nm_id': customer['nm_id'],
                         'name': customer['name']},
            'identities': await identity_resolution(
                await db.users.find_one({'id': user_id}, {'_id': 0}))}


# ---------------------------------------------------------------------------
# staff (owner only)
# ---------------------------------------------------------------------------
class StaffAdd(BaseModel):
    phone: str
    name: Optional[str] = None
    role: str = 'cashier'


@router.get('/staff')
async def list_staff(user: dict = Depends(require_business)):
    members = await db.memberships.find({'shop_id': user['shop_id']}, {'_id': 0}).to_list(100)
    out = []
    for m in members:
        person = await db.users.find_one({'id': m['user_id']}, {'_id': 0, 'name': 1, 'phone': 1, 'email': 1}) or {}
        out.append({
            'membership_id': m['id'], 'user_id': m['user_id'],
            'name': person.get('name') or m.get('name') or 'Team member',
            'phone': person.get('phone'), 'email': person.get('email'),
            'role': m.get('role', 'cashier'), 'status': m.get('status', 'active'),
            'created_at': m.get('created_at'),
        })
    return {'staff': out, 'your_role': user['role']}


@router.post('/staff')
async def add_staff(req: StaffAdd, user: dict = Depends(require_role('owner'))):
    if req.role not in ('owner', 'manager', 'cashier'):
        raise AppError('Choose a valid role.', 400, 'bad_role', 'वैध भूमिका निवडा.')
    phone = normalize_phone(req.phone)
    if not phone:
        raise AppError('Please enter a valid mobile number.', 400, 'invalid_phone',
                       'कृपया वैध मोबाईल नंबर भरा.')
    person = await db.users.find_one({'phone_normalized': phone}, {'_id': 0})
    if not person:
        # Pre-create an invitee placeholder — they join fully after their OTP login
        person = {'id': new_id(), 'phone': phone, 'phone_normalized': phone,
                  'name': req.name, 'is_active': True, 'invited': True,
                  'created_at': _now()}
        await db.users.insert_one(dict(person))
    existing = await db.memberships.find_one(
        {'shop_id': user['shop_id'], 'user_id': person['id']}, {'_id': 1})
    if existing:
        raise AppError('This person is already on your team.', 409, 'already_staff',
                       'ही व्यक्ती आधीच तुमच्या टीममध्ये आहे.')
    membership = {
        'id': new_id(), 'shop_id': user['shop_id'], 'user_id': person['id'],
        'role': req.role, 'status': 'active', 'created_at': _now(),
    }
    await db.memberships.insert_one(dict(membership))
    await log_action(user['shop_id'], user['user_id'], 'staff_added', 'membership',
                     membership['id'], {'role': req.role, 'member_phone': phone[-4:]})
    return {'success': True, 'role': req.role}


@router.delete('/staff/{membership_id}')
async def remove_staff(membership_id: str, user: dict = Depends(require_role('owner'))):
    target = await db.memberships.find_one(
        {'id': membership_id, 'shop_id': user['shop_id']}, {'_id': 0})
    if not target:
        raise NotFound('Team member not found.', 'सदस्य सापडला नाही.')
    if target.get('role') == 'owner':
        owners = await db.memberships.count_documents(
            {'shop_id': user['shop_id'], 'role': 'owner', 'status': 'active'})
        if owners <= 1:
            raise AppError('You cannot remove the only owner.', 400, 'last_owner',
                           'तुम्ही एकमेव मालक आहात — त्यांना काढता येणार नाही.')
    await db.memberships.update_one({'id': membership_id},
                                    {'$set': {'status': 'removed', 'removed_at': _now()}})
    await log_action(user['shop_id'], user['user_id'], 'staff_removed', 'membership',
                     membership_id, {'role': target.get('role')})
    return {'success': True}


# ---------------------------------------------------------------------------
# legacy email/password auth (kept for backwards compatibility)
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class BusinessSetupRequest(BaseModel):
    name: str
    category: str
    address: Optional[str] = None
    phone: Optional[str] = None
    gst_number: Optional[str] = None


@router.post('/register')
async def register(req: RegisterRequest):
    if not config.AUTH_GATES['password']:
        raise Forbidden('Password registration is disabled on this deployment.',
                        'पासवर्ड नोंदणी या डिप्लॉयमेंटवर बंद आहे.')
    existing = await db.users.find_one({'email': req.email.lower()}, {'_id': 0})
    if existing:
        raise AppError('This email is already registered.', 400, 'email_taken')
    user_id = new_id()
    user_doc = {
        'id': user_id,
        'email': req.email.lower(),
        'password_hash': hash_password(req.password),
        'name': req.name,
        'phone': req.phone,
        'phone_normalized': normalize_phone(req.phone),
        'business_id': None,
        'role': 'owner',
        'is_active': True,
        'created_at': _now(),
    }
    await db.users.insert_one(dict(user_doc))
    token = create_access_token(user_id, req.email.lower(), None, 'owner')
    return {'token': token, 'user': {k: v for k, v in user_doc.items()
                                     if k not in ('password_hash', '_id')}}


@router.post('/login')
async def login(req: LoginRequest):
    if not config.AUTH_GATES['password']:
        raise Forbidden('Password login is disabled on this deployment.',
                        'पासवर्ड लॉगिन या डिप्लॉयमेंटवर बंद आहे.')
    person = await db.users.find_one({'email': req.email.lower()}, {'_id': 0})
    if not person or not verify_password(req.password, person.get('password_hash', '')):
        raise Unauthorized('Invalid email or password.')
    memberships = await list_memberships(person['id'])
    business_id = memberships[0]['shop_id'] if memberships else person.get('business_id')
    role = memberships[0].get('role', 'owner') if memberships else person.get('role', 'owner')
    token = create_access_token(person['id'], person.get('email', ''), business_id, role)
    safe_user = {k: v for k, v in person.items() if k != 'password_hash'}
    business = await db.businesses.find_one({'id': business_id}, {'_id': 0}) if business_id else None
    return {'token': token, 'user': safe_user, 'business': business,
            'identities': await identity_resolution(person)}


@router.post('/setup-business')
async def setup_business(req: BusinessSetupRequest, current_user: dict = Depends(get_current_user)):
    """Legacy setup path — creates shop + owner membership."""
    user_id = current_user['user_id']
    person = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not person:
        raise Unauthorized()
    shop_id = new_id()
    now = _now()
    business_doc = {
        'id': shop_id,
        'name': req.name,
        'category': req.category,
        'owner_id': user_id,
        'address': req.address,
        'location': req.address,
        'phone': req.phone,
        'gst_number': req.gst_number,
        'subscription_plan': 'free',
        'settings': {
            'loyalty_points_per_100': 1,
            'silver_threshold': 500, 'gold_threshold': 2000, 'vip_threshold': 5000,
            'redemption_value_paise': 10,
            'loyalty_enabled': True,
            'currency': 'INR',
        },
        'created_at': now,
    }
    await db.businesses.insert_one(dict(business_doc))
    await db.memberships.insert_one({
        'id': new_id(), 'shop_id': shop_id, 'user_id': user_id,
        'role': 'owner', 'status': 'active', 'created_at': now,
    })
    await db.users.update_one({'id': user_id}, {'$set': {'business_id': shop_id}})
    new_token = create_access_token(user_id, person.get('email', ''), shop_id, 'owner')
    business_doc.pop('_id', None)
    return {'token': new_token, 'business': business_doc}


class ShopSettingsUpdate(BaseModel):
    """Owner-controlled shop switches. Unknown fields are ignored (pydantic)."""
    prevent_below_min: Optional[bool] = None
    loyalty_enabled: Optional[bool] = None


@router.put('/shop/settings')
async def update_shop_settings(req: ShopSettingsUpdate,
                               user: dict = Depends(require_role('owner'))):
    updates = {}
    if req.prevent_below_min is not None:
        updates['settings.prevent_below_min'] = req.prevent_below_min
    if req.loyalty_enabled is not None:
        updates['settings.loyalty_enabled'] = req.loyalty_enabled
    if updates:
        updates['updated_at'] = _now()
        await db.businesses.update_one({'id': user['shop_id']}, {'$set': updates})
        await log_action(user['shop_id'], user['user_id'], 'shop_settings_changed',
                         'shop', user['shop_id'], {'fields': sorted(updates)})
    shop = await db.businesses.find_one({'id': user['shop_id']}, {'_id': 0, 'settings': 1})
    return {'settings': (shop or {}).get('settings') or {}}


@router.put('/business')
async def update_business(req: BusinessSetupRequest, user: dict = Depends(require_role('manager'))):
    await db.businesses.update_one({'id': user['shop_id']}, {'$set': {
        'name': req.name, 'category': req.category,
        'address': req.address, 'location': req.address,
        'phone': req.phone, 'gst_number': req.gst_number,
        'updated_at': _now(),
    }})
    await log_action(user['shop_id'], user['user_id'], 'settings_changed', 'shop',
                     user['shop_id'], {'field': 'business_profile'})
    return await db.businesses.find_one({'id': user['shop_id']}, {'_id': 0})
