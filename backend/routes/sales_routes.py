"""Billing routes: create (quick / itemised), list, receipt, void.

Kept under /api/sales for compatibility with the existing frontend contract,
served from the new invoice ledger.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from audit import log_action
from auth import require_business, require_role
from billing import create_invoice, void_invoice
from database import db
from errors import AppError, NotFound
from money import fmt, to_paise

router = APIRouter()


class ItemIn(BaseModel):
    product_id: Optional[str] = None
    name: Optional[str] = None
    quantity: int = 1
    unit_price: Optional[float] = None
    discount: Optional[float] = 0


class CreateBill(BaseModel):
    customer_id: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_name: Optional[str] = None
    mode: Optional[str] = None  # 'quick' | 'items'
    amount: Optional[float] = None
    items: Optional[List[ItemIn]] = None
    discount: Optional[float] = 0
    payment_mode: Optional[str] = 'cash'
    paid_amount: Optional[float] = None
    loyalty_redeem_points: Optional[int] = 0
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None


@router.get("")
async def list_bills(page: int = 1, limit: int = Query(20, le=100),
                     customer_id: Optional[str] = None,
                     status: Optional[str] = None,
                     user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    query: dict = {'shop_id': shop_id}
    if customer_id:
        query['customer_id'] = customer_id
    if status in ('ACTIVE', 'VOIDED'):
        query['status'] = status
    total = await db.invoices.count_documents(query)
    skip = (page - 1) * limit
    invoices = await db.invoices.find(query, {'_id': 0}).sort(
        'created_at', -1).skip(skip).limit(limit).to_list(limit)

    # lightweight customer join for list rendering
    ids = {i.get('customer_id') for i in invoices if i.get('customer_id')}
    customers = {}
    if ids:
        docs = await db.customers.find({'id': {'$in': list(ids)}},
                                       {'_id': 0, 'id': 1, 'nm_id': 1, 'name': 1, 'phone': 1}).to_list(len(ids))
        customers = {c['id']: c for c in docs}
    for inv in invoices:
        cust = customers.get(inv.get('customer_id'))
        if cust:
            inv['customer'] = {'id': cust['id'], 'nm_id': cust.get('nm_id'),
                               'name': cust.get('name'), 'phone': cust.get('phone')}
    return {'bills': invoices, 'total': total, 'page': page,
            'pages': max(1, (total + limit - 1) // limit)}


@router.post("")
async def post_bill(req: CreateBill, user: dict = Depends(require_business)):
    payload = req.model_dump(exclude_none=True)
    if not payload.get('items') and payload.get('amount') is None and not payload.get('customer_phone'):
        pass
    invoice = await create_invoice(user['shop_id'], user, payload)
    await log_action(user['shop_id'], user['user_id'], 'bill_created', 'invoice',
                     invoice['id'], {
                         'invoice_number': invoice['invoice_number'],
                         'amount_paise': invoice['total_paise'],
                         'payment_mode': invoice.get('payment_mode'),
                         'customer_id': invoice.get('customer_id'),
                     })
    return invoice


@router.get("/summary/{bill_id}")
async def bill_summary(bill_id: str, user: dict = Depends(require_business)):
    return await get_bill(bill_id, user)


@router.get("/{bill_id}")
async def get_bill(bill_id: str, user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    invoice = await db.invoices.find_one(
        {'$or': [{'id': bill_id}, {'invoice_number': bill_id}],
         'shop_id': shop_id}, {'_id': 0})
    if invoice:
        return invoice
    legacy = await db.sales.find_one(
        {'$or': [{'id': bill_id}, {'invoice_number': bill_id}],
         'business_id': shop_id}, {'_id': 0})
    if legacy:
        legacy['legacy'] = True
        return legacy
    raise NotFound('Bill not found.', 'बिल सापडले नाही.')


@router.post("/{bill_id}/void")
async def void_bill(bill_id: str, body: Optional[dict] = None,
                    user: dict = Depends(require_role('manager'))):
    reason = (body or {}).get('reason')
    invoice = await void_invoice(user['shop_id'], user, bill_id, reason)
    await log_action(user['shop_id'], user['user_id'], 'bill_voided', 'invoice',
                     invoice['id'], {'invoice_number': invoice['invoice_number'],
                                     'reason': reason})
    return invoice


# ---------------------------------------------------------------------------
# public receipt (share token — view-only, no session, no sensitive data)
# ---------------------------------------------------------------------------
@router.get("/public/receipt/{token}", include_in_schema=True)
async def public_receipt(token: str):
    from fastapi.responses import JSONResponse
    invoice = await db.invoices.find_one({'share_token': token}, {'_id': 0})
    if not invoice:
        legacy = await db.sales.find_one({'share_token': token}, {'_id': 0})
        if not legacy:
            raise NotFound('Receipt not found.', 'रसीद सापडली नाही.')
        invoice = legacy
    shop = await db.businesses.find_one({'id': invoice.get('shop_id') or invoice.get('business_id')},
                                        {'_id': 0, 'name': 1, 'phone': 1, 'location': 1, 'address': 1})
    items = []
    for it in invoice.get('items', []):
        items.append({
            'name': it.get('product_name') or it.get('name'),
            'quantity': it.get('quantity'),
            'unit_price': it.get('unit_price_paise') if 'unit_price_paise' in it else it.get('unit_price'),
            'total': it.get('total_paise') if 'total_paise' in it else it.get('total'),
        })
    customer = None
    if invoice.get('customer_id'):
        c = await db.customers.find_one({'id': invoice['customer_id']},
                                        {'_id': 0, 'name': 1, 'phone': 1, 'nm_id': 1})
        if c:
            customer = {'name': c.get('name'), 'nm_id': c.get('nm_id'),
                        'phone_masked': (c.get('phone') or '')[:2] + 'XXXXX' + (c.get('phone') or '')[-3:]
                        if c.get('phone') else None}
    return {
        'shop': {'name': (shop or {}).get('name'), 'location': (shop or {}).get('location') or (shop or {}).get('address')},
        'invoice_number': invoice.get('invoice_number'),
        'status': invoice.get('status', 'ACTIVE'),
        'created_at': invoice.get('created_at'),
        'customer': customer,
        'items': items,
        'subtotal': invoice.get('subtotal_paise', invoice.get('subtotal')),
        'discount': invoice.get('discount_paise', invoice.get('discount')),
        'total': invoice.get('total_paise', invoice.get('total_amount')),
        'payment_mode': invoice.get('payment_mode'),
        'payment_status': invoice.get('payment_status'),
        'loyalty_earned_points': invoice.get('loyalty_earned_points') or 0,
        'loyalty_redeemed_points': invoice.get('loyalty_redeemed_points') or 0,
        'loyalty_redeemed_value': invoice.get('loyalty_redeemed_value_paise', 0),
        'paise_fields': True if 'total_paise' in invoice else False,
    }
