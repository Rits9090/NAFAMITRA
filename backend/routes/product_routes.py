from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from database import db
from auth import require_business

router = APIRouter()

class ProductCreate(BaseModel):
    name: str
    category: str
    selling_price: float
    purchase_price: float
    stock_quantity: int = 0
    low_stock_threshold: int = 5
    sku: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    unit: str = 'piece'
    image_url: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    selling_price: Optional[float] = None
    purchase_price: Optional[float] = None
    stock_quantity: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    sku: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None

class StockUpdate(BaseModel):
    quantity: int
    type: str = 'in'  # in or out
    notes: Optional[str] = None

@router.get("")
async def list_products(
    search: Optional[str] = None,
    category: Optional[str] = None,
    stock_status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_business)
):
    bid = user['business_id']
    query = {'business_id': bid, 'is_active': True}
    if search:
        query['$or'] = [
            {'name': {'$regex': search, '$options': 'i'}},
            {'sku': {'$regex': search, '$options': 'i'}}
        ]
    if category:
        query['category'] = category

    total = await db.products.count_documents(query)
    skip = (page - 1) * limit
    products = await db.products.find(query, {'_id': 0}).sort('name', 1).skip(skip).limit(limit).to_list(limit)

    if stock_status == 'low':
        products = [p for p in products if p.get('stock_quantity', 0) <= p.get('low_stock_threshold', 5)]
    elif stock_status == 'out':
        products = [p for p in products if p.get('stock_quantity', 0) == 0]

    for p in products:
        if p.get('stock_quantity', 0) == 0:
            p['stock_status'] = 'out_of_stock'
        elif p.get('stock_quantity', 0) <= p.get('low_stock_threshold', 5):
            p['stock_status'] = 'low_stock'
        else:
            p['stock_status'] = 'in_stock'
        if p.get('purchase_price', 0) > 0:
            p['margin_pct'] = round((p.get('selling_price', 0) - p.get('purchase_price', 0)) / p.get('purchase_price', 1) * 100, 1)

    return {'products': products, 'total': total}

@router.get("/low-stock")
async def get_low_stock(user: dict = Depends(require_business)):
    bid = user['business_id']
    products = await db.products.find({
        'business_id': bid,
        'is_active': True,
        '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}
    }, {'_id': 0}).sort('stock_quantity', 1).to_list(50)
    return products

@router.get("/categories")
async def get_categories(user: dict = Depends(require_business)):
    bid = user['business_id']
    categories = await db.products.distinct('category', {'business_id': bid, 'is_active': True})
    return categories

@router.post("")
async def create_product(req: ProductCreate, user: dict = Depends(require_business)):
    bid = user['business_id']
    sku = req.sku or f"SKU{str(uuid.uuid4())[:6].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'id': str(uuid.uuid4()),
        'business_id': bid,
        'sku': sku,
        'name': req.name,
        'category': req.category,
        'brand': req.brand,
        'description': req.description,
        'selling_price': req.selling_price,
        'purchase_price': req.purchase_price,
        'stock_quantity': req.stock_quantity,
        'low_stock_threshold': req.low_stock_threshold,
        'unit': req.unit,
        'image_url': req.image_url,
        'is_active': True,
        'created_at': now
    }
    await db.products.insert_one(doc)
    doc.pop('_id', None)
    return doc

@router.get("/{product_id}")
async def get_product(product_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    product = await db.products.find_one({'id': product_id, 'business_id': bid}, {'_id': 0})
    if not product:
        raise HTTPException(404, "Product not found")
    return product

@router.put("/{product_id}")
async def update_product(product_id: str, req: ProductUpdate, user: dict = Depends(require_business)):
    bid = user['business_id']
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updates['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.products.update_one({'id': product_id, 'business_id': bid}, {'$set': updates})
    return await db.products.find_one({'id': product_id, 'business_id': bid}, {'_id': 0})

@router.post("/{product_id}/stock")
async def update_stock(product_id: str, req: StockUpdate, user: dict = Depends(require_business)):
    bid = user['business_id']
    product = await db.products.find_one({'id': product_id, 'business_id': bid}, {'_id': 0})
    if not product:
        raise HTTPException(404, "Product not found")

    delta = req.quantity if req.type == 'in' else -req.quantity
    new_qty = product.get('stock_quantity', 0) + delta
    if new_qty < 0:
        raise HTTPException(400, "Insufficient stock")

    await db.products.update_one({'id': product_id, 'business_id': bid}, {'$set': {'stock_quantity': new_qty}})
    # Log movement
    await db.inventory_movements.insert_one({
        'id': str(uuid.uuid4()),
        'business_id': bid,
        'product_id': product_id,
        'product_name': product['name'],
        'type': req.type,
        'quantity': req.quantity,
        'notes': req.notes,
        'created_at': datetime.now(timezone.utc).isoformat()
    })
    return {'product_id': product_id, 'new_stock': new_qty}

@router.delete("/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    await db.products.update_one({'id': product_id, 'business_id': bid}, {'$set': {'is_active': False}})
    return {'success': True}
