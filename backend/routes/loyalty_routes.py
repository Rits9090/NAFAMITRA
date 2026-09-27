from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid
from database import db
from auth import require_business

router = APIRouter()

class LoyaltyRulesUpdate(BaseModel):
    points_per_100: float = 1.0
    silver_threshold: float = 500
    gold_threshold: float = 2000
    vip_threshold: float = 5000
    redemption_value: float = 0.1

class RedeemRequest(BaseModel):
    customer_id: str
    points: float

@router.get("/rules")
async def get_loyalty_rules(user: dict = Depends(require_business)):
    bid = user['business_id']
    business = await db.businesses.find_one({'id': bid}, {'_id': 0, 'settings': 1})
    settings = business.get('settings', {}) if business else {}
    return {
        'points_per_100': settings.get('loyalty_points_per_100', 1),
        'silver_threshold': settings.get('silver_threshold', 500),
        'gold_threshold': settings.get('gold_threshold', 2000),
        'vip_threshold': settings.get('vip_threshold', 5000),
        'redemption_value': settings.get('redemption_value', 0.1)
    }

@router.put("/rules")
async def update_loyalty_rules(req: LoyaltyRulesUpdate, user: dict = Depends(require_business)):
    bid = user['business_id']
    await db.businesses.update_one({'id': bid}, {'$set': {
        'settings.loyalty_points_per_100': req.points_per_100,
        'settings.silver_threshold': req.silver_threshold,
        'settings.gold_threshold': req.gold_threshold,
        'settings.vip_threshold': req.vip_threshold,
        'settings.redemption_value': req.redemption_value
    }})
    return {'success': True, 'rules': req.model_dump()}

@router.get("/leaderboard")
async def get_leaderboard(user: dict = Depends(require_business)):
    bid = user['business_id']
    customers = await db.customers.find(
        {'business_id': bid, 'is_active': True, 'loyalty_points': {'$gt': 0}},
        {'_id': 0, 'name': 1, 'customer_id': 1, 'loyalty_points': 1, 'membership_level': 1, 'total_purchases': 1}
    ).sort('loyalty_points', -1).to_list(20)
    return customers

@router.get("/transactions")
async def get_loyalty_transactions(user: dict = Depends(require_business)):
    bid = user['business_id']
    transactions = await db.loyalty_transactions.find({'business_id': bid}, {'_id': 0}).sort('created_at', -1).to_list(50)
    customer_cache = {}
    for tx in transactions:
        cid = tx.get('customer_id')
        if cid and cid not in customer_cache:
            cust = await db.customers.find_one({'id': cid}, {'_id': 0, 'name': 1, 'customer_id': 1})
            customer_cache[cid] = cust
        tx['customer'] = customer_cache.get(cid)
    return transactions

@router.get("/account/{customer_id}")
async def get_loyalty_account(customer_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    customer = await db.customers.find_one({'id': customer_id, 'business_id': bid}, {'_id': 0})
    if not customer:
        raise HTTPException(404, "Customer not found")
    transactions = await db.loyalty_transactions.find({'business_id': bid, 'customer_id': customer_id}, {'_id': 0}).sort('created_at', -1).to_list(20)
    return {
        'customer_id': customer_id, 'name': customer['name'],
        'points': customer.get('loyalty_points', 0),
        'membership_level': customer.get('membership_level', 'bronze'),
        'transactions': transactions
    }
