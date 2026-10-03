"""Audit trail — every sensitive action is recorded, secrets never are."""
from datetime import datetime, timezone

from database import db

# Explicit allow-list: if it is not here it cannot be logged.
LOGGABLE_FIELDS = {
    'amount_paise', 'points', 'payment_mode', 'role', 'status', 'field',
    'invoice_number', 'customer_id', 'product_id', 'member_phone',
    'old_value', 'new_value', 'reason', 'mode',
}

FORBIDDEN_FIELDS = {
    'otp', 'code', 'password', 'password_hash', 'token', 'secret',
    'authorization', 'api_key', 'qr_token', 'share_token', 'token_hash',
}


def safe_detail(detail: dict | None) -> dict:
    if not detail:
        return {}
    return {k: v for k, v in detail.items()
            if k in LOGGABLE_FIELDS and k not in FORBIDDEN_FIELDS}


async def log_action(shop_id: str | None, actor_id: str | None, action: str,
                     entity_type: str | None = None, entity_id: str | None = None,
                     detail: dict | None = None) -> None:
    try:
        await db.audit_logs.insert_one({
            'id': __import__('uuid').uuid4().hex,
            'shop_id': shop_id,
            'actor_id': actor_id,
            'action': action,
            'entity_type': entity_type,
            'entity_id': entity_id,
            'detail': safe_detail(detail),
            'created_at': datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # audit must never break the business operation
        import logging
        logging.getLogger('nafamitra').exception('audit log failed: %s', action)
