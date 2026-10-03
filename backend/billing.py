"""Billing domain service.

Financial rules (all arithmetic on integer paise):
* Invoice numbers come from an atomic per-shop monthly counter — two cashiers
  can never receive the same number.
* ``idempotency_keys`` makes double-tapping "Complete Bill" safe: the second
  request returns the first invoice instead of creating a duplicate.
* Credit and loyalty are immutable ledger transactions; the invoice stores
  enough to reverse everything on void.
* Point earning rule (documented, deterministic):
      points = floor(total_rupees / 100) * points_per_100
  e.g. ₹850 with 1 per ₹100 → 8 points (whole hundreds only).
"""
from datetime import datetime, timezone

from database import db
from errors import AppError, Forbidden, NotFound
from identity import ensure_global_customer, ensure_shop_link, get_shop_link
from money import (apply_discount, clamp_non_negative, fmt, split_payment,
                   to_paise)
from phones import new_id, new_token, normalize_phone

PAYMENT_MODES = ('cash', 'upi', 'card', 'credit')


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# invoice numbering & idempotency
# ---------------------------------------------------------------------------
async def next_invoice_number(shop_id: str) -> str:
    """Atomically reserve the next invoice number for this shop this month."""
    month = datetime.now(timezone.utc).strftime('%y%m')
    counter_id = f'inv:{shop_id}:{month}'
    doc = await db.counters.find_one_and_update(
        {'_id': counter_id},
        {'$inc': {'seq': 1}},
        upsert=True,
        return_document=True,  # ReturnDocument.AFTER == True in pymongo/mongomock
    )
    return f'INV-{month}-{doc["seq"]:04d}'


async def begin_idempotent(shop_id: str, key: str, request_fingerprint: str) -> dict | None:
    """Claim an idempotency key.

    Returns the previously completed invoice id when the same key replays,
    raises Conflict when the same key is reused with a different payload, and
    claims the key otherwise.
    """
    if not key:
        return None
    try:
        await db.idempotency_keys.insert_one({
            'shop_id': shop_id, 'key': key,
            'fingerprint': request_fingerprint,
            'status': 'in_progress', 'created_at': _now(),
        })
        return None
    except Exception:
        existing = await db.idempotency_keys.find_one({'shop_id': shop_id, 'key': key}, {'_id': 0})
        if existing and existing.get('fingerprint') != request_fingerprint:
            raise AppError('This request was already submitted with different details.',
                           409, 'idempotency_mismatch')
        if existing and existing.get('invoice_id'):
            invoice = await db.invoices.find_one({'id': existing['invoice_id']}, {'_id': 0})
            if invoice:
                return invoice
        if existing:
            raise AppError('A bill with this request is still being processed. Please wait.',
                           409, 'in_progress')
        raise


async def complete_idempotent(shop_id: str, key: str, invoice_id: str) -> None:
    if key:
        await db.idempotency_keys.update_one(
            {'shop_id': shop_id, 'key': key},
            {'$set': {'status': 'done', 'invoice_id': invoice_id}})


async def release_idempotent(shop_id: str, key: str) -> None:
    if key:
        await db.idempotency_keys.delete_one({'shop_id': shop_id, 'key': key})


# ---------------------------------------------------------------------------
# loyalty & credit helpers (shop scoped)
# ---------------------------------------------------------------------------
async def loyalty_settings(shop_id: str) -> dict:
    shop = await db.businesses.find_one({'id': shop_id}, {'_id': 0, 'settings': 1})
    s = (shop or {}).get('settings') or {}
    return {
        'points_per_100': int(s.get('loyalty_points_per_100', 1) or 0),
        'redemption_value_paise': int(s.get('redemption_value_paise',
                                            round(float(s.get('redemption_value', 0.1) or 0.1) * 100))),
        'enabled': bool(s.get('loyalty_enabled', True)),
        'prevent_below_min': bool(s.get('prevent_below_min', False)),
    }


