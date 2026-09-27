from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
from database import db
from auth import require_business

router = APIRouter()

class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = []

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None

def generate_referral_code(name: str, cid: str) -> str:
    initials = ''.join(w[0].upper() for w in name.split()[:2])
    suffix = cid[-4:]
    return f"NM{initials}{suffix}"

async def get_next_customer_id(business_id: str) -> str:
    count = await db.customers.count_documents({'business_id': business_id})
    return f"NF{(count + 1):03d}"

def get_membership_level(points: float) -> str:
    if points >= 5000: return 'vip'
    if points >= 2000: return 'gold'
    if points >= 500: return 'silver'
    return 'bronze'

@router.get("")
async def list_customers(
    search: Optional[str] = None,
    tag: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_business)
):
    bid = user['business_id']
    query = {'business_id': bid, 'is_active': True}
    if search:
        query['$or'] = [
            {'name': {'$regex': search, '$options': 'i'}},
            {'phone': {'$regex': search, '$options': 'i'}},
            {'customer_id': {'$regex': search, '$options': 'i'}}
        ]
    if tag:
        query['tags'] = tag

    total = await db.customers.count_documents(query)
    skip = (page - 1) * limit
    customers = await db.customers.find(query, {'_id': 0}).sort('name', 1).skip(skip).limit(limit).to_list(limit)
    return {'customers': customers, 'total': total, 'page': page, 'pages': (total + limit - 1) // limit}

@router.post("")
async def create_customer(req: CustomerCreate, user: dict = Depends(require_business)):
    bid = user['business_id']
    if req.phone:
        existing = await db.customers.find_one({'business_id': bid, 'phone': req.phone}, {'_id': 0})
        if existing:
            raise HTTPException(400, "Customer with this phone already exists")

    cid_str = str(uuid.uuid4())[:8]
    customer_id = await get_next_customer_id(bid)
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        'id': str(uuid.uuid4()),
        'business_id': bid,
        'customer_id': customer_id,
        'name': req.name,
        'phone': req.phone,
        'email': req.email,
        'birthday': req.birthday,
        'tags': req.tags or [],
        'notes': req.notes,
        'membership_level': 'bronze',
        'loyalty_points': 0.0,
        'cashback_balance': 0.0,
        'referral_code': generate_referral_code(req.name, cid_str),
        'referred_by': None,
        'total_purchases': 0.0,
        'total_visits': 0,
        'last_purchase_at': None,
        'is_active': True,
        'created_at': now
    }
    await db.customers.insert_one(doc)
    doc.pop('_id', None)
    return doc

@router.get("/search")
async def search_customers(q: str = Query(...), user: dict = Depends(require_business)):
    bid = user['business_id']
    customers = await db.customers.find({
        'business_id': bid,
        'is_active': True,
        '$or': [
            {'name': {'$regex': q, '$options': 'i'}},
            {'phone': {'$regex': q, '$options': 'i'}}
        ]
    }, {'_id': 0}).limit(10).to_list(10)
    return customers

@router.get("/:id/history")
async def get_customer_history(id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    customer = await db.customers.find_one({'id': id, 'business_id': bid}, {'_id': 0})
    if not customer:
        raise HTTPException(404, "Customer not found")
    sales = await db.sales.find({'business_id': bid, 'customer_id': id}, {'_id': 0}).sort('created_at', -1).to_list(50)
    udhaar = await db.udhaar.find_one({'business_id': bid, 'customer_id': id}, {'_id': 0})
    return {'customer': customer, 'sales': sales, 'udhaar': udhaar}

@router.get("/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    customer = await db.customers.find_one({'$or': [{'id': customer_id}, {'customer_id': customer_id}], 'business_id': bid}, {'_id': 0})
    if not customer:
        raise HTTPException(404, "Customer not found")
    sales = await db.sales.find({'business_id': bid, 'customer_id': customer.get('id')}, {'_id': 0}).sort('created_at', -1).to_list(20)
    udhaar = await db.udhaar.find_one({'business_id': bid, 'customer_id': customer.get('id')}, {'_id': 0})
    return {'customer': customer, 'recent_sales': sales, 'udhaar': udhaar}

@router.put("/{customer_id}")
async def update_customer(customer_id: str, req: CustomerUpdate, user: dict = Depends(require_business)):
    bid = user['business_id']
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updates['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.customers.update_one({'id': customer_id, 'business_id': bid}, {'$set': updates})
    return await db.customers.find_one({'id': customer_id, 'business_id': bid}, {'_id': 0})

@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    await db.customers.update_one({'id': customer_id, 'business_id': bid}, {'$set': {'is_active': False}})
    return {'success': True}
