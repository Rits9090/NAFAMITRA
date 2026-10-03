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
    phone = normalize_phone(req.phone)
    if not phone:
        raise AppError('Please enter a valid 10-digit mobile number.',
                       400, 'invalid_phone',
                       'कृपया वैध 10 अंकी मोबाईल नंबर भरा.')
    return await request_otp(phone)


@router.post('/verify-otp')
async def api_verify_otp(req: OtpVerify):
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
            shops.append({
                'id': shop['id'], 'name': shop['name'],
                'category': shop.get('category'), 'role': m.get('role', 'cashier'),
                'location': shop.get('location') or shop.get('address'),
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


@router.get('/me')
async def me(user: dict = Depends(get_current_user)):
    if user.get('scope') == 'portal':
        raise Forbidden('Not available for customer portal sessions.')
    person = await db.users.find_one({'id': user['user_id']}, {'_id': 0})
    if not person:
        raise Unauthorized('Please sign in again.', 'कृपया पुन्हा साइन इन करा.')
    return {
        'user': _safe_user(person),
        'identities': await identity_resolution(person),
    }


# ---------------------------------------------------------------------------
# onboarding
# ---------------------------------------------------------------------------
class ShopOnboard(BaseModel):
    owner_name: str = Field(min_length=2, max_length=80)
    shop_name: str = Field(min_length=2, max_length=120)
    category: str
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
        'address': (req.location or '').strip() or None,
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
    from identity import ensure_global_customer
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
