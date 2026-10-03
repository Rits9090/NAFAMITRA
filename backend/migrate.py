"""Idempotent migration of legacy data to the NafaMitra data model.

Legacy model                          New model
--------------------------            ----------------------------------
users.business_id (+role)      →      memberships (shop_id, user_id, role)
customers (per business)       →      customers (global, keyed by phone)
                                      + shop_customers (per shop link)
customer.customer_id 'NF001'   →      customers.nm_id 'NM-XXXXXX'
customer.loyalty_points        →      loyalty_accounts + ADJUSTMENT ledger
udhaar doc with entries[]      →      credit_accounts + credit_transactions

Every step is safe to re-run: it only processes documents that have not been
converted yet (checked by field presence / existence of target records).
"""
import logging
from datetime import datetime, timezone

from database import db
from phones import generate_nm_id, new_id, new_token, normalize_phone

logger = logging.getLogger('nafamitra.migrate')


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _unique_nm_id() -> str:
    for _ in range(8):
        candidate = generate_nm_id()
        if not await db.customers.find_one({'nm_id': candidate}, {'_id': 1}):
            return candidate
    return generate_nm_id()


async def run_migrations() -> dict:
    stats = {
        'memberships_backfilled': 0,
        'customers_globalized': 0,
        'customers_linked': 0,
        'references_rewritten': 0,
        'credit_migrated': 0,
        'loyalty_migrated': 0,
    }
    stats['memberships_backfilled'] = await _backfill_memberships()
    stats['customers_globalized'], stats['customers_linked'], stats['references_rewritten'] = \
        await _globalize_customers()
    stats['credit_migrated'] = await _migrate_udhaar()
    stats['loyalty_migrated'] = await _migrate_loyalty()
    return stats


async def _backfill_memberships() -> int:
    count = 0
    async for user in db.users.find({'business_id': {'$ne': None}}, {'_id': 0}):
        if not user.get('id'):
            continue
        existing = await db.memberships.find_one(
            {'shop_id': user['business_id'], 'user_id': user['id']}, {'_id': 1})
        if existing:
            continue
        await db.memberships.insert_one({
            'id': new_id(),
            'shop_id': user['business_id'],
            'user_id': user['id'],
            'role': user.get('role') or 'owner',
            'status': 'active',
            'created_at': user.get('created_at') or _now(),
        })
        count += 1
    return count


async def _globalize_customers() -> tuple[int, int, int]:
    globalized = 0
    linked = 0
    rewritten = 0

    async for doc in db.customers.find({}, {'_id': 0}):
        if not doc.get('id') or doc.get('nm_id'):
            continue  # already migrated

        legacy_business_id = doc.get('business_id')
        normalized = normalize_phone(doc.get('phone'))
        target_id = doc['id']

        if normalized:
            other = await db.customers.find_one(
                {'phone_normalized': normalized, 'nm_id': {'$ne': None}}, {'_id': 0})
            if other and other['id'] != doc['id']:
                # Same verified phone → merge into the surviving global identity
                target_id = other['id']
                rewritten += await _rewrite_references(doc['id'], target_id)
                await db.customers.update_one({'id': doc['id']}, {'$set': {
                    'merged_into': target_id,
                    'is_active': False,
                    'updated_at': _now(),
                }, '$unset': {'business_id': ''}})
                if legacy_business_id:
                    await _ensure_link(legacy_business_id, other, doc)
                    linked += 1
                globalized += 1
                continue

        # promote this document to a global identity (reuse its id)
        updates = {
            'nm_id': await _unique_nm_id(),
            'qr_token': doc.get('qr_token') or new_token(16),
            'phone_normalized': normalized,
            'is_active': doc.get('is_active', True),
            'updated_at': _now(),
        }
        await db.customers.update_one({'id': doc['id']},
                                      {'$set': updates, '$unset': {'business_id': ''}})
        doc.update(updates)
        if legacy_business_id:
            await _ensure_link(legacy_business_id, doc, doc)
            linked += 1
        globalized += 1

    return globalized, linked, rewritten


async def _ensure_link(shop_id: str, global_customer: dict, legacy_doc: dict) -> None:
    existing = await db.shop_customers.find_one(
        {'shop_id': shop_id, 'customer_id': global_customer['id']}, {'_id': 1})
    if existing:
        return
    await db.shop_customers.insert_one({
        'id': new_id(),
        'shop_id': shop_id,
        'customer_id': global_customer['id'],
        'normalized_phone': global_customer.get('phone_normalized'),
        'display_name': legacy_doc.get('name'),
        'first_purchase_at': legacy_doc.get('last_purchase_at'),
        'last_purchase_at': legacy_doc.get('last_purchase_at'),
        'purchase_count': int(legacy_doc.get('total_visits') or 0),
        'total_spend_paise': int(round(float(legacy_doc.get('total_purchases') or 0) * 100)),
        'notes': legacy_doc.get('notes'),
        'status': 'active',
        'source': 'migration',
        'legacy_customer_id': legacy_doc.get('id'),
        'created_at': legacy_doc.get('created_at') or _now(),
    })