def compute_earned_points(total_paise: int, points_per_100: int) -> int:
    if points_per_100 <= 0:
        return 0
    # total_paise // 10_000 == floor(total_rupees / 100) — whole ₹100 chunks only
    return int((max(0, int(total_paise)) // 10_000) * points_per_100)


async def get_or_create_loyalty_account(shop_id: str, customer_id: str) -> dict:
    account = await db.loyalty_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})
    if account:
        return account
    account = {
        'shop_id': shop_id, 'customer_id': customer_id,
        'balance': 0, 'earned_total': 0, 'redeemed_total': 0,
        'created_at': _now(), 'updated_at': _now(),
    }
    try:
        await db.loyalty_accounts.insert_one(account)
    except Exception:
        again = await db.loyalty_accounts.find_one(
            {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})
        if again:
            return again
        raise
    account.pop('_id', None)
    return account


async def add_loyalty_tx(shop_id: str, customer_id: str, tx_type: str, points: int,
                         invoice_id: str = None, actor_id: str = None,
                         note: str = None) -> dict:
    """Append-only loyalty ledger entry; updates the account balance."""
    if points == 0:
        return {'points': 0}
    account = await get_or_create_loyalty_account(shop_id, customer_id)
    if tx_type == 'EARN':
        delta = abs(int(points))
    elif tx_type == 'REDEEM':
        delta = -abs(int(points))
    elif tx_type in ('REVERSAL', 'ADJUSTMENT'):
        delta = int(points)  # caller passes the signed delta
    else:
        raise AppError('Unknown loyalty transaction type.', 500, 'bad_tx_type')
    new_balance = int(account['balance']) + delta
    if new_balance < 0:
        raise AppError('Not enough धनलाभ points for this action.',
                       400, 'insufficient_points',
                       'या कृतीसाठी पुरेशे धनलाभ पॉइंटस नाहीत.')
    await db.loyalty_accounts.update_one(
        {'shop_id': shop_id, 'customer_id': customer_id},
        {'$set': {'balance': new_balance, 'updated_at': _now()},
         '$inc': {'earned_total': delta if delta > 0 else 0,
                  'redeemed_total': -delta if delta < 0 else 0}})
    tx = {
        'id': new_id(), 'shop_id': shop_id, 'customer_id': customer_id,
        'type': tx_type, 'points': points, 'delta': delta,
        'balance_after': new_balance, 'invoice_id': invoice_id,
        'actor_id': actor_id, 'note': note, 'created_at': _now(),
    }
    await db.loyalty_transactions.insert_one(tx)
    tx.pop('_id', None)
    return tx


async def get_or_create_credit_account(shop_id: str, customer_id: str) -> dict:
    account = await db.credit_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})
    if account:
        return account
    account = {
        'shop_id': shop_id, 'customer_id': customer_id,
        'outstanding_paise': 0, 'total_credit_paise': 0, 'total_paid_paise': 0,
        'created_at': _now(), 'updated_at': _now(),
    }
    try:
        await db.credit_accounts.insert_one(account)
    except Exception:
        again = await db.credit_accounts.find_one(
            {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})
        if again:
            return again
        raise
    account.pop('_id', None)
    return account


