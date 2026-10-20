"""My Stores — the customer's personal shopping map (foundational layer).

Two kinds of records, ALWAYS labelled and never mixed:
  * state 'added'     — customer-entered store (source: customer_added)
  * state 'connected' — matched to a NafaMitra partner shop (verified data)

Manual purchase entries are the customer's own records; verified totals come
from invoices / shop links. Connection requires an explicit customer-confirmed
shop choice (no silent name-based merging).
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import require_business, require_portal
from database import db
from entitlements import check_store_activation
from errors import AppError, NotFound
from phones import normalize_phone
from routes.customer_portal_routes import _resolve_profile_ids, _shop_name

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class StoreIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    category: str | None = Field(default=None, max_length=60)
    purchase_amount_paise: int | None = Field(default=None, ge=0)
    purchase_date: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=500)


class ConnectIn(BaseModel):
    shop_id: str = Field(min_length=1, max_length=64)
    confirm: bool = False


async def _verify_row(row: dict) -> dict:
    """Attach verified partner data to a connected store row."""
    shop_id = row.get('matched_shop_id')
    if not shop_id:
        return row
    shop = await db.businesses.find_one(
        {'id': shop_id}, {'_id': 0, 'id': 1, 'name': 1, 'category': 1,
                          'city': 1, 'location': 1}) or {}
    if not shop:
        row['state'] = 'added'
        row['matched_shop_id'] = None
        return row
    link = await db.shop_customers.find_one(
        {'shop_id': shop_id, 'customer_id': row['customer_id']},
        {'_id': 0, 'purchase_count': 1, 'total_spend_paise': 1,
         'first_purchase_at': 1, 'last_purchase_at': 1, 'status': 1}) or {}
    loyalty = await db.loyalty_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': row['customer_id']},
        {'_id': 0, 'balance': 1}) or {}
    last_bills = await db.invoices.find(
        {'shop_id': shop_id, 'customer_id': row['customer_id'],
         'status': 'ACTIVE'},
        {'_id': 0, 'created_at': 1}).sort('created_at', -1).limit(1).to_list(1)
    last_bill = last_bills[0] if last_bills else {}
    discount = 0
    async for b in db.invoices.find(
            {'shop_id': shop_id, 'customer_id': row['customer_id'],
             'status': 'ACTIVE'},
            {'_id': 0, 'discount_paise': 1}):
        discount += int(b.get('discount_paise') or 0)
    row['state'] = 'connected'
    row['verified'] = {
        'shop_name': shop.get('name'),
        'category': shop.get('category'),
        'city': shop.get('city') or shop.get('location'),
        'purchase_count': int(link.get('purchase_count') or 0),
        'total_spend_paise': int(link.get('total_spend_paise') or 0),
        'discount_paise': discount,
        'dhanlabh_points': int(loyalty.get('balance') or 0),
        'last_purchase_at': last_bill.get('created_at') or link.get('last_purchase_at'),
        'linked': link.get('status') == 'active',
    }
    return row


async def _suggest_partner(store: dict) -> dict:
    """Reliable match candidates only: phone match, or shops already linked
    to this customer. Never silent auto-merge on name similarity."""
    if store.get('matched_shop_id'):
        return {}
    phone = normalize_phone(store.get('phone'))
    if phone:
        # users/businesses store the 10-digit normalized form
        shop = await db.businesses.find_one(
            {'phone': phone}, {'_id': 0, 'id': 1, 'name': 1, 'category': 1})
        if shop:
            return {'suggested_shop_id': shop['id'],
                    'suggested_shop_name': shop.get('name'),
                    'match_reason': 'phone'}
    links = await db.shop_customers.find(
        {'customer_id': store['customer_id'], 'status': 'active'},
        {'_id': 0, 'shop_id': 1}).to_list(100)
    for link in links:
        name = (await _shop_name(link['shop_id']) or '').strip().lower()
        if name and name == (store.get('name') or '').strip().lower():
            return {'suggested_shop_id': link['shop_id'],
                    'suggested_shop_name': await _shop_name(link['shop_id']),
                    'match_reason': 'linked_shop'}
    return {}


def _public(row: dict) -> dict:
    row.pop('_id', None)
    row.pop('customer_id', None)
    return row


# ---------------------------------------------------------------- customer
@router.get('')
async def list_stores(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        return {'stores': [], 'activation': {'count': 0, 'target': 5,
                                             'qualified': False, 'claimed': False,
                                             'entitlements': []}}
    rows = await db.my_stores.find(
        {'customer_id': {'$in': ids}, 'deleted_at': None},
        {'_id': 0}).sort('created_at', -1).to_list(200)
    out = []
    for r in rows:
        row = await _verify_row(r)
        row.update(await _suggest_partner(row))
        out.append(_public(row))
    activation = await check_store_activation(ids[0], len(out))
    return {'stores': out, 'activation': activation}


@router.get('/activation')
async def activation_status(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        return {'count': 0, 'target': 5, 'qualified': False, 'claimed': False,
                'entitlements': []}
    n = await db.my_stores.count_documents(
        {'customer_id': {'$in': ids}, 'deleted_at': None})
    return await check_store_activation(ids[0], n)


@router.post('')
async def add_store(req: StoreIn, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    phone = normalize_phone(req.phone) if req.phone else None
    doc = {
        'id': str(uuid.uuid4()),
        'customer_id': ids[0],
        'name': req.name.strip(),
        'phone': (req.phone or '').strip() or None,
        'phone_normalized': phone,
        'category': req.category,
        'purchase_amount_paise': int(req.purchase_amount_paise or 0),
        'purchase_date': req.purchase_date,
        'notes': req.notes,
        'matched_shop_id': None,
        'source': 'customer_added',
        'created_at': _now(),
        'deleted_at': None,
    }
    await db.my_stores.insert_one(dict(doc))
    activation = await check_store_activation(ids[0],
                                              await db.my_stores.count_documents(
                                                  {'customer_id': ids[0],
                                                   'deleted_at': None}))
    doc.pop('_id', None)
    return {'store': _public(dict(doc)), 'activation': activation}


@router.post('/{store_id}/connect')
async def connect_store(store_id: str, req: ConnectIn,
                        payload: dict = Depends(require_portal)):
    """Customer confirms a partner match — explicit, never automatic."""
    if not req.confirm:
        raise AppError('Confirm the store connection to continue.',
                       400, 'confirm_required',
                       'स्टोअर जोडणी पक्की करण्यासाठी पुष्टी करा.')
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    store = await db.my_stores.find_one(
        {'id': store_id, 'customer_id': {'$in': ids}, 'deleted_at': None})
    if not store:
        raise NotFound('Store not found.', 'दुकान सापडले नाही.')
    shop = await db.businesses.find_one({'id': req.shop_id}, {'_id': 0, 'id': 1})
    if not shop:
        raise NotFound('Shop not found.', 'दुकान सापडले नाही.')
    await db.my_stores.update_one(
        {'id': store_id},
        {'$set': {'matched_shop_id': req.shop_id, 'state': 'connected',
                  'connected_at': _now()}})
    # make sure the verified relationship exists (join partner ecosystem)
    try:
        from identity import ensure_shop_link
        customer = await db.customers.find_one({'id': ids[0]}, {'_id': 0})
        if customer:
            await ensure_shop_link(req.shop_id, customer,
                                   customer.get('phone_normalized'))
    except Exception:
        pass  # link is a convenience; connection state is what we show
    updated = await db.my_stores.find_one({'id': store_id}, {'_id': 0})
    row = await _verify_row(dict(updated))
    row.update(await _suggest_partner(row))
    activation = await check_store_activation(
        ids[0], await db.my_stores.count_documents(
            {'customer_id': ids[0], 'deleted_at': None}))
    return {'store': _public(row), 'activation': activation}


@router.delete('/{store_id}')
async def remove_store(store_id: str, payload: dict = Depends(require_portal)):
    """Soft delete — manual purchase entries are customer financial records."""
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    res = await db.my_stores.update_one(
        {'id': store_id, 'customer_id': {'$in': ids}, 'deleted_at': None},
        {'$set': {'deleted_at': _now()}})
    if res.matched_count == 0:
        raise NotFound('Store not found.', 'दुकान सापडले नाही.')
    return {'removed': True, 'store_id': store_id}


# --------------------------------------------------------------- retailer
@router.get('/demand-signals')
async def demand_signals(user: dict = Depends(require_business)):
    """Aggregate-only acquisition signal: how many customers listed THIS
    shop in My Stores. No customer names, phones, spending, or goals."""
    shop_id = user['shop_id']
    shop = await db.businesses.find_one({'id': shop_id},
                                         {'_id': 0, 'phone': 1}) or {}
    clauses = [{'matched_shop_id': shop_id}]
    owner_phone = normalize_phone(shop.get('phone'))
    if owner_phone:
        clauses.append({'phone_normalized': owner_phone})
    rows = await db.my_stores.find(
        {'$or': clauses, 'deleted_at': None},
        {'_id': 0, 'customer_id': 1, 'matched_shop_id': 1}).to_list(5000)
    customers = {r['customer_id'] for r in rows}
    connected = {r['customer_id'] for r in rows if r.get('matched_shop_id')}
    return {
        'interest_count': len(customers),
        'connected_count': len(connected),
        'scope': 'aggregate_only',
    }
