"""Merchant-facing customer routes (shop-scoped).

Every query is filtered by the shop id resolved & authorised server-side —
a shop can only ever see its own relationship with a customer, never another
shop's bills, credit, loyalty or notes.
"""
import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from audit import log_action
from auth import require_business, require_role
from database import db
from errors import AppError, NotFound
from identity import (ensure_global_customer, ensure_shop_link,
                      get_shop_link, resolve_for_shop)
from money import to_paise
from phones import normalize_phone

router = APIRouter()

SEGMENTS = ('all', 'new', 'repeat', 'high_value', 'credit_due', 'inactive', 'requirement')


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _link_search_clauses(query: str) -> list:
    """Search clauses over shop_customers: display name, digits, exact phone."""
    q = query.strip()
    digits = re.sub(r'\D', '', q)
    clauses = [{'display_name': {'$regex': q, '$options': 'i'}}]
    if digits:
        clauses.append({'normalized_phone': {'$regex': digits}})
    normalized = normalize_phone(q)
    if normalized:
        clauses.append({'normalized_phone': normalized})
    return clauses


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[str] = None
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[str] = None
    notes: Optional[str] = None  # shop-private note


def _shop_view(customer: dict, link: dict | None, extra: dict | None = None) -> dict:
    """Customer as seen by one shop: only this shop's relationship data."""
    link = link or {}
    out = {
        'id': customer['id'],
        'customer_id': customer['id'],
        'nm_id': customer.get('nm_id'),
        'name': link.get('display_name') or customer.get('name'),
        'phone': customer.get('phone'),
        'email': customer.get('email'),
        'birthday': customer.get('birthday'),
        'created_at': customer.get('created_at'),
        'customer_since': link.get('created_at') or customer.get('created_at'),
        'is_active': link.get('status', 'active') == 'active',
        # shop-scoped numbers only:
        'purchase_count': link.get('purchase_count', 0),
        'total_spend_paise': link.get('total_spend_paise', 0),
        'last_purchase_at': link.get('last_purchase_at'),
        'first_purchase_at': link.get('first_purchase_at'),
        'notes': link.get('notes'),
        'avg_bill_paise': (link.get('total_spend_paise', 0) // link['purchase_count'])
        if link.get('purchase_count') else 0,
    }
    if extra:
        out.update(extra)
    return out


async def _shop_extras(shop_id: str, customer_id: str) -> dict:
    credit = await db.credit_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0}) or {}
    loyalty = await db.loyalty_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0}) or {}
    return {
        'credit_due_paise': credit.get('outstanding_paise', 0),
        'loyalty_points': loyalty.get('balance', 0),
    }


