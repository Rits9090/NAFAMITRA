"""First-party activation analytics + internal shop-health (pilot admin).

No third-party trackers, no PII beyond what the app already sends.
Analytics events are best-effort and never block a user action.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from auth import decode_token, require_role, resolve_shop_id
from config import ADMIN_PHONES
from database import db
from phones import normalize_phone

router = APIRouter(prefix='/analytics', tags=['analytics'])


def _iso(dt: datetime) -> str:
    return dt.isoformat()


class EventIn(BaseModel):
    event: str = Field(min_length=1, max_length=64)
    props: Optional[dict] = None


@router.post('/events')
async def track_event(body: EventIn, authorization: Optional[str] = Header(None)):
    """Best-effort activation event sink. Never raises to the client."""
    user_id = None
    shop_id = None
    if authorization and authorization.lower().startswith('bearer '):
        try:
            payload = decode_token(authorization.split(' ', 1)[1])
            user_id = payload.get('user_id')
            # Resolve via membership, not the token claim: the OTP session is
            # issued before any shop exists, so business_id may be stale/null.
            shop_id, _membership = await resolve_shop_id(payload, None)
        except Exception:
            pass
    doc = {
        'event': body.event[:64],
        'props': body.props or {},
        'user_id': user_id,
        'shop_id': shop_id,
        'at': _iso(datetime.now(timezone.utc)),
    }
    try:
        await db.analytics_events.insert_one(dict(doc))
    except Exception:
        pass  # analytics must never break the UX
    return {'ok': True}


@router.get('/events')
async def list_events(limit: int = 50, user: dict = Depends(require_role('owner'))):
    """Merchant-scoped event list (owners only)."""
    cur = db.analytics_events.find({'shop_id': user['shop_id']}, {'_id': 0}) \
        .sort('at', -1).limit(min(limit, 200))
    return {'events': [e async for e in cur]}


# ------------------------------------------------------------------ admin --

admin_router = APIRouter(prefix='/admin', tags=['admin'])


@admin_router.get('/shop-health')
async def shop_health(x_admin_phone: Optional[str] = Header(None)):
    """Internal pilot dashboard for ~30 shops. 404 unless ADMIN_PHONES is set."""
    if not ADMIN_PHONES:
        raise HTTPException(404, 'Not found')
    if not x_admin_phone or normalize_phone(x_admin_phone) not in ADMIN_PHONES:
        raise HTTPException(403, 'Forbidden')

    now = datetime.now(timezone.utc)
    since7 = _iso(now - timedelta(days=7))
    since30 = _iso(now - timedelta(days=30))
    now_iso = _iso(now)

    out = []
    async for b in db.businesses.find({}, {'_id': 0}):
        shop_id = b.get('id')
        bills30 = await db.invoices.count_documents({
            'shop_id': shop_id, 'created_at': {'$gte': since30, '$lte': now_iso},
            'status': {'$ne': 'VOIDED'},
        })
        bills7 = await db.invoices.count_documents({
            'shop_id': shop_id, 'created_at': {'$gte': since7, '$lte': now_iso},
            'status': {'$ne': 'VOIDED'},
        })
        last = await db.invoices.find_one(
            {'shop_id': shop_id, 'status': {'$ne': 'VOIDED'}},
            sort=[('created_at', -1)],
            projection={'created_at': 1, '_id': 0},
        )
        customers = await db.shop_customers.count_documents({'shop_id': shop_id})
        staff = await db.memberships.count_documents({'shop_id': shop_id})
        status = 'active' if bills7 > 0 else ('lapsed' if bills30 > 0 else 'cold')
        owner = b.get('owner_phone') or b.get('phone') or ''
        out.append({
            'shop_id': shop_id,
            'name': b.get('name'),
            'category': b.get('category'),
            'owner_phone_masked': (owner[:3] + 'XXXXXX' + owner[-2:]) if len(owner) >= 5 else None,
            'bills_7d': bills7,
            'bills_30d': bills30,
            'customers': customers,
            'staff': staff,
            'last_bill_at': last.get('created_at') if last else None,
            'status': status,
        })
    out.sort(key=lambda x: x['bills_7d'], reverse=True)
    return {'generated_at': now_iso, 'shops': out}