async def add_credit_tx(shop_id: str, customer_id: str, tx_type: str, amount_paise: int,
                        invoice_id: str = None, actor_id: str = None,
                        payment_mode: str = None, note: str = None) -> dict:
    """Append-only credit ledger entry (CREDIT | PAYMENT | REVERSAL | ADJUSTMENT)."""
    if amount_paise == 0:
        return {'amount_paise': 0}
    account = await get_or_create_credit_account(shop_id, customer_id)
    if tx_type in ('CREDIT', 'ADJUSTMENT_UP'):
        delta = abs(int(amount_paise))
    elif tx_type == 'PAYMENT':
        delta = -abs(int(amount_paise))
    elif tx_type == 'REVERSAL':
        delta = int(amount_paise)  # signed
    elif tx_type == 'ADJUSTMENT_DOWN':
        delta = -abs(int(amount_paise))
    else:
        raise AppError('Unknown credit transaction type.', 500, 'bad_tx_type')

    new_outstanding = int(account['outstanding_paise']) + delta
    if new_outstanding < 0:
        raise AppError('Payment is more than the outstanding balance.',
                       400, 'overpayment',
                       'भरलेली रक्कम बाकी रकमेपेक्षा जास्त आहे.')
    await db.credit_accounts.update_one(
        {'shop_id': shop_id, 'customer_id': customer_id},
        {'$set': {'outstanding_paise': new_outstanding, 'updated_at': _now()},
         '$inc': {'total_credit_paise': delta if delta > 0 else 0,
                  'total_paid_paise': -delta if delta < 0 else 0}})
    tx = {
        'id': new_id(), 'shop_id': shop_id, 'customer_id': customer_id,
        'type': tx_type, 'amount_paise': int(amount_paise), 'delta_paise': delta,
        'balance_after_paise': new_outstanding, 'invoice_id': invoice_id,
        'actor_id': actor_id, 'payment_mode': payment_mode, 'note': note,
        'created_at': _now(),
    }
    await db.credit_transactions.insert_one(tx)
    tx.pop('_id', None)
    return tx


# ---------------------------------------------------------------------------
# invoice creation
# ---------------------------------------------------------------------------
async def create_invoice(shop_id: str, actor: dict, payload: dict) -> dict:
    """Create a bill (quick amount mode or itemised mode).

    payload keys:
      customer_id | customer_phone | customer_name
      mode: 'quick' | 'items'
      amount (rupees str/float, quick mode)
      items: [{product_id?, name?, quantity, unit_price?, discount?}]
      discount, payment_mode, paid_amount, loyalty_redeem_points
      idempotency_key
    """
    import hashlib
    import json

    mode = payload.get('mode') or ('items' if payload.get('items') else 'quick')
    idem_key = (payload.get('idempotency_key') or '').strip()
    fingerprint = hashlib.sha256(
        json.dumps({k: v for k, v in payload.items() if k != 'idempotency_key'},
                   sort_keys=True, default=str).encode()).hexdigest()

    replay = await begin_idempotent(shop_id, idem_key, fingerprint)
    if replay is not None:
        return replay

    try:
        invoice = await _build_invoice(shop_id, actor, payload, mode)
    except Exception:
        await release_idempotent(shop_id, idem_key)
        raise

    await complete_idempotent(shop_id, idem_key, invoice['id'])
    return invoice


