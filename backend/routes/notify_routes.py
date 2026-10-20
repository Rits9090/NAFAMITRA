"""Customer notification centre + per-category consent (marketing separate)."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import require_portal
from database import db
from errors import AppError, NotFound
from routes.customer_portal_routes import _resolve_profile_ids

router = APIRouter()

CATEGORIES = ('transaction', 'benefit', 'reminder', 'requirement', 'shop', 'marketing')
# marketing is opt-IN: default False. Everything else defaults True.
DEFAULT_PREFS = {c: (c != 'marketing') for c in CATEGORIES}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def notify_customer(customer_id: str, shop_id: str, category: str,
                          title_key: Optional[str] = None,
                          title: Optional[str] = None,
                          params: Optional[dict] = None) -> bool:
    """Insert an in-app notification if the customer's prefs allow the category.

    Returns False when suppressed (e.g. marketing without consent). Never
    claims delivery of SMS/WhatsApp/email — this is in-app only.
    """
    if category not in CATEGORIES:
        return False
    prefs = await db.notification_prefs.find_one(
        {'customer_id': customer_id}, {'_id': 0}) or {}
    enabled = prefs.get(category, DEFAULT_PREFS[category])
    if not enabled:
        return False
    await db.customer_notifications.insert_one({
        'id': __import__('uuid').uuid4().hex,
        'customer_id': customer_id,
        'shop_id': shop_id,
        'category': category,
        'title_key': title_key,
        'title': title,
        'params': params or {},
        'read_at': None,
        'created_at': _now(),
    })
    return True


class PrefsIn(BaseModel):
    transaction: Optional[bool] = None
    benefit: Optional[bool] = None
    reminder: Optional[bool] = None
    requirement: Optional[bool] = None
    shop: Optional[bool] = None
    marketing_consent: Optional[bool] = None


@router.get('')
async def list_notifications(payload: dict = Depends(require_portal),
                             category: Optional[str] = None,
                             unread: bool = False, limit: int = 50):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        return {'notifications': [], 'unread': 0}
    if category and category not in CATEGORIES:
        raise AppError('Unknown category.', 400, 'bad_category')
    q: dict = {'customer_id': {'$in': ids}}
    if category:
        q['category'] = category
    if unread:
        q['read_at'] = None
    rows = await db.customer_notifications.find(
        q, {'_id': 0}).sort('created_at', -1).to_list(min(limit, 200))
    unread_count = await db.customer_notifications.count_documents(
        {'customer_id': {'$in': ids}, 'read_at': None})
    shop_ids = {r['shop_id'] for r in rows}
    names = {}
    if shop_ids:
        for s in await db.businesses.find({'id': {'$in': list(shop_ids)}},
                                          {'_id': 0, 'id': 1, 'name': 1}).to_list(len(shop_ids)):
            names[s['id']] = s.get('name')
    for r in rows:
        r['shop_name'] = names.get(r['shop_id'])
    return {'notifications': rows, 'unread': unread_count}


@router.get('/unread-count')
async def unread_count(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        return {'unread': 0}
    return {'unread': await db.customer_notifications.count_documents(
        {'customer_id': {'$in': ids}, 'read_at': None})}


@router.post('/{notif_id}/read')
async def mark_read(notif_id: str, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('Notification not found.', 'सूचना सापडली नाही.')
    await db.customer_notifications.update_one(
        {'id': notif_id, 'customer_id': {'$in': ids}},
        {'$set': {'read_at': _now()}})
    return {'ok': True}


@router.post('/read-all')
async def mark_all_read(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        return {'ok': True}
    await db.customer_notifications.update_many(
        {'customer_id': {'$in': ids}, 'read_at': None},
        {'$set': {'read_at': _now()}})
    return {'ok': True}


@router.get('/prefs')
async def get_prefs(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    stored = {}
    if ids:
        stored = await db.notification_prefs.find_one(
            {'customer_id': {'$in': ids[:1]}}, {'_id': 0}) or {}
    prefs = {c: bool(stored.get(c, DEFAULT_PREFS[c])) for c in CATEGORIES}
    return {'prefs': prefs, 'marketing_consent': prefs['marketing']}


@router.put('/prefs')
async def set_prefs(req: PrefsIn, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    cid = ids[0]
    updates: dict = {}
    for cat in CATEGORIES:
        val = getattr(req, 'marketing_consent' if cat == 'marketing' else cat, None)
        if val is not None:
            updates[cat] = bool(val)
    if not updates:
        stored = await db.notification_prefs.find_one({'customer_id': cid}, {'_id': 0}) or {}
        prefs = {c: bool(stored.get(c, DEFAULT_PREFS[c])) for c in CATEGORIES}
        return {'prefs': prefs, 'marketing_consent': prefs['marketing']}
    updates['updated_at'] = _now()
    await db.notification_prefs.update_one(
        {'customer_id': cid},
        {'$set': {**updates, 'customer_id': cid, 'created_at': _now()}},
        upsert=True)
    stored = await db.notification_prefs.find_one({'customer_id': cid}, {'_id': 0}) or {}
    prefs = {c: bool(stored.get(c, DEFAULT_PREFS[c])) for c in CATEGORIES}
    return {'prefs': prefs, 'marketing_consent': prefs['marketing']}
