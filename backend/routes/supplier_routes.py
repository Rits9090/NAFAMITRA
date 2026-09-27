from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
from database import db
from auth import require_business

router = APIRouter()

class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None

class PurchaseItemModel(BaseModel):
    product_id: Optional[str] = None
    product_name: str
    quantity: int
    unit_price: float

class PurchaseCreate(BaseModel):
    supplier_id: str
    items: List[PurchaseItemModel]
    payment_mode: str = 'cash'
    paid_amount: Optional[float] = None
    notes: Optional[str] = None

@router.get("")
async def list_suppliers(user: dict = Depends(require_business)):
    bid = user['business_id']
    suppliers = await db.suppliers.find({'business_id': bid}, {'_id': 0}).sort('name', 1).to_list(100)
    return suppliers

@router.post("")
async def create_supplier(req: SupplierCreate, user: dict = Depends(require_business)):
    bid = user['business_id']
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'id': str(uuid.uuid4()), 'business_id': bid, 'name': req.name,
        'phone': req.phone, 'email': req.email, 'address': req.address,
        'gst_number': req.gst_number, 'total_purchases': 0.0,
        'total_paid': 0.0, 'outstanding': 0.0, 'created_at': now
    }
    await db.suppliers.insert_one(doc)
    doc.pop('_id', None)
    return doc

@router.put("/{supplier_id}")
async def update_supplier(supplier_id: str, req: SupplierCreate, user: dict = Depends(require_business)):
    bid = user['business_id']
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    await db.suppliers.update_one({'id': supplier_id, 'business_id': bid}, {'$set': updates})
    return await db.suppliers.find_one({'id': supplier_id, 'business_id': bid}, {'_id': 0})

@router.get("/purchases")
async def list_purchases(user: dict = Depends(require_business)):
    bid = user['business_id']
    purchases = await db.purchases.find({'business_id': bid}, {'_id': 0}).sort('created_at', -1).to_list(100)
    return purchases

@router.post("/purchases")
async def create_purchase(req: PurchaseCreate, user: dict = Depends(require_business)):
    bid = user['business_id']
    supplier = await db.suppliers.find_one({'id': req.supplier_id, 'business_id': bid}, {'_id': 0})
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    items_data = []
    for item in req.items:
        total = item.quantity * item.unit_price
        items_data.append({'product_id': item.product_id, 'product_name': item.product_name, 'quantity': item.quantity, 'unit_price': item.unit_price, 'total': total})
        if item.product_id:
            await db.products.update_one({'id': item.product_id, 'business_id': bid}, {'$inc': {'stock_quantity': item.quantity}})
            await db.inventory_movements.insert_one({
                'id': str(uuid.uuid4()), 'business_id': bid, 'product_id': item.product_id,
                'product_name': item.product_name, 'type': 'in', 'quantity': item.quantity,
                'notes': f"Purchase from {supplier['name']}", 'created_at': datetime.now(timezone.utc).isoformat()
            })

    total_amount = sum(i['total'] for i in items_data)
    paid_amount = req.paid_amount if req.paid_amount is not None else total_amount
    outstanding = total_amount - paid_amount

    now = datetime.now(timezone.utc).isoformat()
    purchase_doc = {
        'id': str(uuid.uuid4()), 'business_id': bid, 'supplier_id': req.supplier_id,
        'supplier_name': supplier['name'], 'items': items_data, 'total_amount': total_amount,
        'paid_amount': paid_amount, 'outstanding': outstanding,
        'payment_mode': req.payment_mode, 'notes': req.notes, 'created_at': now
    }
    await db.purchases.insert_one(purchase_doc)
    await db.suppliers.update_one({'id': req.supplier_id, 'business_id': bid}, {
        '$inc': {'total_purchases': total_amount, 'total_paid': paid_amount, 'outstanding': outstanding}
    })
    purchase_doc.pop('_id', None)
    return purchase_doc

@router.get("/{supplier_id}")
async def get_supplier(supplier_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    supplier = await db.suppliers.find_one({'id': supplier_id, 'business_id': bid}, {'_id': 0})
    if not supplier:
        raise HTTPException(404, "Supplier not found")
    purchases = await db.purchases.find({'business_id': bid, 'supplier_id': supplier_id}, {'_id': 0}).sort('created_at', -1).to_list(20)
    return {'supplier': supplier, 'purchases': purchases}
