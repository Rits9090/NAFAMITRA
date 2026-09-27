from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from auth import require_business
from database import db

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats(user: dict = Depends(require_business)):
    bid = user['business_id']
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    sales_today = await db.sales.find({'business_id': bid, 'created_at': {'$gte': today_start}}, {'_id': 0}).to_list(500)
    sales_month = await db.sales.find({'business_id': bid, 'created_at': {'$gte': month_start}}, {'_id': 0}).to_list(2000)

    today_revenue = sum(s.get('total_amount', 0) for s in sales_today)
    today_profit = sum((s.get('total_amount', 0) - s.get('total_cost', 0)) for s in sales_today)
    month_revenue = sum(s.get('total_amount', 0) for s in sales_month)
    month_profit = sum((s.get('total_amount', 0) - s.get('total_cost', 0)) for s in sales_month)

    total_customers = await db.customers.count_documents({'business_id': bid, 'is_active': True})
    new_customers_today = await db.customers.count_documents({'business_id': bid, 'created_at': {'$gte': today_start}})

    udhaar_docs = await db.udhaar.find({'business_id': bid}, {'_id': 0, 'outstanding': 1}).to_list(1000)
    total_outstanding = sum(u.get('outstanding', 0) for u in udhaar_docs if u.get('outstanding', 0) > 0)

    low_stock = await db.products.count_documents({
        'business_id': bid,
        '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}
    })

    payment_breakdown = defaultdict(float)
    for s in sales_today:
        payment_breakdown[s.get('payment_mode', 'cash')] += s.get('total_amount', 0)

    return {
        'today': {'revenue': today_revenue, 'profit': today_profit, 'orders': len(sales_today), 'payment_breakdown': dict(payment_breakdown)},
        'month': {'revenue': month_revenue, 'profit': month_profit, 'orders': len(sales_month)},
        'customers': {'total': total_customers, 'new_today': new_customers_today},
        'outstanding': total_outstanding,
        'low_stock_count': low_stock
    }

@router.get("/chart")
async def get_sales_chart(user: dict = Depends(require_business)):
    bid = user['business_id']
    now = datetime.now(timezone.utc)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    sales = await db.sales.find({'business_id': bid, 'created_at': {'$gte': thirty_days_ago}}, {'_id': 0, 'created_at': 1, 'total_amount': 1, 'total_cost': 1}).to_list(5000)

    daily = defaultdict(lambda: {'revenue': 0, 'profit': 0, 'orders': 0})
    for s in sales:
        day = s.get('created_at', '')[:10]
        daily[day]['revenue'] += s.get('total_amount', 0)
        daily[day]['profit'] += s.get('total_amount', 0) - s.get('total_cost', 0)
        daily[day]['orders'] += 1

    result = []
    for i in range(30):
        day = (now - timedelta(days=29-i)).strftime('%Y-%m-%d')
        result.append({'date': day, 'label': (now - timedelta(days=29-i)).strftime('%d %b'), **daily.get(day, {'revenue': 0, 'profit': 0, 'orders': 0})})

    return result

@router.get("/top-products")
async def get_top_products(user: dict = Depends(require_business)):
    bid = user['business_id']
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0).isoformat()
    sales = await db.sales.find({'business_id': bid, 'created_at': {'$gte': month_start}}, {'_id': 0, 'items': 1}).to_list(2000)

    product_totals = defaultdict(lambda: {'qty': 0, 'revenue': 0})
    for sale in sales:
        for item in sale.get('items', []):
            name = item.get('product_name', 'Unknown')
            product_totals[name]['qty'] += item.get('quantity', 0)
            product_totals[name]['revenue'] += item.get('total', 0)

    sorted_products = sorted(product_totals.items(), key=lambda x: x[1]['revenue'], reverse=True)[:8]
    return [{'name': k, **v} for k, v in sorted_products]

@router.get("/alerts")
async def get_alerts(user: dict = Depends(require_business)):
    bid = user['business_id']
    alerts = []

    low_stock_products = await db.products.find({
        'business_id': bid,
        '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}
    }, {'_id': 0, 'name': 1, 'stock_quantity': 1}).to_list(20)

    for p in low_stock_products[:5]:
        alerts.append({'type': 'low_stock', 'severity': 'warning', 'title': f"Low Stock: {p['name']}", 'message': f"Only {p['stock_quantity']} units left", 'action': 'restock'})

    udhaar_high = await db.udhaar.find({'business_id': bid, 'outstanding': {'$gt': 500}}, {'_id': 0, 'customer_name': 1, 'outstanding': 1}).sort('outstanding', -1).to_list(5)
    for u in udhaar_high[:3]:
        alerts.append({'type': 'udhaar', 'severity': 'error', 'title': f"Pending: {u['customer_name']}", 'message': f"₹{u['outstanding']:.0f} outstanding", 'action': 'collect'})

    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    inactive_count = await db.customers.count_documents({'business_id': bid, 'last_purchase_at': {'$lt': thirty_days_ago}, 'is_active': True})
    if inactive_count > 0:
        alerts.append({'type': 'inactive', 'severity': 'info', 'title': f"{inactive_count} Inactive Customers", 'message': "Haven't purchased in 30+ days", 'action': 'campaign'})

    return alerts

@router.get("/recent-sales")
async def get_recent_sales(user: dict = Depends(require_business)):
    bid = user['business_id']
    sales = await db.sales.find({'business_id': bid}, {'_id': 0}).sort('created_at', -1).to_list(10)
    return sales
