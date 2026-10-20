"""Entitlement / premium grants — the backend is the single source of truth.

Rules live HERE (never in frontend state). Every grant is idempotent via a
unique (customer_id, code) index, so a promotion can never be claimed twice.
An entitlement is a server-recorded feature flag with a start/expiry — no
payment or subscription infrastructure is implied or pretended.
"""
import uuid
from datetime import datetime, timedelta, timezone

from database import db

# Configurable product rules (kept server-side on purpose).
RULES = {
    'stores5_30d_free': {
        'code': 'premium_stores5_30d',
        'feature': 'premium',
        'target': 5,     # qualifying store count
        'days': 30,
    },
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def active_entitlements(customer_id: str) -> list[dict]:
    now = _now().isoformat()
    rows = await db.entitlements.find(
        {'customer_id': customer_id, 'status': 'active', 'expires_at': {'$gt': now}},
        {'_id': 0, 'id': 1, 'code': 1, 'feature': 1, 'source': 1,
         'starts_at': 1, 'expires_at': 1},
    ).to_list(50)
    return rows


async def has_code(customer_id: str, code: str) -> bool:
    return await db.entitlements.find_one(
        {'customer_id': customer_id, 'code': code}, {'_id': 1}) is not None


async def grant(customer_id: str, rule_key: str, reason: str) -> dict:
    """Idempotent grant: returns the existing entitlement if already claimed."""
    rule = RULES[rule_key]
    code = rule['code']
    existing = await db.entitlements.find_one(
        {'customer_id': customer_id, 'code': code}, {'_id': 0})
    if existing:
        return {'entitlement': existing, 'granted': False}
    start = _now()
    doc = {
        'id': str(uuid.uuid4()),
        'customer_id': customer_id,
        'code': code,
        'feature': rule['feature'],
        'source': reason,
        'status': 'active',
        'starts_at': start.isoformat(),
        'expires_at': (start + timedelta(days=rule['days'])).isoformat(),
        'metadata': {'rule': rule_key, 'claimed_at': start.isoformat()},
        'created_at': start.isoformat(),
    }
    try:
        await db.entitlements.insert_one(dict(doc))
    except Exception:
        # race: someone claimed concurrently — return the winner
        winner = await db.entitlements.find_one(
            {'customer_id': customer_id, 'code': code}, {'_id': 0})
        return {'entitlement': winner, 'granted': False}
    doc.pop('_id', None)
    return {'entitlement': doc, 'granted': True}


async def check_store_activation(customer_id: str, store_count: int) -> dict:
    """Rule 'stores5_30d_free': qualify at >= target stores, claim once."""
    rule = RULES['stores5_30d_free']
    qualified = store_count >= rule['target']
    already = await has_code(customer_id, rule['code'])
    granted_now = False
    if qualified and not already:
        res = await grant(customer_id, 'stores5_30d_free', '5_stores_added')
        granted_now = res['granted']
    active = await active_entitlements(customer_id)
    return {
        'count': store_count,
        'target': rule['target'],
        'qualified': qualified,
        'claimed': await has_code(customer_id, rule['code']),
        'granted_now': granted_now,
        'entitlements': active,
    }
