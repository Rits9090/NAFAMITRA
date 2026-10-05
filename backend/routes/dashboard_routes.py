"""Dashboard + reports — real data only, tenant-scoped aggregations.

Metric definitions are centralized here and used everywhere:
* Total Sales        = sum of ACTIVE bill totals for the scope/period
* Average Bill       = total sales / number of bills
* Repeat Customer    = customer with >= 2 completed bills in this shop
* Outstanding Credit = sum of credit ledger balances (this shop)
* Credit Collected   = sum of PAYMENT credit transactions in period
* Loyalty Earned     = sum of EARN loyalty transactions in period
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from auth import require_business
from billing import loyalty_settings
from database import db
from money import fmt, to_paise

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _period_start(period: str) -> datetime:
    now = _now()
    if period == 'today':
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == 'week':
        return now - timedelta(days=7)
    if period == 'month':
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period == 'year':
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return now - timedelta(days=30)


async def _active_invoices_since(shop_id: str, start: datetime) -> list[dict]:
    return await db.invoices.find(
        {'shop_id': shop_id, 'status': 'ACTIVE', 'created_at': {'$gte': _iso(start)}},
        {'_id': 0}).to_list(5000)


async def _legacy_sales_since(shop_id: str, start: datetime) -> list[dict]:
    return await db.sales.find(
        {'business_id': shop_id, 'created_at': {'$gte': _iso(start)}},
        {'_id': 0}).to_list(5000)


async def compute_metrics(shop_id: str, period: str = 'month') -> dict:
    start = _period_start(period)
    invoices = await _active_invoices_since(shop_id, start)
    legacy = await _legacy_sales_since(shop_id, start)

    sales_paise = sum(i.get('total_paise', 0) for i in invoices)
    sales_paise += sum(to_paise(s.get('total_amount', 0)) for s in legacy)
    bills = len(invoices) + len(legacy)
    avg_bill = sales_paise // bills if bills else 0

    # Estimated gross margin = recorded sales − estimated cost (never "profit")
    margin_paise = sum(i.get('total_paise', 0) - i.get('cost_paise', 0) for i in invoices)
    margin_paise += sum((int(s.get('total_amount', 0) or 0)
                         - int(s.get('total_cost', 0) or 0)) * 100 for s in legacy)

    credit_txs = await db.credit_transactions.find(
        {'shop_id': shop_id, 'created_at': {'$gte': _iso(start)}},
        {'_id': 0, 'type': 1, 'delta_paise': 1, 'amount_paise': 1}).to_list(5000)
    credit_collected = sum(t.get('amount_paise', 0) for t in credit_txs if t.get('type') == 'PAYMENT')
    credit_extended = sum(t.get('amount_paise', 0) for t in credit_txs if t.get('type') == 'CREDIT')

    loyalty_txs = await db.loyalty_transactions.find(
        {'shop_id': shop_id, 'created_at': {'$gte': _iso(start)}},
        {'_id': 0, 'type': 1, 'points': 1}).to_list(5000)
    loyalty_earned = sum(t.get('points', 0) for t in loyalty_txs if t.get('type') == 'EARN')
    loyalty_redeemed = sum(t.get('points', 0) for t in loyalty_txs if t.get('type') == 'REDEEM')

    customer_ids = {i.get('customer_id') for i in invoices if i.get('customer_id')}
    customer_ids |= {s.get('customer_id') for s in legacy if s.get('customer_id')}

    return {
        'period': period,
        'sales_paise': sales_paise,
        'sales_fmt': fmt(sales_paise),
        'margin_paise': margin_paise,
        'margin_fmt': fmt(margin_paise),
        'bills': bills,
        'avg_bill_paise': avg_bill,
        'avg_bill_fmt': fmt(avg_bill),
        'customers_served': len(customer_ids),
        'credit_collected_paise': credit_collected,
        'credit_extended_paise': credit_extended,
        'loyalty_earned': loyalty_earned,
        'loyalty_redeemed': loyalty_redeemed,
        # legacy-compatible float fields (display only)
        'revenue': round(sales_paise / 100.0, 2),
        'avg_order_value': round(avg_bill / 100.0, 2),
    }


@router.get("/stats")
async def dashboard_stats(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    now = _now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    today = await compute_metrics(shop_id, 'today')
    month = await compute_metrics(shop_id, 'month')

    # customers
    total_customers = await db.shop_customers.count_documents(
        {'shop_id': shop_id, 'status': 'active'})
    new_customers_today = await db.shop_customers.count_documents(
        {'shop_id': shop_id, 'created_at': {'$gte': _iso(today_start)}})
    repeat_customers = await db.shop_customers.count_documents(
        {'shop_id': shop_id, 'status': 'active', 'purchase_count': {'$gte': 2}})

    # outstanding credit (this shop only)
    credit_accounts = await db.credit_accounts.find(
        {'shop_id': shop_id, 'outstanding_paise': {'$gt': 0}},
        {'_id': 0, 'outstanding_paise': 1, 'customer_id': 1}).to_list(2000)
    credit_due = sum(a['outstanding_paise'] for a in credit_accounts)

    # customers served today
    today_customer_ids = set()
    for inv in await _active_invoices_since(shop_id, today_start):
        if inv.get('customer_id'):
            today_customer_ids.add(inv['customer_id'])

    payment_breakdown = defaultdict(float)
    for inv in await _active_invoices_since(shop_id, today_start):
        payment_breakdown[inv.get('payment_mode', 'cash')] += inv.get('total_paise', 0) / 100.0
    for s in await _legacy_sales_since(shop_id, today_start):
        payment_breakdown[s.get('payment_mode', 'cash')] += s.get('total_amount', 0)

    low_stock = await db.products.count_documents({
        'business_id': shop_id,
        '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}})

    return {
        'today': {
            'revenue': today['revenue'], 'sales_paise': today['sales_paise'],
            'sales_fmt': today['sales_fmt'],
            'orders': today['bills'], 'bills': today['bills'],
            'customers': len(today_customer_ids),
            'payment_breakdown': dict(payment_breakdown),
        },
        'month': {
            'revenue': month['revenue'], 'sales_paise': month['sales_paise'],
            'sales_fmt': month['sales_fmt'],
            'orders': month['bills'], 'bills': month['bills'],
            'avg_bill_paise': month['avg_bill_paise'], 'avg_bill_fmt': month['avg_bill_fmt'],
        },
        'customers': {
            'total': total_customers, 'new_today': new_customers_today,
            'repeat': repeat_customers,
        },
        'outstanding': round(credit_due / 100.0, 2),
        'outstanding_paise': credit_due,
        'outstanding_fmt': fmt(credit_due),
        'credit_accounts': len(credit_accounts),
        'loyalty': {'earned': month['loyalty_earned'], 'redeemed': month['loyalty_redeemed']},
        'low_stock_count': low_stock,
        'metrics': {'month': month, 'today': today},
    }


@router.get("/chart")
async def sales_chart(user: dict = Depends(require_business)):
    """Daily revenue/profit for the last 30 days (real data, legacy+new)."""
    shop_id = user['shop_id']
    now = _now()
    invoices = await db.invoices.find(
        {'shop_id': shop_id, 'status': 'ACTIVE',
         'created_at': {'$gte': _iso(now - timedelta(days=30))}},
        {'_id': 0, 'created_at': 1, 'total_paise': 1, 'cost_paise': 1}).to_list(5000)
    legacy = await db.sales.find(
        {'business_id': shop_id, 'created_at': {'$gte': _iso(now - timedelta(days=30))}},
        {'_id': 0, 'created_at': 1, 'total_amount': 1, 'total_cost': 1}).to_list(5000)

    daily = defaultdict(lambda: {'revenue': 0.0, 'profit': 0.0, 'orders': 0})
    for s in legacy:
        day = s.get('created_at', '')[:10]
        daily[day]['revenue'] += s.get('total_amount', 0)
        daily[day]['profit'] += s.get('total_amount', 0) - s.get('total_cost', 0)
        daily[day]['orders'] += 1
    for inv in invoices:
        day = inv.get('created_at', '')[:10]
        daily[day]['revenue'] += inv.get('total_paise', 0) / 100.0
        daily[day]['profit'] += (inv.get('total_paise', 0) - inv.get('cost_paise', 0)) / 100.0
        daily[day]['orders'] += 1

    result = []
    for i in range(30):
        day = (now - timedelta(days=29 - i)).strftime('%Y-%m-%d')
        row = {'date': day, 'label': (now - timedelta(days=29 - i)).strftime('%d %b')}
        row.update(daily.get(day, {'revenue': 0, 'profit': 0, 'orders': 0}))
        result.append(row)
    return result


@router.get("/recent-bills")
async def recent_bills(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    invoices = await db.invoices.find({'shop_id': shop_id},
                                      {'_id': 0}).sort('created_at', -1).to_list(10)
    ids = {i.get('customer_id') for i in invoices if i.get('customer_id')}
    customers = {}
    if ids:
        customers = {c['id']: c for c in await db.customers.find(
            {'id': {'$in': list(ids)}}, {'_id': 0}).to_list(len(ids))}
    for inv in invoices:
        cust = customers.get(inv.get('customer_id'))
        if cust:
            inv['customer'] = {'name': cust.get('name'), 'nm_id': cust.get('nm_id'),
                               'id': cust['id']}
    legacy = await db.sales.find({'business_id': shop_id}, {'_id': 0}).sort(
        'created_at', -1).to_list(5)
    legacy_views = [{
        'id': s.get('id'), 'invoice_number': s.get('invoice_number'),
        'customer_name': s.get('customer_name'), 'customer_id': s.get('customer_id'),
        'total_paise': to_paise(s.get('total_amount', 0)),
        'payment_mode': s.get('payment_mode'), 'payment_status': s.get('payment_status'),
        'status': 'ACTIVE', 'created_at': s.get('created_at'), 'legacy': True,
    } for s in legacy]
    merged = invoices + legacy_views
    merged.sort(key=lambda x: x.get('created_at') or '', reverse=True)
    return merged[:10]


# backwards-compatible alias
@router.get("/recent-sales")
async def recent_sales_alias(user: dict = Depends(require_business)):
    return await recent_bills(user)


@router.get("/recent-customers")
async def recent_customers(user: dict = Depends(require_business)):
    """Customer activity: newest links + recent purchasers (this shop)."""
    shop_id = user['shop_id']
    links = await db.shop_customers.find({'shop_id': shop_id, 'status': 'active'},
                                         {'_id': 0}).sort('created_at', -1).to_list(8)
    out = []
    for link in links:
        cust = await db.customers.find_one({'id': link['customer_id']}, {'_id': 0}) or {}
        out.append({
            'id': cust.get('id'), 'name': link.get('display_name') or cust.get('name'),
            'nm_id': cust.get('nm_id'), 'phone': cust.get('phone'),
            'created_at': link.get('created_at'),
            'last_purchase_at': link.get('last_purchase_at'),
            'purchase_count': link.get('purchase_count', 0),
            'total_spend_paise': link.get('total_spend_paise', 0),
        })
    return out


@router.get("/alerts")
async def alerts(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    out = []
    low_stock = await db.products.find(
        {'business_id': shop_id,
         '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}},
        {'_id': 0, 'name': 1, 'stock_quantity': 1}).sort('stock_quantity', 1).to_list(5)
    for p in low_stock:
        out.append({'type': 'low_stock', 'severity': 'warning',
                    'title': f"Low Stock: {p['name']}",
                    'message': f"Only {p.get('stock_quantity', 0)} left",
                    'action': 'restock'})

    due = await db.credit_accounts.find(
        {'shop_id': shop_id, 'outstanding_paise': {'$gte': 50000}},
        {'_id': 0}).to_list(5)
    for acc in due[:3]:
        cust = await db.customers.find_one({'id': acc['customer_id']}, {'_id': 0}) or {}
        link = await db.shop_customers.find_one(
            {'shop_id': shop_id, 'customer_id': acc['customer_id']}, {'_id': 0}) or {}
        out.append({'type': 'credit', 'severity': 'error',
                    'title': f"Pending: {link.get('display_name') or cust.get('name')}",
                    'message': f"{fmt(acc['outstanding_paise'])} outstanding",
                    'action': 'collect'})
    return out


@router.get("/top-products")
async def top_products(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    start = _period_start('month')
    totals = defaultdict(lambda: {'qty': 0, 'revenue': 0.0})
    for inv in await _active_invoices_since(shop_id, start):
        for item in inv.get('items', []):
            name = item.get('name', 'Unknown')
            totals[name]['qty'] += item.get('quantity', 0)
            totals[name]['revenue'] += item.get('total_paise', 0) / 100.0
    for s in await _legacy_sales_since(shop_id, start):
        for item in s.get('items', []):
            name = item.get('product_name', 'Unknown')
            totals[name]['qty'] += item.get('quantity', 0)
            totals[name]['revenue'] += item.get('total', 0)
    ranked = sorted(totals.items(), key=lambda kv: kv[1]['revenue'], reverse=True)[:8]
    return [{'name': k, **v} for k, v in ranked]


# ---------------------------------------------------------------------------
# reports
# ---------------------------------------------------------------------------
@router.get("/report/{period}")
async def report(period: str,
                 user: dict = Depends(require_business)):
    if period not in ('today', 'week', 'month', 'year'):
        period = 'month'
    metrics = await compute_metrics(user['shop_id'], period)
    return metrics


# dashboard chart is also exposed under reports for the reports page
@router.get("/report-chart/{period}")
async def report_chart(period: str, user: dict = Depends(require_business)):
    return await sales_chart(user)
