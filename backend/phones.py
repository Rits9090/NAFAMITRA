"""Indian phone number handling.

The normalised phone number is the identity/discovery key for customers —
never the database primary key (internal UUIDs are used for that).
"""
import re
import secrets
import uuid

_ALLOWED = re.compile(r'^[6-9]\d{9}$')


def normalize_phone(raw) -> str | None:
    """Normalise an Indian mobile number to its 10-digit form.

    Accepts: '98223 45678', '+919822345678', '00919822345678', '919822345678',
    '09822345678'.  Returns None when the value is not a valid Indian mobile.
    """
    if not raw:
        return None
    digits = re.sub(r'\D', '', str(raw))
    if len(digits) == 12 and digits.startswith('91'):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith('0'):
        digits = digits[1:]
    elif len(digits) == 13 and digits.startswith('091'):
        digits = digits[3:]
    if len(digits) != 10 or not _ALLOWED.match(digits):
        return None
    return digits


def format_phone_display(phone: str | None) -> str:
    """9822345678 → 98223 45678 for readability."""
    p = normalize_phone(phone)
    if not p:
        return phone or ''
    return f'{p[:5]} {p[5:]}'


def is_valid_phone(raw) -> bool:
    return normalize_phone(raw) is not None


def new_id() -> str:
    return str(uuid.uuid4())


def new_token(nbytes: int = 16) -> str:
    """Cryptographically random opaque token (QR / share / magic links)."""
    return secrets.token_hex(nbytes)


def generate_nm_id() -> str:
    """Human friendly customer id, non-sequential: NM-483920."""
    return f'NM-{secrets.randbelow(900000) + 100000}'


def generate_invoice_placeholder() -> str:
    """Not used for final numbering — real numbers come from atomic counters."""
    return f'INV-{secrets.token_hex(4).upper()}'
