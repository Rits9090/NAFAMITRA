"""धनलाभ (loyalty) routes — per-shop accounts, append-only ledger.

The consumer-facing term is "धनलाभ"; internally the domain keeps standard
loyalty terminology (points, transactions).  Balances are ALWAYS per shop —
never summed across shops for redemption.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from audit import log_action
from auth import require_business, require_role
from billing import add_loyalty_tx, loyalty_settings
from database import db
from errors import AppError, NotFound, Forbidden

router = APIRouter()


class RulesUpdate(BaseModel):
    points_per_100: int = Field(ge=0, le=100)
    redemption_value: float = Field(ge=0, le=100)   # rupees per point
    loyalty_enabled: bool = True


@router.get("/rules")
async def get_loyalty_rules(user: dict = Depends(require_business)):
    settings = await loyalty_settings(user['shop_id'])
    return {
        'points_per_100': settings['points_per_100'],
        'redemption_value': settings['redemption_value_paise'] / 100.0,
        'redemption_value_paise': settings['redemption_value_paise'],
        'loyalty_enabled': settings['enabled'],
    }


@router.put("/rules")
async def update_loyalty_rules(req: RulesUpdate, user: dict = Depends(require_role('owner'))):
    """Loyalty rules are owner-only (cashiers/managers cannot change them)."""
    redemption_paise = int(round(req.redemption_value * 100))
    await db.businesses.update_one({'id': user['shop_id']}, {'$set': {
        'settings.loyalty_points_per_100': req.points_per_100,
        'settings.redemption_value_paise': redemption_paise,
        'settings.redemption_value': req.redemption_value,
        'settings.loyalty_enabled': req.loyalty_enabled,
        'updated_at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
    }})
    await log_action(user['shop_id'], user['user_id'], 'loyalty_rules_changed',
                     'shop', user['shop_id'], {
                         'old_value': None,
                         'new_value': f'{req.points_per_100}/100, ₹{req.redemption_value}/pt',
                     })
    return {'success': True, 'rules': await loyalty_settings(user['shop_id'])}


@router.get("/leaderboard")
async def get_leaderboard(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    accounts = await db.loyalty_accounts.find(
        {'shop_id': shop_id, 'balance': {'$gt': 0}}, {'_id': 0}).to_list(100)
    accounts.sort(key=lambda a: -a.get('balance', 0))
    out = []
    for acc in accounts[:20]:
        customer = await db.customers.find_one({'id': acc['customer_id']}, {'_id': 0}) or {}
        link = await db.shop_customers.find_one(
            {'shop_id': shop_id, 'customer_id': acc['customer_id']}, {'_id': 0}) or {}
        out.append({
            'customer_id': acc['customer_id'],
            'nm_id': customer.get('nm_id'),
            'name': link.get('display_name') or customer.get('name'),
            'loyalty_points': acc.get('balance', 0),
            'total_purchases': link.get('purchase_count', 0),
            'membership_level': _tier(acc.get('balance', 0)),
        })
    return out


def _tier(points: int) -> str:
    if points >= 5000:
        return 'vip'
    if points >= 2000:
        return 'gold'
    if points >= 500:
        return 'silver'
    return 'bronze'


@router.get("/transactions")
async def get_loyalty_transactions(user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    txs = await db.loyalty_transactions.find({'shop_id': shop_id},
                                             {'_id': 0}).sort('created_at', -1).to_list(50)
    cache = {}
    for tx in txs:
        cid = tx.get('customer_id')
        if cid and cid not in cache:
            cust = await db.customers.find_one({'id': cid}, {'_id': 0}) or {}
            cache[cid] = {'name': cust.get('name'), 'nm_id': cust.get('nm_id')}
        tx['customer'] = cache.get(cid)
    return txs


@router.get("/account/{customer_id}")
async def get_loyalty_account(customer_id: str, user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    customer = await db.customers.find_one(
        {'$or': [{'id': customer_id}, {'nm_id': customer_id.upper()}]}, {'_id': 0})
    if not customer:
        raise NotFound('Customer not found.', 'ग्राहक सापडला नाही.')
    link = await db.shop_customers.find_one(
        {'shop_id': shop_id, 'customer_id': customer['id']}, {'_id': 0})
    if not link:
        raise NotFound('Customer not found in your shop.', 'तुमच्या दुकानात हा ग्राहक नाही.')
    account = await db.loyalty_accounts.find_one(
        {'shop_id': shop_id, 'customer_id': customer['id']}, {'_id': 0}) or {
        'shop_id': shop_id, 'customer_id': customer['id'], 'balance': 0}
    txs = await db.loyalty_transactions.find(
        {'shop_id': shop_id, 'customer_id': customer['id']},
        {'_id': 0}).sort('created_at', -1).to_list(50)
    return {
        'customer_id': customer['id'], 'name': customer.get('name'),
        'nm_id': customer.get('nm_id'),
        'points': account.get('balance', 0),
        'membership_level': _tier(account.get('balance', 0)),
        'transactions': txs,
        'rules': await loyalty_settings(shop_id),
    }


class AdjustRequest(BaseModel):
    points: int
    note: Optional[str] = None


@router.post("/adjust/{customer_id}")
async def adjust_loyalty(customer_id: str, req: AdjustRequest,
                         user: dict = Depends(require_role('owner'))):
    """Manual correction — recorded as ADJUSTMENT, never an overwrite."""
    shop_id = user['shop_id']
    if req.points == 0:
        raise AppError('Enter a non-zero point change.', 400, 'bad_points',
                       'शून्यपेक्षा वेगळी पॉइंटस नोंदवा.')
    link = await db.shop_customers.find_one(
        {'shop_id': shop_id, 'customer_id': customer_id}, {'_id': 0})
    if not link:
        raise NotFound('Customer not found in your shop.', 'तुमच्या दुकानात हा ग्राहक नाही.')
    tx = await add_loyalty_tx(shop_id, customer_id, 'ADJUSTMENT', int(req.points),
                              actor_id=user['user_id'], note=req.note)
    await log_action(shop_id, user['user_id'], 'loyalty_adjusted', 'customer',
                     customer_id, {'points': int(req.points)})
    return tx
