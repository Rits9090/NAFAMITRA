"""Reports — real aggregations over this shop's data only."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from auth import require_business
from database import db
from money import fmt, to_paise

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _start(period: str) -> datetime:
    now = _now()
    if period == 'today':
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == 'week':
        return now - timedelta(days=7)
    if period == 'year':
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)  # month


@router.get("/sales")
async def sales_report(period: str = Query('month', enum=['today', 'week', 'month', 'year']),
                       user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    start = _start(period)
    invoices = await db.invoices.find(
        {'shop_id': shop_id, 'status': 'ACTIVE', 'created_at': {'$gte': start.isoformat()}},
        {'_id': 0}).to_list(5000)
    legacy = await db.sales.find(
        {'business_id': shop_id, 'created_at': {'$gte': start.isoformat()}},
        {'_id': 0}).to_list(5000)

    total_revenue_paise = sum(i.get('total_paise', 0) for i in invoices) + \
        sum(to_paise(s.get('total_amount', 0)) for s in legacy)
    total_profit_paise = sum(i.get('total_paise', 0) - i.get('cost_paise', 0) for i in invoices) + \
        sum(to_paise(float(s.get('total_amount', 0)) - float(s.get('total_cost', 0))) for s in legacy)
    total_orders = len(invoices) + len(legacy)
    avg = total_revenue_paise // total_orders if total_orders else 0

    breakdown = defaultdict(float)
    daily = defaultdict(lambda: {'revenue': 0.0, 'profit': 0.0, 'orders': 0})
    for s in legacy:
        breakdown[s.get('payment_mode', 'cash')] += s.get('total_amount', 0)
        day = s.get('created_at', '')[:10]
        daily[day]['revenue'] += s.get('total_amount', 0)
        daily[day]['profit'] += s.get('total_amount', 0) - s.get('total_cost', 0)
        daily[day]['orders'] += 1
    for inv in invoices:
        breakdown[inv.get('payment_mode', 'cash')] += inv.get('total_paise', 0) / 100.0
        day = inv.get('created_at', '')[:10]
        daily[day]['revenue'] += inv.get('total_paise', 0) / 100.0
        daily[day]['profit'] += (inv.get('total_paise', 0) - inv.get('cost_paise', 0)) / 100.0
        daily[day]['orders'] += 1

    credit_txs = await db.credit_transactions.find(
        {'shop_id': shop_id, 'created_at': {'$gte': start.isoformat()}},
        {'_id': 0, 'type': 1, 'amount_paise': 1}).to_list(5000)
    credit_collected = sum(t['amount_paise'] for t in credit_txs if t.get('type') == 'PAYMENT')
    loyalty_txs = await db.loyalty_transactions.find(
        {'shop_id': shop_id, 'created_at': {'$gte': start.isoformat()}},
        {'_id': 0, 'type': 1, 'points': 1}).to_list(5000)
    loyalty_earned = sum(t.get('points', 0) for t in loyalty_txs if t.get('type') == 'EARN')
    loyalty_redeemed = sum(t.get('points', 0) for t in loyalty_txs if t.get('type') == 'REDEEM')

    return {
        'period': period,
        'total_revenue': round(total_revenue_paise / 100.0, 2),
        'total_profit': round(total_profit_paise / 100.0, 2),
        'total_orders': total_orders,
        'avg_order_value': round(avg / 100.0, 2),
        'payment_breakdown': dict(breakdown),
        'credit_collected': round(credit_collected / 100.0, 2),
        'loyalty_earned': loyalty_earned,
        'loyalty_redeemed': loyalty_redeemed,
        'daily': [{'date': k, 'label': k, **v} for k, v in sorted(daily.items())],
    }


@router.get("/products")
async def products_report(period: str = Query('month'),
                          user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    start = _start(period)
    totals = defaultdict(lambda: {'qty': 0, 'revenue': 0.0, 'profit': 0.0})
    for inv in await db.invoices.find(
            {'shop_id': shop_id, 'status': 'ACTIVE', 'created_at': {'$gte': start.isoformat()}},
            {'_id': 0, 'items': 1}).to_list(5000):
        for item in inv.get('items', []):
            name = item.get('name', 'Unknown')
            totals[name]['qty'] += item.get('quantity', 0)
            totals[name]['revenue'] += item.get('total_paise', 0) / 100.0
            totals[name]['profit'] += (item.get('total_paise', 0) - item.get('cost_paise', 0)) / 100.0
    for s in await db.sales.find(
            {'business_id': shop_id, 'created_at': {'$gte': start.isoformat()}},
            {'_id': 0, 'items': 1}).to_list(5000):
        for item in s.get('items', []):
            name = item.get('product_name', 'Unknown')
            totals[name]['qty'] += item.get('quantity', 0)
            totals[name]['revenue'] += item.get('total', 0)
            totals[name]['profit'] += item.get('total', 0) - item.get('cost', 0)
    rows = [{'name': k, **v} for k, v in totals.items()]
    rows.sort(key=lambda r: -r['revenue'])
    return rows[:50]


@router.get("/customers")
async def customers_report(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    now = _now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    total = await db.shop_customers.count_documents({'shop_id': shop_id, 'status': 'active'})
    new_this_month = await db.shop_customers.count_documents(
        {'shop_id': shop_id, 'created_at': {'$gte': month_start.isoformat()}})
    repeat = await db.shop_customers.count_documents(
        {'shop_id': shop_id, 'status': 'active', 'purchase_count': {'$gte': 2}})
    inactive_cutoff = (now - timedelta(days=30)).isoformat()
    inactive = await db.shop_customers.count_documents({
        'shop_id': shop_id, 'status': 'active', 'purchase_count': {'$gt': 0},
        'last_purchase_at': {'$lt': inactive_cutoff}})
    never = await db.shop_customers.count_documents(
        {'shop_id': shop_id, 'status': 'active', 'purchase_count': 0})

    # total spend (this shop only)
    spend = 0
    for link in await db.shop_customers.find(
            {'shop_id': shop_id, 'status': 'active'},
            {'_id': 0, 'total_spend_paise': 1}).to_list(5000):
        spend += link.get('total_spend_paise', 0)

    return {
        'total': total, 'new_this_month': new_this_month, 'repeat': repeat,
        'inactive_30d': inactive, 'never_purchased': never,
        'total_spend': round(spend / 100.0, 2),
        'segments': [
            {'key': 'all', 'count': total},
            {'key': 'new', 'count': max(total - repeat, 0)},
            {'key': 'repeat', 'count': repeat},
            {'key': 'inactive', 'count': inactive},
        ],
    }


@router.get("/outstanding")
async def outstanding_report(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    accounts = await db.credit_accounts.find(
        {'shop_id': shop_id, 'outstanding_paise': {'$gt': 0}},
        {'_id': 0}).to_list(2000)
    total = sum(a.get('outstanding_paise', 0) for a in accounts)
    rows = []
    for acc in accounts:
        cust = await db.customers.find_one({'id': acc['customer_id']}, {'_id': 0}) or {}
        link = await db.shop_customers.find_one(
            {'shop_id': shop_id, 'customer_id': acc['customer_id']}, {'_id': 0}) or {}
        rows.append({
            'customer_id': acc['customer_id'], 'nm_id': cust.get('nm_id'),
            'name': link.get('display_name') or cust.get('name'),
            'phone': cust.get('phone'),
            'outstanding_paise': acc['outstanding_paise'],
        })
    rows.sort(key=lambda r: -r['outstanding_paise'])
    return {'total_paise': total, 'total': round(total / 100.0, 2),
            'total_fmt': fmt(total), 'rows': rows, 'count': len(rows)}


@router.get("/inventory")
async def inventory_report(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    products = await db.products.find(
        {'business_id': shop_id, 'is_active': {'$ne': False}},
        {'_id': 0, 'name': 1, 'category': 1, 'stock_quantity': 1,
         'low_stock_threshold': 1, 'selling_price': 1, 'purchase_price': 1}).to_list(1000)
    value = sum(p.get('stock_quantity', 0) * float(p.get('purchase_price') or 0) for p in products)
    low = [p for p in products if p.get('stock_quantity', 0) <= p.get('low_stock_threshold', 5)]
    return {'products': products, 'stock_value': round(value, 2),
            'low_stock_count': len(low), 'total_products': len(products)}
