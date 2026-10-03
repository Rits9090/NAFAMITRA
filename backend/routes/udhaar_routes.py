"""Credit (उधारी) routes — immutable ledger, shop-scoped."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from audit import log_action
from auth import require_business, require_role
from billing import add_credit_tx
from database import db
from errors import AppError, NotFound
from money import fmt, to_paise

router = APIRouter()


class CreditCreate(BaseModel):
    customer_id: str
    amount: float = Field(gt=0)
    description: Optional[str] = 'Udhaar given'


class PaymentRecord(BaseModel):
    amount: float = Field(gt=0)
    payment_mode: str = 'cash'
    notes: Optional[str] = None
    customer_id: Optional[str] = None  # used when paying by account alias
    idempotency_key: Optional[str] = None


@router.get("")
async def list_credit(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    accounts = await db.credit_accounts.find({'shop_id': shop_id}, {'_id': 0}).to_list(1000)
    total_outstanding = 0
    rows = []
    for acc in accounts:
        if acc.get('outstanding_paise', 0) <= 0:
            continue
        customer = await db.customers.find_one({'id': acc['customer_id']}, {'_id': 0}) or {}
        link = await db.shop_customers.find_one(
            {'shop_id': shop_id, 'customer_id': acc['customer_id']}, {'_id': 0}) or {}
        last_tx = await db.credit_transactions.find(
            {'shop_id': shop_id, 'customer_id': acc['customer_id']},
            {'_id': 0}).sort('created_at', -1).limit(1).to_list(1)
        total_outstanding += acc['outstanding_paise']
        rows.append({
            'customer_id': acc['customer_id'],
            'nm_id': customer.get('nm_id'),
            'name': link.get('display_name') or customer.get('name'),
            'phone': customer.get('phone'),
            'outstanding_paise': acc['outstanding_paise'],
            'total_credit_paise': acc.get('total_credit_paise', 0),
            'total_paid_paise': acc.get('total_paid_paise', 0),
            'last_transaction_at': last_tx[0]['created_at'] if last_tx else acc.get('updated_at'),
        })
    rows.sort(key=lambda r: -r['outstanding_paise'])
    return {'udhaars': rows, 'accounts': rows, 'total_outstanding': total_outstanding,
            'total_outstanding_paise': total_outstanding,
            'total_outstanding_fmt': fmt(total_outstanding)}


@router.post("")
async def create_credit(req: CreditCreate, user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    customer = await db.customers.find_one({'id': req.customer_id}, {'_id': 0})
    if not customer:
        raise NotFound('Customer not found.', 'ग्राहक सापडला नाही.')
    link = await db.shop_customers.find_one(
        {'shop_id': shop_id, 'customer_id': req.customer_id}, {'_id': 0})
    if not link:
        raise NotFound('Customer not found in your shop.', 'तुमच्या दुकानात हा ग्राहक नाही.')
    amount = to_paise(req.amount)
    if amount <= 0:
        raise AppError('Amount must be greater than zero.', 400, 'bad_amount',
                       'रक्कम शून्यपेक्षा जास्त असावी.')
    tx = await add_credit_tx(shop_id, req.customer_id, 'CREDIT', amount,
                             actor_id=user['user_id'], note=req.description)
    await log_action(shop_id, user['user_id'], 'credit_created', 'customer',
                     req.customer_id, {'amount_paise': amount})
    account = await db.credit_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': req.customer_id}, {'_id': 0})
    return {'account': account, 'transaction': tx,
            'name': link.get('display_name') or customer.get('name'),
            'customer_id': req.customer_id, 'nm_id': customer.get('nm_id'),
            'phone': customer.get('phone')}


@router.post("/{customer_id}/payment")
async def record_payment(customer_id: str, req: PaymentRecord,
                         user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    account = await db.credit_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})
    if not account:
        raise NotFound('No credit account for this customer.', 'हा उधारी खाते सापडले नाही.')
    amount = to_paise(req.amount)
    if amount <= 0:
        raise AppError('Amount must be greater than zero.', 400, 'bad_amount',
                       'रक्कम शून्यपेक्षा जास्त असावी.')
    if amount > account['outstanding_paise']:
        raise AppError(
            f'Payment {fmt(amount)} is more than outstanding {fmt(account["outstanding_paise"])}.',
            400, 'overpayment',
            f'भरलेली रक्कम बाकी रकमेपेक्षा जास्त आहे.')
    # idempotency for double-tapped payments
    if req.idempotency_key:
        try:
            await db.idempotency_keys.insert_one({
                'shop_id': shop_id, 'key': f'credit-payment:{req.idempotency_key}',
                'fingerprint': f'{customer_id}:{amount}', 'status': 'done',
            })
        except Exception:
            existing = await db.idempotency_keys.find_one(
                {'shop_id': shop_id, 'key': f'credit-payment:{req.idempotency_key}'}, {'_id': 0})
            if existing and existing.get('fingerprint') == f'{customer_id}:{amount}':
                return {'success': True, 'duplicate': True,
                        'account': await db.credit_accounts.find_one(
                            {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})}
            raise AppError('This payment is being processed.', 409, 'in_progress')

    tx = await add_credit_tx(shop_id, customer_id, 'PAYMENT', amount,
                             actor_id=user['user_id'],
                             payment_mode=req.payment_mode, note=req.notes)
    await log_action(shop_id, user['user_id'], 'credit_payment', 'customer',
                     customer_id, {'amount_paise': amount, 'payment_mode': req.payment_mode})
    account = await db.credit_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})
    return {'success': True, 'account': account, 'transaction': tx}


@router.get("/{customer_id}")
async def get_credit(customer_id: str, user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    link = await db.shop_customers.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})
    if not link:
        # no relationship in THIS shop → as if the customer does not exist here
        raise NotFound('No credit account for this customer.', 'हा उधारी खाते सापडले नाही.')
    account = await db.credit_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0}) or {
        'shop_id': shop_id, 'customer_id': customer_id, 'outstanding_paise': 0,
        'total_credit_paise': 0, 'total_paid_paise': 0}
    txs = await db.credit_transactions.find(
        {'shop_id': shop_id, 'customer_id': customer_id},
        {'_id': 0}).sort('created_at', -1).to_list(100)
    # legacy entries for history continuity
    legacy = await db.udhaar.find_one({'business_id': shop_id, 'customer_id': customer_id},
                                      {'_id': 0}) or None
    return {'account': account, 'transactions': txs, 'legacy': legacy}
