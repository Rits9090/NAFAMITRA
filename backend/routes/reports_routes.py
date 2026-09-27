from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from auth import require_business
from database import db

router = APIRouter()

@router.get("/sales")
async def sales_report(
    period: str = Query('month', enum=['today', 'week', 'month', 'year']),
    user: dict = Depends(require_business)
):
    bid = user['business_id']
    now = datetime.now(timezone.utc)
    if period == 'today':
        start = now.replace(hour=0, minute=0, second=0).isoformat()
    elif period == 'week':
        start = (now - timedelta(days=7)).isoformat()
    elif period == 'month':
        start = now.replace(day=1, hour=0, minute=0, second=0).isoformat()
    else:
        start = now.replace(month=1, day=1, hour=0).isoformat()

    sales = await db.sales.find({'business_id': bid, 'created_at': {'$gte': start}}, {'_id': 0}).to_list(5000)
    total_revenue = sum(s.get('total_amount', 0) for s in sales)
    total_profit = sum(s.get('total_amount', 0) - s.get('total_cost', 0) for s in sales)

    payment_breakdown = defaultdict(float)
    for s in sales:
        payment_breakdown[s.get('payment_mode', 'cash')] += s.get('total_amount', 0)

    daily = defaultdict(lambda: {'revenue': 0, 'orders': 0, 'profit': 0})
    for s in sales:
        day = s.get('created_at', '')[:10]
        daily[day]['revenue'] += s.get('total_amount', 0)
        daily[day]['profit'] += s.get('total_amount', 0) - s.get('total_cost', 0)
        daily[day]['orders'] += 1

    return {
        'period': period, 'total_revenue': total_revenue, 'total_profit': total_profit,
        'total_orders': len(sales), 'avg_order_value': total_revenue / max(len(sales), 1),
        'payment_breakdown': dict(payment_breakdown),
        'daily': [{'date': k, **v} for k, v in sorted(daily.items())]
    }

@router.get("/products")
async def products_report(
    period: str = Query('month'),
    user: dict = Depends(require_business)
):
    bid = user['business_id']
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0) if period == 'month' else (now - timedelta(days=7))

    pipeline = [
        {'$match': {'business_id': bid, 'created_at': {'$gte': start.isoformat()}}},
        {'$unwind': '$items'},
        {'$group': {
            '_id': '$items.product_name',
            'total_qty': {'$sum': '$items.quantity'},
            'total_revenue': {'$sum': '$items.total'},
            'total_cost': {'$sum': '$items.cost'}
        }},
        {'$sort': {'total_revenue': -1}},
        {'$limit': 20}
    ]
    products = await db.sales.aggregate(pipeline).to_list(20)
    result = []
    for p in products:
        profit = p.get('total_revenue', 0) - p.get('total_cost', 0)
        margin = (profit / max(p.get('total_revenue', 1), 1)) * 100
        result.append({'name': p['_id'], 'qty': p['total_qty'], 'revenue': p['total_revenue'], 'profit': profit, 'margin_pct': round(margin, 1)})
    return result

@router.get("/customers")
async def customers_report(user: dict = Depends(require_business)):
    bid = user['business_id']
    customers = await db.customers.find({'business_id': bid, 'is_active': True}, {'_id': 0}).to_list(500)

    by_membership = defaultdict(int)
    by_tag = defaultdict(int)
    for c in customers:
        by_membership[c.get('membership_level', 'bronze')] += 1
        for tag in c.get('tags', []):
            by_tag[tag] += 1

    top_customers = sorted(customers, key=lambda x: x.get('total_purchases', 0), reverse=True)[:10]
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    inactive = [c for c in customers if (c.get('last_purchase_at') or '') < thirty_days_ago]

    return {
        'total': len(customers),
        'by_membership': dict(by_membership),
        'by_tag': dict(by_tag),
        'top_customers': top_customers,
        'inactive_count': len(inactive)
    }

@router.get("/outstanding")
async def outstanding_report(user: dict = Depends(require_business)):
    bid = user['business_id']
    udhaars = await db.udhaar.find({'business_id': bid, 'outstanding': {'$gt': 0}}, {'_id': 0}).sort('outstanding', -1).to_list(100)
    total = sum(u.get('outstanding', 0) for u in udhaars)
    return {'total_outstanding': total, 'customer_count': len(udhaars), 'details': udhaars}

@router.get("/inventory")
async def inventory_report(user: dict = Depends(require_business)):
    bid = user['business_id']
    products = await db.products.find({'business_id': bid, 'is_active': True}, {'_id': 0}).to_list(500)
    by_category = defaultdict(lambda: {'count': 0, 'stock_value': 0})
    low_stock, out_of_stock = [], []
    total_stock_value = 0

    for p in products:
        cat = p.get('category', 'Other')
        stock_val = p.get('stock_quantity', 0) * p.get('purchase_price', 0)
        by_category[cat]['count'] += 1
        by_category[cat]['stock_value'] += stock_val
        total_stock_value += stock_val
        if p.get('stock_quantity', 0) == 0:
            out_of_stock.append(p)
        elif p.get('stock_quantity', 0) <= p.get('low_stock_threshold', 5):
            low_stock.append(p)

    return {
        'total_products': len(products),
        'total_stock_value': total_stock_value,
        'low_stock': low_stock,
        'out_of_stock': out_of_stock,
        'by_category': {k: v for k, v in by_category.items()}
    }
