"""Favorite shops (customer-side). Append-only preference, unique per pair."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from auth import require_portal
from database import db
from errors import AppError, NotFound
from routes.customer_portal_routes import _resolve_profile_ids

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get('')
async def list_favorites(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        return {'favorites': []}
    rows = await db.favorites.find({'customer_id': {'$in': ids}},
                                   {'_id': 0}).sort('created_at', -1).to_list(100)
    out = []
    for r in rows:
        shop = await db.businesses.find_one(
            {'id': r['shop_id']}, {'_id': 0, 'name': 1, 'category': 1, 'city': 1}) or {}
        if not shop:
            continue  # shop removed → drop silently from view
        out.append({
            'shop_id': r['shop_id'],
            'shop_name': shop.get('name'),
            'category': shop.get('category'),
            'city': shop.get('city') or shop.get('location'),
            'created_at': r.get('created_at'),
        })
    return {'favorites': out}


@router.post('')
async def add_favorite(body: dict, payload: dict = Depends(require_portal)):
    shop_id = (body or {}).get('shop_id') or ''
    if not shop_id:
        raise AppError('shop_id is required.', 400, 'missing_shop')
    shop = await db.businesses.find_one({'id': shop_id}, {'_id': 0, 'id': 1})
    if not shop:
        raise NotFound('Shop not found.', 'दुकान सापडले नाही.')
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    cid = ids[0]
    try:
        await db.favorites.insert_one({
            'id': str(uuid.uuid4()), 'customer_id': cid, 'shop_id': shop_id,
            'created_at': _now(),
        })
    except Exception:
        pass  # already favorited — idempotent
    return {'favorite': True, 'shop_id': shop_id}


@router.delete('/{shop_id}')
async def remove_favorite(shop_id: str, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if ids:
        await db.favorites.delete_many({'customer_id': {'$in': ids}, 'shop_id': shop_id})
    return {'favorite': False, 'shop_id': shop_id}