# ---------------------------------------------------------------------------
# list / search
# ---------------------------------------------------------------------------
@router.get("")
async def list_customers(
    search: Optional[str] = None,
    segment: str = 'all',
    page: int = 1,
    limit: int = Query(20, le=100),
    user: dict = Depends(require_business),
):
    shop_id = user['shop_id']
    if segment not in SEGMENTS:
        raise AppError('Unknown customer segment.', 400, 'bad_segment')

    # base: customers linked to THIS shop only
    link_query: dict = {'shop_id': shop_id, 'status': 'active'}
    if search:
        link_query['$or'] = _link_search_clauses(search)

    links = await db.shop_customers.find(link_query, {'_id': 0}).to_list(2000)

    # deterministic segment definitions
    if segment == 'credit_due':
        pass  # filtered after credit lookup below
    inactive_cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    # join minimal customer docs
    customer_ids = [l['customer_id'] for l in links]
    customers = {}
    if customer_ids:
        docs = await db.customers.find({'id': {'$in': customer_ids}}, {'_id': 0}).to_list(2000)
        customers = {c['id']: c for c in docs}

    rows = []
    for link in links:
        cust = customers.get(link['customer_id'])
        if not cust:
            continue
        extras = await _shop_extras(shop_id, cust['id'])
        row = _shop_view(cust, link, extras)
        # segment flags
        row['is_repeat'] = row['purchase_count'] >= 2
        row['is_new'] = row['purchase_count'] <= 1
        row['is_inactive'] = (not row['last_purchase_at'] or row['last_purchase_at'] < inactive_cutoff)
        rows.append(row)

    req_cids: set = set()
    if segment == 'requirement':
        link_ids = {l['customer_id'] for l in links}
        reqs = await db.requirements.find(
            {'status': 'open'}, {'_id': 0, 'customer_id': 1, 'shop_id': 1}).to_list(1000)
        req_cids = {r['customer_id'] for r in reqs
                    if r.get('shop_id') == shop_id
                    or (r.get('shop_id') is None and r.get('customer_id') in link_ids)}

    def matches(r):
        if segment == 'requirement':
            return r.get('id') in req_cids
        if segment == 'new':
            return r['is_new']
        if segment == 'repeat':
            return r['is_repeat']
        if segment == 'high_value':
            return r['total_spend_paise'] >= to_paise(5000)
        if segment == 'credit_due':
            return r['credit_due_paise'] > 0
        if segment == 'inactive':
            return r['is_inactive']
        return True

    rows = [r for r in rows if matches(r)]
    rows.sort(key=lambda r: r['name'] or '')
    total = len(rows)
    start = (page - 1) * limit
    pages = max(1, (total + limit - 1) // limit)
    return {'customers': rows[start:start + limit], 'total': total,
            'page': page, 'pages': pages, 'segment': segment}


@router.get("/search")
async def search_customers(q: str = Query(..., min_length=1),
                           user: dict = Depends(require_business)):
    """Fast server-side lookup by phone, name or NM id (never ships full list)."""
    shop_id = user['shop_id']
    query = q.strip()
    normalized = normalize_phone(query)

    link_clauses = _link_search_clauses(query)
    if query.upper().startswith('NM-'):
        cust = await db.customers.find_one({'nm_id': query.upper()}, {'_id': 0})
        if cust:
            link = await get_shop_link(shop_id, cust['id'])
            if link:
                return [_shop_view(cust, link, await _shop_extras(shop_id, cust['id']))]
        return []

    links = await db.shop_customers.find(
        {'shop_id': shop_id, 'status': 'active', '$or': link_clauses},
        {'_id': 0}).to_list(20)
    results = []
    for link in links:
        cust = await db.customers.find_one({'id': link['customer_id']}, {'_id': 0})
        if cust:
            results.append(_shop_view(cust, link, await _shop_extras(shop_id, cust['id'])))
    return results


class ResolveRequest(BaseModel):
    phone: Optional[str] = None
    nm_id: Optional[str] = None
    qr_token: Optional[str] = None
    name: Optional[str] = None


@router.post("/resolve")
async def resolve_customer(req: ResolveRequest, user: dict = Depends(require_business)):
    """Resolve a customer for billing: phone / NM id / QR token.

    Creates the global identity + shop link when the phone is new (the
    documented auto-create behaviour during billing).
    """
    shop_id = user['shop_id']
    customer = None
    if req.qr_token:
        customer = await db.customers.find_one({'qr_token': req.qr_token.strip()}, {'_id': 0})
        if not customer:
            raise NotFound('QR not recognised. Enter the mobile number instead.',
                           'QR ओळखला नाही. मोबाईल नंबर टाका.')
    elif req.nm_id:
        customer = await db.customers.find_one({'nm_id': req.nm_id.strip().upper()}, {'_id': 0})
        if not customer:
            raise NotFound('No customer with this ID.', 'या ID चा ग्राहक सापडला नाही.')
    elif req.phone:
        normalized = normalize_phone(req.phone)
        if not normalized:
            raise AppError('Please enter a valid mobile number.', 400, 'invalid_phone',
                           'कृपया वैध मोबाईल नंबर भरा.')
        customer = await resolve_for_shop(shop_id, phone=normalized,
                                          name=req.name, create_missing=True)
    else:
        raise AppError('Enter a mobile number, customer ID or scan a QR.',
                       400, 'resolve_required',
                       'मोबाईल नंबर, ग्राहक ID किंवा QR द्या.')

    link = await get_shop_link(shop_id, customer['id'])
    return _shop_view(customer, link, await _shop_extras(shop_id, customer['id']))


@router.post("/qr/resolve")
async def resolve_qr(req: ResolveRequest, user: dict = Depends(require_business)):
    """Alias used by the scanner UI."""
    return await resolve_customer(req, user)


# ---------------------------------------------------------------------------
# create / update
# ---------------------------------------------------------------------------
@router.post("")
async def create_customer(req: CustomerCreate, user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    normalized = normalize_phone(req.phone) if req.phone else None
    if req.phone and not normalized:
        raise AppError('Please enter a valid 10-digit mobile number.', 400,
                       'invalid_phone', 'कृपया वैध 10 अंकी मोबाईल नंबर भरा.')

    if normalized:
        existing = await db.customers.find_one({'phone_normalized': normalized}, {'_id': 0})
        if existing:
            link = await get_shop_link(shop_id, existing['id'])
            if link:
                raise AppError('This customer already exists in your shop.',
                               409, 'customer_exists',
                               'हा ग्राहक तुमच्या दुकानात आधीच आहे.')
            # known globally (maybe at other shops) — just link to this shop
            await ensure_shop_link(shop_id, existing, source='manual')
            link = await get_shop_link(shop_id, existing['id'])
            await log_action(shop_id, user['user_id'], 'customer_created', 'customer',
                             existing['id'])
            return _shop_view(existing, link, await _shop_extras(shop_id, existing['id']))

    customer = await ensure_global_customer(
        name=req.name, phone=normalized, email=req.email, birthday=req.birthday)
    link = await ensure_shop_link(shop_id, customer, source='manual')
    if req.notes:
        await db.shop_customers.update_one(
            {'shop_id': shop_id, 'customer_id': customer['id']},
            {'$set': {'notes': req.notes}})
        link = await get_shop_link(shop_id, customer['id'])
    await log_action(shop_id, user['user_id'], 'customer_created', 'customer', customer['id'])
    return _shop_view(customer, link, await _shop_extras(shop_id, customer['id']))


@router.get("/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    customer = await db.customers.find_one(
        {'$or': [{'id': customer_id}, {'nm_id': customer_id.upper()}]}, {'_id': 0})
    if not customer:
        raise NotFound('Customer not found.', 'ग्राहक सापडला नाही.')
    link = await get_shop_link(shop_id, customer['id'])
    if not link:
        # another shop's customer — do not leak existence details beyond 404
        raise NotFound('Customer not found in your shop.', 'तुमच्या दुकानात हा ग्राहक नाही.')

    invoices = await db.invoices.find(
        {'shop_id': shop_id, 'customer_id': customer['id']},
        {'_id': 0}).sort('created_at', -1).to_list(50)
    legacy_sales = await db.sales.find(
        {'business_id': shop_id, 'customer_id': customer['id']},
        {'_id': 0}).sort('created_at', -1).to_list(20)
    credit_txs = await db.credit_transactions.find(
        {'shop_id': shop_id, 'customer_id': customer['id']},
        {'_id': 0}).sort('created_at', -1).to_list(50)
    loyalty_txs = await db.loyalty_transactions.find(
        {'shop_id': shop_id, 'customer_id': customer['id']},
        {'_id': 0}).sort('created_at', -1).to_list(50)

    return {
        'customer': _shop_view(customer, link, await _shop_extras(shop_id, customer['id'])),
        'bills': invoices,
        'legacy_sales': legacy_sales,
        'credit_transactions': credit_txs,
        'loyalty_transactions': loyalty_txs,
    }


@router.put("/{customer_id}")
async def update_customer(customer_id: str, req: CustomerUpdate,
                          user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    customer = await db.customers.find_one(
        {'$or': [{'id': customer_id}, {'nm_id': customer_id.upper()}]}, {'_id': 0})
    if not customer:
        raise NotFound('Customer not found.', 'ग्राहक सापडला नाही.')
    link = await get_shop_link(shop_id, customer['id'])
    if not link:
        raise NotFound('Customer not found in your shop.', 'तुमच्या दुकानात हा ग्राहक नाही.')

    # global fields (name / email / birthday) vs shop-private notes
    global_updates = {}
    if req.name is not None and req.name.strip():
        global_updates['name'] = req.name.strip()
    if req.email is not None:
        global_updates['email'] = req.email or None
    if req.birthday is not None:
        global_updates['birthday'] = req.birthday or None
    if global_updates:
        global_updates['updated_at'] = _now()
        await db.customers.update_one({'id': customer['id']}, {'$set': global_updates})
    if req.notes is not None:
        await db.shop_customers.update_one(
            {'shop_id': shop_id, 'customer_id': customer['id']},
            {'$set': {'notes': req.notes, 'updated_at': _now()}})
    await log_action(shop_id, user['user_id'], 'customer_updated', 'customer', customer['id'])
    updated = await db.customers.find_one({'id': customer['id']}, {'_id': 0})
    link = await get_shop_link(shop_id, customer['id'])
    return _shop_view(updated, link, await _shop_extras(shop_id, customer['id']))


@router.delete("/{customer_id}")
async def remove_customer(customer_id: str, user: dict = Depends(require_role('manager'))):
    """Deactivate THIS SHOP's relationship only — never the global identity."""
    shop_id = user['shop_id']
    result = await db.shop_customers.update_one(
        {'shop_id': shop_id, 'customer_id': customer_id},
        {'$set': {'status': 'removed', 'updated_at': _now()}})
    if result.matched_count == 0:
        raise NotFound('Customer not found in your shop.', 'तुमच्या दुकानात हा ग्राहक नाही.')
    await log_action(shop_id, user['user_id'], 'customer_removed', 'customer', customer_id)
    return {'success': True}
