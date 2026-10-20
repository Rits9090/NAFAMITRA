"""Requirements (माझ्या गरजा) — customer needs + retailer demand loop.

Visibility model (privacy-first, no broadcast to strangers):
  * shop_id set    → only that shop sees it (deliberate targeting).
  * shop_id unset  → only shops the customer already has a link with
                     (purchase/credit/loyalty relationship via shop_customers).
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from audit import log_action
from auth import require_business, require_portal
from database import db
from errors import AppError, NotFound
from routes.customer_portal_routes import _resolve_profile_ids

router = APIRouter()

VALID_STATUS = ('open', 'matched', 'fulfilled', 'cancelled')
SOURCES = ('manual', 'voice', 'reorder')


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    qty: int = Field(default=1, ge=1, le=10000)
    unit: str = Field(default='unit', max_length=20)
    color: str | None = Field(default=None, max_length=40)
    size: str | None = Field(default=None, max_length=40)


class RequirementIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    items: list[ItemIn] = []
    budget_paise: Optional[int] = Field(default=None, ge=0)
    need_by: Optional[str] = Field(default=None, max_length=40)
    category: Optional[str] = Field(default=None, max_length=60)
    shop_id: Optional[str] = Field(default=None, max_length=64)
    source: str = 'manual'
    # free-form structured detail: colour / size / intended user etc.
    notes: Optional[str] = Field(default=None, max_length=500)


class RequirementUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=160)
    items: Optional[list[ItemIn]] = None
    status: Optional[str] = None


class RetailerUpdate(BaseModel):
    retailer_notes: Optional[str] = Field(default=None, max_length=500)
    status: Optional[str] = None  # matched only — fulfilled/cancelled are the customer's call


async def _merchant_query(shop_id: str) -> dict:
    links = await db.shop_customers.find(
        {'shop_id': shop_id, 'status': 'active'},
        {'_id': 0, 'customer_id': 1}).to_list(5000)
    cids = [l['customer_id'] for l in links]
    clauses = [{'shop_id': shop_id}]
    if cids:
        clauses.append({'shop_id': None, 'customer_id': {'$in': cids}})
    return {'$or': clauses}


async def _serialize(row: dict, with_customer: bool = False) -> dict:
    row = dict(row)
    row.pop('_id', None)
    if with_customer and row.get('customer_id'):
        cust = await db.customers.find_one(
            {'id': row['customer_id']}, {'_id': 0, 'name': 1, 'nm_id': 1}) or {}
        row['customer_name'] = cust.get('name')
        row['customer_nm_id'] = cust.get('nm_id')
    if row.get('shop_id'):
        shop = await db.businesses.find_one(
            {'id': row['shop_id']}, {'_id': 0, 'name': 1}) or {}
        row['shop_name'] = shop.get('name')
    return row


# ---------------------------------------------------------------- customer
@router.post('')
async def create_requirement(req: RequirementIn, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    if req.source not in SOURCES:
        raise AppError('Unknown requirement source.', 400, 'bad_source')
    if req.shop_id:
        shop = await db.businesses.find_one({'id': req.shop_id}, {'_id': 0, 'id': 1})
        if not shop:
            raise NotFound('Shop not found.', 'दुकान सापडले नाही.')

    doc = {
        'id': str(uuid.uuid4()),
        'customer_id': ids[0],
        'shop_id': req.shop_id,
        'title': req.title.strip(),
        'items': [i.model_dump() for i in req.items],
        'budget_paise': req.budget_paise,
        'need_by': req.need_by,
        'category': req.category,
        'notes': req.notes,
        'status': 'open',
        'source': req.source,
        'retailer_notes': None,
        'created_at': _now(),
        'updated_at': _now(),
    }
    await db.requirements.insert_one(dict(doc))
    return {'requirement': doc}


@router.get('')
async def my_requirements(payload: dict = Depends(require_portal),
                          status: Optional[str] = None, limit: int = 100):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        return {'requirements': []}
    q: dict = {'customer_id': {'$in': ids}}
    if status:
        if status not in VALID_STATUS:
            raise AppError('Unknown status.', 400, 'bad_status')
        q['status'] = status
    rows = await db.requirements.find(q, {'_id': 0}).sort('created_at', -1).to_list(min(limit, 200))
    return {'requirements': [await _serialize(r) for r in rows]}


@router.patch('/{req_id}')
async def update_requirement(req_id: str, upd: RequirementUpdate,
                             payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    row = await db.requirements.find_one({'id': req_id}, {'_id': 0})
    if not row or row.get('customer_id') not in ids:
        raise NotFound('Requirement not found.', 'गरजा सापडली नाही.')

    changes: dict = {'updated_at': _now()}
    if upd.title is not None:
        changes['title'] = upd.title.strip()
    if upd.items is not None:
        changes['items'] = [i.model_dump() for i in upd.items]
    if upd.status is not None:
        if upd.status not in VALID_STATUS:
            raise AppError('Unknown status.', 400, 'bad_status')
        # customers decide outcome states; open/matched can move to fulfilled/cancelled,
        # and an open one can be reopened from cancelled.
        allowed = {
            'open': ('cancelled',),
            'matched': ('fulfilled', 'cancelled'),
            'fulfilled': (),
            'cancelled': ('open',),
        }
        if upd.status not in allowed.get(row['status'], ()):
            raise AppError(f"Cannot move requirement from {row['status']} to {upd.status}.",
                           400, 'bad_transition')
        changes['status'] = upd.status

    await db.requirements.update_one({'id': req_id}, {'$set': changes})
    row.update(changes)
    return {'requirement': await _serialize(row)}


# ---------------------------------------------------------------- retailer
@router.get('/shop/list')
async def shop_requirements(user: dict = Depends(require_business),
                            status: Optional[str] = None, limit: int = 100):
    q = await _merchant_query(user['shop_id'])
    if status:
        if status not in VALID_STATUS:
            raise AppError('Unknown status.', 400, 'bad_status')
        q['status'] = status
    rows = await db.requirements.find(q, {'_id': 0}).sort('created_at', -1).to_list(min(limit, 300))
    out = [await _serialize(r, with_customer=True) for r in rows]
    return {'requirements': out}


@router.patch('/shop/{req_id}')
async def shop_update_requirement(req_id: str, upd: RetailerUpdate,
                                  user: dict = Depends(require_business)):
    shop_id = user['shop_id']
    q = await _merchant_query(shop_id)
    q['id'] = req_id
    row = await db.requirements.find_one(q, {'_id': 0})
    if not row:
        raise NotFound('Requirement not found.', 'गरजा सापडली नाही.')

    changes: dict = {'updated_at': _now()}
    if upd.retailer_notes is not None:
        changes['retailer_notes'] = upd.retailer_notes.strip() or None
    if upd.status is not None:
        if upd.status != 'matched':
            raise AppError('Retailers can only mark a requirement as matched.',
                           400, 'bad_status')
        if row['status'] != 'open':
            raise AppError('Only open requirements can be matched.', 400, 'bad_transition')
        changes['status'] = 'matched'

    await db.requirements.update_one({'id': req_id}, {'$set': changes})
    row.update(changes)

    if changes.get('status') == 'matched':
        from routes.notify_routes import notify_customer
        await notify_customer(
            row['customer_id'], shop_id, 'requirement',
            title_key='notif.requirementMatched',
            params={'title': row['title']})
        await log_action(shop_id, user['user_id'], 'requirement_matched',
                         'requirement', req_id, {'title': row['title']})

    return {'requirement': await _serialize(row, with_customer=True)}
