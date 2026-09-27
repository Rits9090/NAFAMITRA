from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone
import uuid
from database import db
from auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    phone: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class BusinessSetupRequest(BaseModel):
    name: str
    category: str
    address: Optional[str] = None
    phone: Optional[str] = None
    gst_number: Optional[str] = None

@router.post("/register")
async def register(req: RegisterRequest):
    existing = await db.users.find_one({'email': req.email.lower()}, {'_id': 0})
    if existing:
        raise HTTPException(400, "Email already registered")

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user_doc = {
        'id': user_id,
        'email': req.email.lower(),
        'password_hash': hash_password(req.password),
        'name': req.name,
        'phone': req.phone,
        'business_id': None,
        'role': 'owner',
        'is_active': True,
        'created_at': now
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, req.email.lower(), None, 'owner')
    return {'token': token, 'user': {k: v for k, v in user_doc.items() if k not in ('password_hash', '_id')}}

@router.post("/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({'email': req.email.lower()}, {'_id': 0})
    if not user or not verify_password(req.password, user.get('password_hash', '')):
        raise HTTPException(401, "Invalid email or password")

    token = create_access_token(user['id'], user['email'], user.get('business_id'), user.get('role', 'owner'))
    safe_user = {k: v for k, v in user.items() if k != 'password_hash'}

    business = None
    if user.get('business_id'):
        business = await db.businesses.find_one({'id': user['business_id']}, {'_id': 0})

    return {'token': token, 'user': safe_user, 'business': business}

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({'id': current_user['user_id']}, {'_id': 0, 'password_hash': 0})
    if not user:
        raise HTTPException(404, "User not found")
    business = None
    if user.get('business_id'):
        business = await db.businesses.find_one({'id': user['business_id']}, {'_id': 0})
    return {'user': user, 'business': business}

@router.post("/setup-business")
async def setup_business(req: BusinessSetupRequest, current_user: dict = Depends(get_current_user)):
    business_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    business_doc = {
        'id': business_id,
        'name': req.name,
        'category': req.category,
        'owner_id': current_user['user_id'],
        'address': req.address,
        'phone': req.phone,
        'gst_number': req.gst_number,
        'subscription_plan': 'free',
        'logo_url': None,
        'settings': {
            'loyalty_points_per_100': 1,
            'silver_threshold': 500,
            'gold_threshold': 2000,
            'vip_threshold': 5000,
            'currency': 'INR'
        },
        'created_at': now
    }
    await db.businesses.insert_one(business_doc)
    await db.users.update_one({'id': current_user['user_id']}, {'$set': {'business_id': business_id}})

    new_token = create_access_token(current_user['user_id'], current_user['email'], business_id, current_user.get('role', 'owner'))
    business_doc.pop('_id', None)
    return {'token': new_token, 'business': business_doc}

@router.put("/business")
async def update_business(req: BusinessSetupRequest, current_user: dict = Depends(get_current_user)):
    business_id = current_user.get('business_id')
    if not business_id:
        raise HTTPException(404, "No business found")
    await db.businesses.update_one({'id': business_id}, {'$set': {
        'name': req.name, 'category': req.category,
        'address': req.address, 'phone': req.phone, 'gst_number': req.gst_number
    }})
    business = await db.businesses.find_one({'id': business_id}, {'_id': 0})
    return business