async def _build_invoice(shop_id: str, actor: dict, payload: dict, mode: str) -> dict:
    from decimal import Decimal, ROUND_DOWN

    settings = await loyalty_settings(shop_id)
    now = _now()

    # ---- customer (auto-create / reuse by phone is the documented behaviour)
    customer = None
    if payload.get('customer_id'):
        customer = await db.customers.find_one({'id': payload['customer_id']}, {'_id': 0})
        if not customer:
            raise NotFound('Customer not found.', 'ग्राहक सापडला नाही.')
        await ensure_shop_link(shop_id, customer)
    elif payload.get('customer_phone'):
        normalized = normalize_phone(payload['customer_phone'])
        if normalized:
            customer = await ensure_global_customer(
                name=payload.get('customer_name'), phone=normalized)
            await ensure_shop_link(shop_id, customer, source='billing')

    customer_id = customer['id'] if customer else None
    customer_name = customer.get('name') if customer else (payload.get('customer_name') or None)

    # ---- line items
    items = []
    subtotal = 0
    total_cost = 0
    if mode == 'items':
        raw_items = payload.get('items') or []
        if not raw_items:
            raise AppError('Add at least one item to create this bill.',
                           400, 'empty_cart', 'बिल बनवण्यासाठी किमान एक वस्तू जोडा.')
        for raw in raw_items:
            qty = int(raw.get('quantity') or 0)
            if qty <= 0:
                raise AppError('Quantity must be at least 1.', 400, 'bad_qty')
            product = None
            if raw.get('product_id'):
                product = await db.products.find_one(
                    {'id': raw['product_id'], 'business_id': shop_id}, {'_id': 0})
                if not product:
                    raise NotFound('Product not found in this shop.', 'वस्तू सापडली नाही.')
                if product.get('is_active') is False:
                    raise AppError('This product is inactive.', 400, 'inactive_product')
            unit_price = to_paise(raw.get('unit_price')
                                  if raw.get('unit_price') is not None
                                  else (product or {}).get('selling_price', 0))
            if unit_price < 0:
                raise AppError('Price cannot be negative.', 400, 'bad_price')
            if product and product.get('min_selling_price') is not None:
                min_paise = to_paise(product['min_selling_price'])
                if settings['prevent_below_min'] and unit_price < min_paise:
                    raise AppError(
                        f"Below your safe selling price for {product['name']} "
                        f"(₹{product['min_selling_price']}).",
                        400, 'below_min_price',
                        f"{product['name']}: तुमच्या सुरक्षित किमतीखाली (₹{product['min_selling_price']}) विक्री अवरोधली आहे.")
            discount = to_paise(raw.get('discount') or 0)
            line_total = apply_discount(unit_price * qty, discount)
            cost = to_paise((product or {}).get('purchase_price', 0)) * qty
            min_price = to_paise(product.get('min_selling_price')) if product and product.get('min_selling_price') is not None else None
            items.append({
                'product_id': (product or {}).get('id'),
                'name': (product or {}).get('name') or raw.get('name') or 'Item',
                'sku': (product or {}).get('sku'),
                'quantity': qty,
                'unit_price_paise': unit_price,
                'discount_paise': discount,
                'total_paise': line_total,
                'cost_paise': cost,
                'min_unit_price_paise': min_price,
            })
            subtotal += line_total
            total_cost += cost
    else:
        amount = payload.get('amount')
        if amount is None or amount == '':
            raise AppError('Enter the bill amount.', 400, 'amount_required',
                           'बिल रकमा भरा.')
        amount_paise = to_paise(amount)
        if amount_paise <= 0:
            raise AppError('Amount must be greater than zero.', 400, 'bad_amount',
                           'रक्कम शून्यपेक्षा जास्त असावी.')
        subtotal = amount_paise
        items.append({'product_id': None, 'name': 'Quick sale', 'quantity': 1,
                      'unit_price_paise': amount_paise, 'discount_paise': 0,
                      'total_paise': amount_paise, 'cost_paise': 0})
        total_cost = 0

    # ---- order level discount
    order_discount = to_paise(payload.get('discount') or 0)
    if order_discount < 0:
        raise AppError('Discount cannot be negative.', 400, 'bad_discount')
    if order_discount > subtotal:
        raise AppError('Discount cannot be more than the bill amount.',
                       400, 'discount_too_high', 'सूट बिल रकमेपेक्षा जास्त असू शकत नाही.')

    total = apply_discount(subtotal, order_discount)

    # ---- loyalty redemption (shop-specific conversion)
    redeem_points = int(payload.get('loyalty_redeem_points') or 0)
    redeem_value = 0
    if redeem_points > 0:
        if not customer_id:
            raise AppError('Select a customer to redeem धनलाभ points.',
                           400, 'redeem_needs_customer',
                           'धनलाभ पॉइंटस वापरण्यासाठी ग्राहक निवडा.')
        account = await db.loyalty_accounts.find_one(
            {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})
        balance = int((account or {}).get('balance', 0))
        if redeem_points > balance:
            raise AppError(f'Only {balance} points available at this shop.',
                           400, 'insufficient_points',
                           f'या दुकानात फक्त {balance} पॉइंटस उपलब्ध आहेत.')
        max_redeemable = total // max(settings['redemption_value_paise'], 1) if settings['redemption_value_paise'] else 0
        if redeem_points > max_redeemable:
            raise AppError('Redeem points cannot exceed the bill amount.',
                           400, 'redeem_exceeds_total',
                           'वापरणारे पॉइंटस बिल रकमेपेक्षा जास्त असू शकत नाहीत.')
        redeem_value = redeem_points * settings['redemption_value_paise']
        total = apply_discount(total, redeem_value)

    # ---- payment split
    payment_mode = payload.get('payment_mode') or 'cash'
    if payment_mode not in PAYMENT_MODES:
        raise AppError('Choose a valid payment method.', 400, 'bad_payment_mode',
                       'पेमेंट पद्धत निवडा.')
    if payload.get('paid_amount') is not None and payload.get('paid_amount') != '':
        paid = to_paise(payload.get('paid_amount'))
    elif payment_mode == 'credit':
        paid = 0
    else:
        paid = total
    split = split_payment(total, paid)
    credit_paise = split['credit_paise']
    if credit_paise > 0 and not customer_id:
        raise AppError('Credit (उधारी) requires a customer.',
                       400, 'credit_needs_customer',
                       'उधारीसाठी ग्राहक आवश्यक आहे.')
    if payment_mode == 'credit' and credit_paise != total:
        # full credit when mode is credit
        split = {'paid_paise': 0, 'credit_paise': total}
        credit_paise = total
    if payment_mode != 'credit' and credit_paise == 0:
        payment_status = 'paid'
    elif split['paid_paise'] > 0:
        payment_status = 'partial'
    else:
        payment_status = 'credit'

    # ---- loyalty earn
    earned = 0
    if customer_id and settings['enabled'] and settings['points_per_100'] > 0:
        earned = compute_earned_points(total, settings['points_per_100'])

    invoice_id = new_id()
    invoice_number = await next_invoice_number(shop_id)

    invoice = {
        'id': invoice_id,
        'shop_id': shop_id,
        'invoice_number': invoice_number,
        'status': 'ACTIVE',
        'mode': mode,
        'customer_id': customer_id,
        'customer_name': customer_name,
        'items': items,
        'subtotal_paise': subtotal,
        'discount_paise': order_discount,
        'loyalty_redeemed_points': redeem_points if customer_id else 0,
        'loyalty_redeemed_value_paise': redeem_value,
        'total_paise': total,
        'cost_paise': total_cost,
        'payment_mode': payment_mode,
        'payment_status': payment_status,
        'paid_paise': split['paid_paise'],
        'credit_paise': credit_paise,
        'loyalty_earned_points': earned,
        'share_token': new_token(12),
        'notes': payload.get('notes'),
        'created_at': now,
        'created_by': actor.get('user_id'),
        'created_by_role': actor.get('role'),
    }

    # Write invoice first: if a later side-effect fails we void + report error
    # rather than leaving a half-applied bill (best-effort compensation).
    try:
        await db.invoices.insert_one(dict(invoice))

        # stock decrement (only when product lines exist)
        for item in items:
            if item.get('product_id'):
                await db.products.update_one(
                    {'id': item['product_id'], 'business_id': shop_id},
                    {'$inc': {'stock_quantity': -item['quantity']}})

        if customer_id:
            if credit_paise > 0:
                await add_credit_tx(shop_id, customer_id, 'CREDIT', credit_paise,
                                    invoice_id=invoice_id, actor_id=actor.get('user_id'),
                                    note=f'Bill {invoice_number}')
            if redeem_points > 0:
                await add_loyalty_tx(shop_id, customer_id, 'REDEEM', redeem_points,
                                     invoice_id=invoice_id, actor_id=actor.get('user_id'),
                                     note=f'Bill {invoice_number}')
            if earned > 0:
                await add_loyalty_tx(shop_id, customer_id, 'EARN', earned,
                                     invoice_id=invoice_id, actor_id=actor.get('user_id'),
                                     note=f'Bill {invoice_number}')
            await db.shop_customers.update_one(
                {'shop_id': shop_id, 'customer_id': customer_id},
                {'$inc': {'purchase_count': 1, 'total_spend_paise': total},
                 '$set': {'last_purchase_at': now}})
            link = await get_shop_link(shop_id, customer_id)
            if link and not link.get('first_purchase_at'):
                await db.shop_customers.update_one(
                    {'shop_id': shop_id, 'customer_id': customer_id},
                    {'$set': {'first_purchase_at': now}})
    except Exception:
        # compensation: mark invoice void so it does not count as a real bill
        await db.invoices.update_one({'id': invoice_id},
                                      {'$set': {'status': 'VOIDED',
                                                'void_reason': 'creation_failed',
                                                'created_at': now}})
        raise AppError('We couldn\'t create this bill. Your payment was not recorded. Please try again.',
                       500, 'bill_failed',
                       'हे बिल बनवता आले नाही. तुमची पेमेंट नोंदवली नाही. कृपया पुन्हा प्रयत्न करा.')

    invoice.pop('_id', None)
    return invoice


