"""Customer identity service.

* Global customer identity keyed by UUID, discovered via normalised phone.
* ``nm_id`` (NM-XXXXXX) is the human-friendly public identifier.
* Every shop relationship lives in ``shop_customers`` — one customer can
  belong to many shops, and each shop only ever sees its own relationship.
"""
import logging
from datetime import datetime, timezone

from database import db
from errors import AppError, NotFound
from phones import generate_nm_id, new_id, new_token, normalize_phone

logger = logging.getLogger('nafamitra.identity')

MAX_ID_COLLISIONS = 6


async def _new_nm_id() -> str:
    for _ in range(MAX_ID_COLLISIONS):
        candidate = generate_nm_id()
        clash = await db.customers.find_one({'nm_id': candidate}, {'_id': 1})
        if not clash:
            return candidate
    raise AppError('Could not allocate a customer id. Please try again.', 500, 'id_alloc')


async def get_customer_by_phone(phone: str):
    normalized = normalize_phone(phone)
    if not normalized:
        return None
    return await db.customers.find_one({'phone_normalized': normalized}, {'_id': 0})


async def get_customer_by_id(customer_id: str):
    return await db.customers.find_one({'id': customer_id}, {'_id': 0})


async def ensure_global_customer(name: str = None, phone: str = None,
                                 email: str = None, birthday: str = None,
                                 user_id: str = None) -> dict:
    """Create or reuse the global customer identity for a phone number.

    A verified normalised phone is the only match signal — names are never
    used to merge identities.
    """
    normalized = normalize_phone(phone)
    existing = None
    if normalized:
        existing = await db.customers.find_one({'phone_normalized': normalized}, {'_id': 0})
    if existing:
        updates = {}
        if user_id and not existing.get('user_id'):
            # link login identity (first claim wins; conflicts are reviewed)
            link_claim = await db.customers.find_one({'user_id': user_id}, {'_id': 1})
            if not link_claim:
                updates['user_id'] = user_id
        if updates:
            updates['updated_at'] = _now()
            await db.customers.update_one({'id': existing['id']}, {'$set': updates})
            existing.update(updates)
        return existing

    doc = {
        'id': new_id(),
        'nm_id': await _new_nm_id(),
        'name': (name or '').strip() or 'NafaMitra Customer',
        'phone': normalized,
        'phone_normalized': normalized,
        'email': email,
        'birthday': birthday,
        'user_id': user_id,
        'qr_token': new_token(16),
        'is_active': True,
        'created_at': _now(),
        'updated_at': _now(),
    }
    try:
        await db.customers.insert_one(doc)
    except Exception:
        # unique index race on phone → reuse the winner
        if normalized:
            again = await db.customers.find_one({'phone_normalized': normalized}, {'_id': 0})
            if again:
                return again
        raise
    doc.pop('_id', None)
    return doc


async def ensure_shop_link(shop_id: str, customer: dict, normalized_phone: str = None,
                           source: str = 'manual') -> dict:
    """Attach a global customer to a shop (idempotent)."""
    link = await db.shop_customers.find_one(
        {'shop_id': shop_id, 'customer_id': customer['id']}, {'_id': 0})
    if link:
        return link
    link_doc = {
        'id': new_id(),
        'shop_id': shop_id,
        'customer_id': customer['id'],
        'normalized_phone': normalized_phone or customer.get('phone_normalized'),
        'display_name': customer.get('name'),
        'first_purchase_at': None,
        'last_purchase_at': None,
        'purchase_count': 0,
        'total_spend_paise': 0,
        'notes': None,
        'marketing_consent': False,
        'status': 'active',
        'source': source,
        'created_at': _now(),
    }
    try:
        await db.shop_customers.insert_one(link_doc)
    except Exception:
        existing = await db.shop_customers.find_one(
            {'shop_id': shop_id, 'customer_id': customer['id']}, {'_id': 0})
        if existing:
            return existing
        raise
    link_doc.pop('_id', None)
    return link_doc


async def resolve_for_shop(shop_id: str, *, phone: str = None, name: str = None,
                           customer_id: str = None, nm_id: str = None,
                           create_missing: bool = False,
                           user_id: str = None) -> dict | None:
    """Resolve (and optionally create) a customer inside a shop context."""
    customer = None
    if customer_id:
        customer = await get_customer_by_id(customer_id)
    elif nm_id:
        customer = await db.customers.find_one({'nm_id': nm_id.strip().upper()}, {'_id': 0})
    elif phone:
        customer = await get_customer_by_phone(phone)

    if customer and not create_missing:
        # ensure the relationship exists only when explicitly resolving in shop scope
        await ensure_shop_link(shop_id, customer)
        return customer

    if customer:
        await ensure_shop_link(shop_id, customer)
        return customer

    if not create_missing:
        return None

    customer = await ensure_global_customer(name=name, phone=phone, user_id=user_id)
    await ensure_shop_link(shop_id, customer)
    return customer


async def get_shop_link(shop_id: str, customer_id: str):
    return await db.shop_customers.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})


async def customer_profiles_for_user(user: dict) -> list[dict]:
    """All customer profiles this authenticated person owns (any shop)."""
    profiles = await db.customers.find(
        {'$or': [{'user_id': user['id']},
                 {'phone_normalized': user.get('phone_normalized')}] if user.get('phone_normalized')
        else [{'user_id': user['id']}]},
        {'_id': 0}).to_list(50)
    return profiles


async def shop_ids_for_customer(customer_id: str) -> list[str]:
    links = await db.shop_customers.find(
        {'customer_id': customer_id, 'status': 'active'}, {'_id': 0}).to_list(100)
    return [l['shop_id'] for l in links]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