async def _rewrite_references(old_id: str, new_id_: str) -> int:
    n = 0
    for coll in ('sales', 'udhaar', 'loyalty_transactions'):
        result = await db[coll].update_many({'customer_id': old_id},
                                            {'$set': {'customer_id': new_id_}})
        n += getattr(result, 'modified_count', 0) or 0
    return n


async def _migrate_udhaar() -> int:
    count = 0
    async for u in db.udhaar.find({}, {'_id': 0}):
        if not u.get('customer_id') or not u.get('business_id'):
            continue
        shop_id, customer_id = u['business_id'], u['customer_id']
        existing = await db.credit_accounts.find_one(
            {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 1})
        if existing:
            continue

        balance = 0
        await db.credit_accounts.insert_one({
            'shop_id': shop_id, 'customer_id': customer_id,
            'outstanding_paise': int(round(float(u.get('outstanding') or 0) * 100)),
            'total_credit_paise': int(round(float(u.get('total_credit') or 0) * 100)),
            'total_paid_paise': int(round(float(u.get('total_paid') or 0) * 100)),
            'created_at': u.get('created_at') or _now(),
            'updated_at': u.get('last_transaction_at') or _now(),
            'migrated': True,
        })
        for entry in u.get('entries', []):
            amount = int(round(float(entry.get('amount') or 0) * 100))
            if amount <= 0:
                continue
            if entry.get('type') == 'received':
                tx_type, delta = 'PAYMENT', -amount
            else:
                tx_type, delta = 'CREDIT', amount
            balance += delta
            await db.credit_transactions.insert_one({
                'id': new_id(), 'shop_id': shop_id, 'customer_id': customer_id,
                'type': tx_type, 'amount_paise': amount, 'delta_paise': delta,
                'balance_after_paise': balance,
                'invoice_id': entry.get('sale_id'),
                'payment_mode': entry.get('payment_mode'),
                'note': entry.get('description'),
                'created_at': entry.get('date') or u.get('created_at') or _now(),
                'migrated': True,
            })
        if not u.get('entries'):
            amount = int(round(float(u.get('total_credit') or 0) * 100))
            if amount > 0:
                await db.credit_transactions.insert_one({
                    'id': new_id(), 'shop_id': shop_id, 'customer_id': customer_id,
                    'type': 'CREDIT', 'amount_paise': amount, 'delta_paise': amount,
                    'balance_after_paise': amount, 'note': 'migrated balance',
                    'created_at': u.get('created_at') or _now(), 'migrated': True,
                })
        count += 1
    return count


async def _migrate_loyalty() -> int:
    count = 0
    async for doc in db.customers.find({}, {'_id': 0}):
        if not doc.get('id'):
            continue
        points = int(round(float(doc.get('loyalty_points') or 0)))
        if points <= 0:
            continue
        # find shops this customer belongs to (legacy: business_id on doc, new: links)
        shop_ids = []
        if doc.get('business_id'):
            shop_ids.append(doc['business_id'])
        else:
            links = await db.shop_customers.find(
                {'customer_id': doc['id']}, {'_id': 0, 'shop_id': 1}).to_list(50)
            shop_ids = [l['shop_id'] for l in links]
        for shop_id in shop_ids:
            existing = await db.loyalty_accounts.find_one(
                {'shop_id': shop_id, 'customer_id': doc['id']}, {'_id': 1})
            if existing:
                continue
            await db.loyalty_accounts.insert_one({
                'shop_id': shop_id, 'customer_id': doc['id'],
                'balance': points, 'earned_total': points, 'redeemed_total': 0,
                'created_at': doc.get('created_at') or _now(),
                'updated_at': _now(), 'migrated': True,
            })
            await db.loyalty_transactions.insert_one({
                'id': new_id(), 'shop_id': shop_id, 'customer_id': doc['id'],
                'type': 'ADJUSTMENT', 'points': points, 'delta': points,
                'balance_after': points, 'note': 'Opening balance (migrated)',
                'created_at': _now(), 'migrated': True,
            })
            count += 1
    return count
