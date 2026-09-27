from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from database import db
from auth import require_business

router = APIRouter()

class UdhaarCreate(BaseModel):
    customer_id: str
    amount: float
    description: Optional[str] = "Udhaar given"

class PaymentRecord(BaseModel):
    amount: float
    payment_mode: str = 'cash'
    notes: Optional[str] = None

@router.get("")
async def list_udhaar(user: dict = Depends(require_business)):
    bid = user['business_id']
    udhaars = await db.udhaar.find({'business_id': bid}, {'_id': 0}).sort('outstanding', -1).to_list(200)
    total_outstanding = sum(u.get('outstanding', 0) for u in udhaars if u.get('outstanding', 0) > 0)
    return {'udhaars': udhaars, 'total_outstanding': total_outstanding}

@router.post("")
async def create_udhaar(req: UdhaarCreate, user: dict = Depends(require_business)):
    bid = user['business_id']
    customer = await db.customers.find_one({'id': req.customer_id, 'business_id': bid}, {'_id': 0})
    if not customer:
        raise HTTPException(404, "Customer not found")

    now = datetime.now(timezone.utc).isoformat()
    entry = {'date': now, 'description': req.description, 'amount': req.amount, 'type': 'given'}
    existing = await db.udhaar.find_one({'business_id': bid, 'customer_id': req.customer_id}, {'_id': 0})

    if existing:
        await db.udhaar.update_one(
            {'business_id': bid, 'customer_id': req.customer_id},
            {'$inc': {'total_credit': req.amount, 'outstanding': req.amount},
             '$push': {'entries': entry}, '$set': {'last_transaction_at': now}}
        )
        return await db.udhaar.find_one({'business_id': bid, 'customer_id': req.customer_id}, {'_id': 0})
    else:
        doc = {
            'id': str(uuid.uuid4()), 'business_id': bid, 'customer_id': req.customer_id,
            'customer_name': customer['name'], 'customer_phone': customer.get('phone'),
            'total_credit': req.amount, 'total_paid': 0.0, 'outstanding': req.amount,
            'entries': [entry], 'last_transaction_at': now, 'created_at': now
        }
        await db.udhaar.insert_one(doc)
        doc.pop('_id', None)
        return doc

@router.post("/{udhaar_id}/payment")
async def record_payment(udhaar_id: str, req: PaymentRecord, user: dict = Depends(require_business)):
    bid = user['business_id']
    udhaar = await db.udhaar.find_one({'id': udhaar_id, 'business_id': bid}, {'_id': 0})
    if not udhaar:
        raise HTTPException(404, "Udhaar account not found")
    if req.amount > udhaar.get('outstanding', 0):
        raise HTTPException(400, f"Payment ₹{req.amount} exceeds outstanding ₹{udhaar.get('outstanding', 0):.2f}")

    now = datetime.now(timezone.utc).isoformat()
    entry = {
        'date': now,
        'description': f"Payment received - {req.payment_mode.upper()}{(' - ' + req.notes) if req.notes else ''}",
        'amount': req.amount,
        'type': 'received',
        'payment_mode': req.payment_mode
    }
    await db.udhaar.update_one(
        {'id': udhaar_id, 'business_id': bid},
        {'$inc': {'total_paid': req.amount, 'outstanding': -req.amount},
         '$push': {'entries': entry}, '$set': {'last_transaction_at': now}}
    )
    return await db.udhaar.find_one({'id': udhaar_id, 'business_id': bid}, {'_id': 0})

@router.get("/{udhaar_id}")
async def get_udhaar(udhaar_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    udhaar = await db.udhaar.find_one({'id': udhaar_id, 'business_id': bid}, {'_id': 0})
    if not udhaar:
        udhaar = await db.udhaar.find_one({'customer_id': udhaar_id, 'business_id': bid}, {'_id': 0})
    if not udhaar:
        raise HTTPException(404, "Udhaar not found")
    return udhaar
