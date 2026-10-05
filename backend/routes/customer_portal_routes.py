"""Customer portal API — what an end consumer sees after OTP login.

Authorization: every query is filtered by the authenticated customer profile
(sessions carries customer_id, or user id links to profiles).  A customer sees
their own activity across all their shops; nothing else.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from audit import log_action
from auth import create_access_token, decode_token, require_portal
from config import FEATURES
from database import db
from errors import AppError, Forbidden, NotFound
from identity import customer_profiles_for_user
from money import fmt
from phones import new_token

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _resolve_profile_ids(token_payload: dict) -> list[str]:
    """Which customer profiles may this session read?"""
    if token_payload.get('customer_id'):
        return [token_payload['customer_id']]
    user = await db.users.find_one({'id': token_payload.get('user_id')}, {'_id': 0})
    if not user:
        return []
    profiles = await customer_profiles_for_user(user)
    return [p['id'] for p in profiles]


async def _shop_name(shop_id: str) -> str:
    shop = await db.businesses.find_one({'id': shop_id}, {'_id': 0, 'name': 1, 'category': 1}) or {}
    return shop.get('name') or 'Shop'


# ---------------------------------------------------------------------------
@router.get("/me")
async def portal_me(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    profiles = []
    for cid in ids:
        cust = await db.customers.find_one({'id': cid}, {'_id': 0})
        if cust:
            profiles.append({'customer_id': cust['id'], 'nm_id': cust['nm_id'],
                             'name': cust.get('name'), 'phone': cust.get('phone'),
                             'created_at': cust.get('created_at')})
    return {'profiles': profiles, 'active_profile': ids[0] if ids else None}


@router.get("/overview")
async def overview(payload: dict = Depends(require_portal)):
    """Customer home: धनलाभ per shop, credit per shop, shops, recent bills."""
    ids = await _resolve_profile_ids(payload)
    if not ids:
        return {'dhanlabh': [], 'credit': [], 'shops': [], 'recent_bills': [],
                'totals': {'dhanlabh_points': 0, 'credit_paise': 0}}

    loyalty = await db.loyalty_accounts.find({'customer_id': {'$in': ids}},
                                             {'_id': 0}).to_list(100)
    credit = await db.credit_accounts.find({'customer_id': {'$in': ids}},
                                           {'_id': 0}).to_list(100)
    links = await db.shop_customers.find({'customer_id': {'$in': ids}, 'status': 'active'},
                                         {'_id': 0}).to_list(100)

    dhanlabh = []
    for acc in loyalty:
        if acc.get('balance', 0) <= 0:
            continue
        rules = await _loyalty_rules(acc['shop_id'])
        dhanlabh.append({
            'shop_id': acc['shop_id'],
            'shop_name': await _shop_name(acc['shop_id']),
            'points': acc['balance'],
            'redemption_value_paise': rules['redemption_value_paise'],
            'estimated_value_paise': acc['balance'] * rules['redemption_value_paise'],
        })
    dhanlabh.sort(key=lambda x: -x['points'])

    credit_rows = []
    for acc in credit:
        credit_rows.append({
            'shop_id': acc['shop_id'],
            'shop_name': await _shop_name(acc['shop_id']),
            'outstanding_paise': acc.get('outstanding_paise', 0),
        })
    credit_rows.sort(key=lambda x: -x['outstanding_paise'])

    shops = []
    profiles = await _portal_profiles(ids)
    for link in links:
        shop = await db.businesses.find_one({'id': link['shop_id']}, {'_id': 0}) or {}
        my_profile = next((p for p in profiles if p['id'] == link['customer_id']), None) or {}
        shops.append({
            'shop_id': link['shop_id'],
            'shop_name': shop.get('name'),
            'category': shop.get('category'),
            'since': link.get('first_purchase_at') or link.get('created_at'),
            'purchase_count': link.get('purchase_count', 0),
            'total_spend_paise': link.get('total_spend_paise', 0),
            'nm_id': my_profile.get('nm_id'),
        })

    bills = await db.invoices.find({'customer_id': {'$in': ids}},
                                   {'_id': 0}).sort('created_at', -1).to_list(10)
    recent = []
    for b in bills:
        recent.append(await _bill_view(b))

    total_points = sum(d['points'] for d in dhanlabh)
    total_credit = sum(c['outstanding_paise'] for c in credit_rows)
    return {
        'dhanlabh': dhanlabh,
        'credit': credit_rows,
        'shops': shops,
        'recent_bills': recent,
        'totals': {
            # shown for information only — never as a redeemable universal balance
            'dhanlabh_points': total_points,
            'credit_paise': total_credit,
        },
    }


async def _portal_profiles(ids: list[str]) -> list[dict]:
    return await db.customers.find({'id': {'$in': ids}}, {'_id': 0}).to_list(len(ids))


async def _loyalty_rules(shop_id: str) -> dict:
    shop = await db.businesses.find_one({'id': shop_id}, {'_id': 0, 'settings': 1}) or {}
    s = shop.get('settings') or {}
    return {
        'redemption_value_paise': int(s.get('redemption_value_paise',
                                            round(float(s.get('redemption_value', 0.1) or 0.1) * 100))),
        'points_per_100': int(s.get('loyalty_points_per_100', 1) or 0),
    }


async def _bill_view(b: dict) -> dict:
    shop_name = await _shop_name(b.get('shop_id') or b.get('business_id'))
    if 'total_paise' in b:
        return {
            'id': b['id'], 'invoice_number': b.get('invoice_number'),
            'shop_name': shop_name, 'shop_id': b.get('shop_id'),
            'status': b.get('status', 'ACTIVE'),
            'created_at': b.get('created_at'),
            'total_paise': b.get('total_paise', 0),
            'payment_mode': b.get('payment_mode'),
            'payment_status': b.get('payment_status'),
            'loyalty_earned_points': b.get('loyalty_earned_points', 0),
            'loyalty_redeemed_points': b.get('loyalty_redeemed_points', 0),
            'share_token': b.get('share_token'),
            'paise': True,
        }
    # legacy sale
    return {
        'id': b.get('id'), 'invoice_number': b.get('invoice_number'),
        'shop_name': shop_name, 'shop_id': b.get('business_id'),
        'status': 'ACTIVE',
        'created_at': b.get('created_at'),
        'total_paise': int(round(float(b.get('total_amount') or 0) * 100)),
        'payment_mode': b.get('payment_mode'),
        'payment_status': b.get('payment_status'),
        'loyalty_earned_points': int(b.get('loyalty_points_earned') or 0),
        'loyalty_redeemed_points': int(b.get('loyalty_points_redeemed') or 0),
        'paise': False,
    }


@router.get("/bills")
async def portal_bills(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    new_bills = await db.invoices.find({'customer_id': {'$in': ids}},
                                       {'_id': 0}).sort('created_at', -1).to_list(100)
    legacy = await db.sales.find({'customer_id': {'$in': ids}},
                                 {'_id': 0}).sort('created_at', -1).to_list(50)
    views = [await _bill_view(b) for b in new_bills] + [await _bill_view(b) for b in legacy]
    views.sort(key=lambda v: v.get('created_at') or '', reverse=True)
    return {'bills': views}


@router.get("/bills/{bill_id}")
async def portal_bill(bill_id: str, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    b = await db.invoices.find_one({'id': bill_id}, {'_id': 0}) or \
        await db.invoices.find_one({'invoice_number': bill_id}, {'_id': 0})
    if not b:
        b = await db.sales.find_one({'id': bill_id}, {'_id': 0}) or \
            await db.sales.find_one({'invoice_number': bill_id}, {'_id': 0})
    if not b or (b.get('customer_id') not in ids):
        # never reveal another customer's bill
        raise NotFound('Bill not found.', 'बिल सापडले नाही.')
    view = await _bill_view(b)
    view['items'] = [
        {'name': it.get('product_name') or it.get('name'),
         'quantity': it.get('quantity'),
         'total': it.get('total_paise') if 'total_paise' in it else it.get('total'),
         'unit_price': it.get('unit_price_paise') if 'unit_price_paise' in it else it.get('unit_price')}
        for it in b.get('items', [])
    ]
    shop = await db.businesses.find_one({'id': b.get('shop_id') or b.get('business_id')},
                                        {'_id': 0, 'name': 1, 'phone': 1, 'location': 1}) or {}
    view['shop'] = {'name': shop.get('name'), 'location': shop.get('location')}
    return view


@router.get("/loyalty")
async def portal_loyalty(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    accounts = await db.loyalty_accounts.find({'customer_id': {'$in': ids}},
                                              {'_id': 0}).to_list(100)
    out = []
    for acc in accounts:
        rules = await _loyalty_rules(acc['shop_id'])
        txs = await db.loyalty_transactions.find(
            {'shop_id': acc['shop_id'], 'customer_id': acc['customer_id']},
            {'_id': 0}).sort('created_at', -1).to_list(30)
        out.append({
            'shop_id': acc['shop_id'],
            'shop_name': await _shop_name(acc['shop_id']),
            'points': acc.get('balance', 0),
            'redemption_value_paise': rules['redemption_value_paise'],
            'estimated_value_paise': acc.get('balance', 0) * rules['redemption_value_paise'],
            'transactions': txs,
        })
    out.sort(key=lambda x: -x['points'])
    return {'accounts': out}


@router.get("/credit")
async def portal_credit(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    accounts = await db.credit_accounts.find({'customer_id': {'$in': ids}},
                                             {'_id': 0}).to_list(100)
    out = []
    for acc in accounts:
        txs = await db.credit_transactions.find(
            {'shop_id': acc['shop_id'], 'customer_id': acc['customer_id']},
            {'_id': 0}).sort('created_at', -1).to_list(30)
        out.append({
            'shop_id': acc['shop_id'],
            'shop_name': await _shop_name(acc['shop_id']),
            'outstanding_paise': acc.get('outstanding_paise', 0),
            'transactions': txs,
        })
    out.sort(key=lambda x: -x['outstanding_paise'])
    return {'accounts': out}


@router.get("/qr")
async def portal_qr(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    cust = await db.customers.find_one({'id': ids[0]}, {'_id': 0})
    if not cust.get('qr_token'):
        await db.customers.update_one({'id': cust['id']},
                                      {'$set': {'qr_token': new_token(16)}})
        cust = await db.customers.find_one({'id': ids[0]}, {'_id': 0})
    return {'nm_id': cust['nm_id'], 'name': cust.get('name'),
            'qr_token': cust['qr_token'],
            'qr_url': f"/api/customer/qr.png?token={cust['qr_token']}"}


class ProfileUpdate(BaseModel):
    name: str


@router.put("/profile")
async def update_profile(req: ProfileUpdate, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound()
    if not req.name.strip():
        raise AppError('Name cannot be empty.', 400, 'bad_name', 'नाव रिकामे असू शकत नाही.')
    await db.customers.update_one({'id': ids[0]},
                                  {'$set': {'name': req.name.strip(), 'updated_at': _now()}})
    return {'success': True}


# ---------------------------------------------------------------------------
# magic link (temporary, one-time passbook access — NOT a permanent URL auth)
# ---------------------------------------------------------------------------
class MagicLinkRequest(BaseModel):
    ttl_minutes: int = 30


@router.post("/magic-link")
async def create_magic_link(req: MagicLinkRequest, payload: dict = Depends(require_portal)):
    if not FEATURES.get('customer_magic_links'):
        raise Forbidden('Magic links are disabled.')
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound()
    import hashlib
    token = new_token(24)
    doc = {
        'token_hash': hashlib.sha256(token.encode()).hexdigest(),
        'customer_id': ids[0],
        'created_from_session': True,
        'used': False,
        'revoked': False,
        'created_at': _now(),
        'expires_at': datetime.now(timezone.utc).timestamp() + min(int(req.ttl_minutes), 120) * 60,
    }
    await db.magic_links.insert_one(dict(doc))
    return {'token': token, 'ttl_minutes': min(int(req.ttl_minutes), 120),
            'url': f'/c/passbook?token={token}'}


class ExchangeRequest(BaseModel):
    token: str


@router.post("/exchange")
async def exchange_magic_link(req: ExchangeRequest):
    """One-time exchange of a magic link token for a short customer session."""
    import hashlib
    token_hash = hashlib.sha256(req.token.strip().encode()).hexdigest()
    doc = await db.magic_links.find_one({'token_hash': token_hash}, {'_id': 0})
    if not doc or doc.get('used') or doc.get('revoked'):
        raise AppError('This link is no longer valid. Please sign in with your mobile number.',
                       400, 'link_invalid',
                       'ही लिंक आता वैध नाही. कृपया मोबाईल नंबरने साइन इन करा.')
    if doc['expires_at'] < datetime.now(timezone.utc).timestamp():
        raise AppError('This link has expired. Please sign in with your mobile number.',
                       400, 'link_expired',
                       'ही लिंक कालबाह्य झाली आहे. कृपया मोबाईल नंबरने साइन इन करा.')
    await db.magic_links.update_one({'token_hash': token_hash},
                                    {'$set': {'used': True, 'used_at': _now()}})
    token = create_access_token(None, scope='portal', customer_id=doc['customer_id'])
    return {'token': token, 'customer_id': doc['customer_id']}


# ---------------------------------------------------------------------------
# QR image (opaque token only — never encodes phone, bills or balances)
# ---------------------------------------------------------------------------
@router.get("/qr.png")
async def qr_image(token: str):
    import io

    import qrcode
    from fastapi.responses import Response

    if not token or len(token) > 64:
        raise NotFound('QR not found.', 'QR सापडला नाही.')
    cust = await db.customers.find_one({'qr_token': token}, {'_id': 0, 'nm_id': 1})
    if not cust:
        raise NotFound('QR not found.', 'QR सापडला नाही.')
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(token)
    qr.make(fit=True)
    img = qr.make_image(fill_color='black', back_color='white')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return Response(content=buf.getvalue(), media_type='image/png',
                    headers={'Cache-Control': 'private, max-age=3600'})
