from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
from database import db
from auth import require_business

router = APIRouter()

class SaleItem(BaseModel):
    product_id: str
    quantity: int
    discount: float = 0.0

class CreateSaleRequest(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: List[SaleItem]
    discount: float = 0.0
    tax: float = 0.0
    payment_mode: str = 'cash'
    paid_amount: Optional[float] = None
    notes: Optional[str] = None
    loyalty_points_redeemed: float = 0.0

async def get_next_invoice_number(business_id: str) -> str:
    now = datetime.now(timezone.utc)
    prefix = f"INV-{now.strftime('%y%m')}"
    count = await db.sales.count_documents({'business_id': business_id, 'invoice_number': {'$regex': f'^{prefix}'}})
    return f"{prefix}-{(count + 1):03d}"

def get_membership_level(points: float) -> str:
    if points >= 5000: return 'vip'
    if points >= 2000: return 'gold'
    if points >= 500: return 'silver'
    return 'bronze'

@router.get("")
async def list_sales(page: int = 1, limit: int = 20, user: dict = Depends(require_business)):
    bid = user['business_id']
    total = await db.sales.count_documents({'business_id': bid})
    skip = (page - 1) * limit
    sales = await db.sales.find({'business_id': bid}, {'_id': 0}).sort('created_at', -1).skip(skip).limit(limit).to_list(limit)
    return {'sales': sales, 'total': total}

@router.post("")
async def create_sale(req: CreateSaleRequest, user: dict = Depends(require_business)):
    bid = user['business_id']
    now = datetime.now(timezone.utc)

    items_data = []
    total_cost = 0.0
    for item in req.items:
        product = await db.products.find_one({'id': item.product_id, 'business_id': bid}, {'_id': 0})
        if not product:
            raise HTTPException(404, f"Product not found: {item.product_id}")
        if product.get('stock_quantity', 0) < item.quantity:
            raise HTTPException(400, f"Insufficient stock for {product['name']}: only {product.get('stock_quantity', 0)} left")

        unit_price = product['selling_price']
        item_discount = item.discount
        item_total = (unit_price * item.quantity) - item_discount
        cost = product.get('purchase_price', 0) * item.quantity

        items_data.append({
            'product_id': item.product_id,
            'product_name': product['name'],
            'sku': product.get('sku', ''),
            'quantity': item.quantity,
            'unit_price': unit_price,
            'discount': item_discount,
            'total': item_total,
            'cost': cost
        })
        total_cost += cost

    subtotal = sum(i['total'] for i in items_data)
    total_amount = subtotal - req.discount + req.tax

    cashback_discount = req.loyalty_points_redeemed * 0.1
    total_amount = max(0, total_amount - cashback_discount)

    payment_status = 'paid'
    paid_amount = total_amount
    balance_amount = 0.0

    if req.payment_mode == 'udhaar':
        payment_status = 'pending'
        paid_amount = 0.0
        balance_amount = total_amount
    elif req.paid_amount is not None and req.paid_amount < total_amount:
        payment_status = 'partial'
        paid_amount = req.paid_amount
        balance_amount = total_amount - req.paid_amount

    points_earned = total_amount / 10.0

    customer_name = req.customer_name
    if req.customer_id and not customer_name:
        cust = await db.customers.find_one({'id': req.customer_id, 'business_id': bid}, {'_id': 0, 'name': 1})
        if cust:
            customer_name = cust['name']

    invoice_number = await get_next_invoice_number(bid)
    sale_id = str(uuid.uuid4())

    sale_doc = {
        'id': sale_id,
        'business_id': bid,
        'invoice_number': invoice_number,
        'customer_id': req.customer_id,
        'customer_name': customer_name,
        'items': items_data,
        'subtotal': subtotal,
        'discount': req.discount,
        'tax': req.tax,
        'total_amount': total_amount,
        'total_cost': total_cost,
        'payment_mode': req.payment_mode,
        'payment_status': payment_status,
        'paid_amount': paid_amount,
        'balance_amount': balance_amount,
        'loyalty_points_earned': points_earned,
        'loyalty_points_redeemed': req.loyalty_points_redeemed,
        'notes': req.notes,
        'created_at': now.isoformat(),
        'created_by': user['user_id']
    }
    await db.sales.insert_one(sale_doc)

    for item in items_data:
        await db.products.update_one(
            {'id': item['product_id'], 'business_id': bid},
            {'$inc': {'stock_quantity': -item['quantity']}}
        )

    if req.customer_id:
        new_points = await db.customers.find_one({'id': req.customer_id}, {'_id': 0, 'loyalty_points': 1})
        current_points = new_points.get('loyalty_points', 0) if new_points else 0
        updated_points = current_points + points_earned - req.loyalty_points_redeemed
        membership = get_membership_level(updated_points)

        await db.customers.update_one(
            {'id': req.customer_id, 'business_id': bid},
            {'$inc': {'total_purchases': total_amount, 'total_visits': 1},
             '$set': {'last_purchase_at': now.isoformat(), 'loyalty_points': updated_points, 'membership_level': membership}}
        )
        await db.loyalty_transactions.insert_one({
            'id': str(uuid.uuid4()), 'business_id': bid, 'customer_id': req.customer_id,
            'sale_id': sale_id, 'points_earned': points_earned,
            'points_redeemed': req.loyalty_points_redeemed, 'created_at': now.isoformat()
        })

    if req.payment_mode == 'udhaar' and req.customer_id:
        udhaar_doc = await db.udhaar.find_one({'business_id': bid, 'customer_id': req.customer_id}, {'_id': 0})
        entry = {'date': now.isoformat(), 'description': f"Udhaar - {invoice_number}", 'amount': total_amount, 'type': 'given', 'sale_id': sale_id}
        if udhaar_doc:
            new_outstanding = udhaar_doc.get('outstanding', 0) + total_amount
            await db.udhaar.update_one(
                {'business_id': bid, 'customer_id': req.customer_id},
                {'$inc': {'total_credit': total_amount, 'outstanding': total_amount},
                 '$push': {'entries': entry}, '$set': {'last_transaction_at': now.isoformat()}}
            )
        else:
            cust_info = await db.customers.find_one({'id': req.customer_id}, {'_id': 0, 'name': 1, 'phone': 1})
            await db.udhaar.insert_one({
                'id': str(uuid.uuid4()), 'business_id': bid, 'customer_id': req.customer_id,
                'customer_name': cust_info.get('name', customer_name) if cust_info else customer_name,
                'customer_phone': cust_info.get('phone') if cust_info else None,
                'total_credit': total_amount, 'total_paid': 0.0, 'outstanding': total_amount,
                'entries': [entry], 'last_transaction_at': now.isoformat(), 'created_at': now.isoformat()
            })

    sale_doc.pop('_id', None)
    return sale_doc

@router.get("/{sale_id}")
async def get_sale(sale_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    sale = await db.sales.find_one({'$or': [{'id': sale_id}, {'invoice_number': sale_id}], 'business_id': bid}, {'_id': 0})
    if not sale:
        raise HTTPException(404, "Sale not found")
    return sale
