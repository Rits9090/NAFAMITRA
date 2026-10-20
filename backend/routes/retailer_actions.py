"""Today's Actions — deterministic, real-data action list for the retailer.

Every action carries an i18n reason key + params so the UI renders the
reason in the merchant's language. Priority 1 = highest. No action ever
claims a message was sent; buttons navigate (target) or copy.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends

from auth import require_business
from database import db

router = APIRouter()

IST = timezone(timedelta(hours=5, minutes=30))
WINBACK_DAYS = 30
OVERDUE_DAYS = 15


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get('/actions')
async def today_actions(user: dict = Depends(require_business),
                        limit: int = 25):
    shop_id = user['shop_id']
    now = _now()
    actions: list[dict] = []

    def add(kind: str, priority: int, reason_key: str, params: dict,
            target: str, entity_id: Optional[str] = None, count: Optional[int] = None):
        actions.append({
            'id': f'{kind}:{entity_id or count or len(actions)}',
            'type': kind,
            'priority': priority,
            'reason_key': reason_key,
            'params': params,
            'target': target,
            'entity_id': entity_id,
            'count': count,
        })

    # 1) Udhaar — outstanding credit; overdue (oldest CREDIT > 15 days) ranks #1
    accounts = await db.credit_accounts.find(
        {'shop_id': shop_id, 'outstanding_paise': {'$gt': 0}},
        {'_id': 0, 'customer_id': 1, 'outstanding_paise': 1}).to_list(50)
    if accounts:
        oldest_tx = await db.credit_transactions.find_one(
            {'shop_id': shop_id, 'type': 'CREDIT'},
            {'_id': 0, 'created_at': 1}, sort=[('created_at', 1)])
        oldest = None
        if oldest_tx and oldest_tx.get('created_at'):
            try:
                oldest = datetime.fromisoformat(oldest_tx['created_at'])
            except ValueError:
                oldest = None
        overdue = bool(oldest and (now - oldest) > timedelta(days=OVERDUE_DAYS))
        top = max(accounts, key=lambda a: a.get('outstanding_paise', 0))
        cust = await db.customers.find_one(
            {'id': top.get('customer_id')}, {'_id': 0, 'name': 1}) or {}
        total = sum(a.get('outstanding_paise', 0) for a in accounts)
        add('overdue_udhaar' if overdue else 'due_udhaar',
            1 if overdue else 3,
            'action.reasonOverdueUdhaar' if overdue else 'action.reasonDueUdhaar',
            {'name': cust.get('name') or '', 'amount': str(total // 100),
             'count': str(len(accounts))},
            '/credit', count=len(accounts))

    # 2) Low stock
    low = await db.products.find(
        {'business_id': shop_id, 'is_active': True,
         '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}},
        {'_id': 0, 'name': 1, 'stock_quantity': 1}).to_list(6)
    if low:
        add('low_stock', 2, 'action.reasonLowStock',
            {'name': low[0].get('name') or '', 'count': str(len(low))},
            '/products', count=len(low))

    # 3) Win-back — historically real customers (≥2 bills), no bill in 30+ days
    cutoff = (now - timedelta(days=WINBACK_DAYS)).isoformat()
    agg = await db.invoices.aggregate([
        {'$match': {'shop_id': shop_id, 'status': 'ACTIVE',
                    'customer_id': {'$ne': None}}},
        {'$group': {'_id': '$customer_id',
                    'last': {'$max': '$created_at'},
                    'bills': {'$sum': 1}}},
        {'$match': {'last': {'$lt': cutoff}, 'bills': {'$gte': 2}}},
        {'$sort': {'last': 1}},
        {'$limit': 5},
    ]).to_list(5)
    if agg:
        names = []
        for row in agg:
            c = await db.customers.find_one(
                {'id': row['_id']}, {'_id': 0, 'name': 1}) or {}
            names.append(c.get('name') or '')
        add('winback', 3, 'action.reasonWinback',
            {'count': str(len(agg)), 'name': next((n for n in names if n), '')},
            '/customers?segment=inactive', count=len(agg))

    # 4) Open requirements matching this shop's catalogue (token overlap)
    from routes.requirements_routes import _merchant_query
    vis_q = await _merchant_query(shop_id)
    vis_q['status'] = 'open'
    reqs = await db.requirements.find(vis_q, {'_id': 0, 'id': 1, 'title': 1,
                                              'items': 1}).to_list(50)
    matched = []
    product_names = await db.products.find(
        {'business_id': shop_id, 'is_active': True},
        {'_id': 0, 'name': 1}).to_list(500)
    p_tokens = {w for p in product_names for w in (p.get('name') or '').lower().split()}
    for r in reqs:
        haystack = (r.get('title') or '').lower()
        for it in r.get('items') or []:
            haystack += ' ' + (it.get('name') or '').lower()
        tokens = {w for w in haystack.split() if len(w) > 2}
        if tokens & p_tokens:
            matched.append(r)
    if matched:
        add('matching_requirement', 2, 'action.reasonRequirement',
            {'count': str(len(matched)), 'title': matched[0].get('title') or ''},
            '/requirements', count=len(matched))
    elif reqs:
        add('requirement', 3, 'action.reasonNewRequirement',
            {'count': str(len(reqs)), 'title': reqs[0].get('title') or ''},
            '/requirements', count=len(reqs))

    # 5) Quiet evening — no sales today after 18:00 IST
    today_ist = now.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    start_iso = today_ist.astimezone(timezone.utc).isoformat()
    bills_today = await db.invoices.count_documents(
        {'shop_id': shop_id, 'status': 'ACTIVE', 'created_at': {'$gte': start_iso}})
    legacy_today = await db.sales.count_documents(
        {'business_id': shop_id, 'created_at': {'$gte': start_iso}})
    local_hour = now.astimezone(IST).hour
    if bills_today + legacy_today == 0 and local_hour >= 18:
        add('no_sales_today', 4, 'action.reasonNoSalesToday', {},
            '/billing')

    actions.sort(key=lambda a: (a['priority'], a['type']))
    return {
        'actions': actions[:limit],
        'generated_at': now.isoformat(),
        'total': len(actions),
        'summary': {
            'overdue': sum(1 for a in actions if a['type'] == 'overdue_udhaar'),
            'low_stock': sum(1 for a in actions if a['type'] == 'low_stock'),
            'winback': sum(1 for a in actions if a['type'] == 'winback'),
            'requirements': sum(1 for a in actions
                                if a['type'] in ('matching_requirement', 'requirement')),
        },
    }