# ---------------------------------------------------------------------------
# void
# ---------------------------------------------------------------------------
async def void_invoice(shop_id: str, actor: dict, invoice_id: str, reason: str = None) -> dict:
    invoice = await db.invoices.find_one({'id': invoice_id, 'shop_id': shop_id}, {'_id': 0})
    if not invoice:
        raise NotFound('Bill not found.', 'बिल सापडले नाही.')
    if invoice.get('status') == 'VOIDED':
        raise AppError('This bill is already voided.', 400, 'already_voided',
                       'हे बिल आधीच रद्द केलेले आहे.')
    if not actor.get('role') or actor['role'] not in ('owner', 'manager'):
        raise Forbidden('Only owners or managers can void bills.',
                        'बिल रद्द करणे फक्त मालक किंवा व्यवस्थापक करू शकतात.')

    now = _now()
    customer_id = invoice.get('customer_id')
    reversals = []

    # reverse credit
    if invoice.get('credit_paise'):
        reversals.append(await add_credit_tx(
            shop_id, customer_id, 'REVERSAL', -int(invoice['credit_paise']),
            invoice_id=invoice['id'], actor_id=actor.get('user_id'),
            note=f'Void {invoice["invoice_number"]}'))
    # reverse redeemed points (give back)
    if invoice.get('loyalty_redeemed_points'):
        reversals.append(await add_loyalty_tx(
            shop_id, customer_id, 'REVERSAL', int(invoice['loyalty_redeemed_points']),
            invoice_id=invoice['id'], actor_id=actor.get('user_id'),
            note=f'Void {invoice["invoice_number"]} — redeemed points returned'))
    # reverse earned points (remove)
    if invoice.get('loyalty_earned_points'):
        reversals.append(await add_loyalty_tx(
            shop_id, customer_id, 'REVERSAL', -int(invoice['loyalty_earned_points']),
            invoice_id=invoice['id'], actor_id=actor.get('user_id'),
            note=f'Void {invoice["invoice_number"]} — earned points reversed'))

    # restore stock
    for item in invoice.get('items', []):
        if item.get('product_id'):
            await db.products.update_one(
                {'id': item['product_id'], 'business_id': shop_id},
                {'$inc': {'stock_quantity': item['quantity']}})

    # restore shop customer aggregates
    if customer_id:
        link = await get_shop_link(shop_id, customer_id)
        if link:
            await db.shop_customers.update_one(
                {'shop_id': shop_id, 'customer_id': customer_id},
                {'$inc': {'purchase_count': -1, 'total_spend_paise': -int(invoice['total_paise'])}})

    await db.invoices.update_one({'id': invoice['id']}, {'$set': {
        'status': 'VOIDED',
        'voided_at': now,
        'voided_by': actor.get('user_id'),
        'void_reason': reason,
        'payment_status': 'voided',
    }})

    updated = await db.invoices.find_one({'id': invoice['id']}, {'_id': 0})
    updated['reversals'] = reversals
    return updated
