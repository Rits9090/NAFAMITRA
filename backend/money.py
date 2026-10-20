"""Centralised money handling.

All financial arithmetic is performed on integer minor units (paise for INR).
Rupee floats may exist in legacy documents / product catalog fields; they are
converted exactly once through ``to_paise`` and never used for arithmetic.

Rules:
* ``to_paise`` accepts int | float | str and returns an exact int of paise.
* Calculations (add/sub/discount/margin) happen on paise ints only.
* ``fmt`` renders for display — never round twice.
"""
from decimal import Decimal, InvalidOperation, ROUND_DOWN

CURRENCY = 'INR'
SYMBOL = '₹'


def to_paise(value) -> int:
    """Convert rupees (int/float/str/None) to integer paise, exactly."""
    if value is None or value == '':
        return 0
    if isinstance(value, int):
        # API contract: ints passed to to_paise are treated as rupees only when
        # explicitly coming from catalog fields; ledger code passes rupee
        # strings/floats.  To avoid ambiguity we treat plain int as rupees.
        return value * 100
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError(f'Invalid money value: {value!r}')
    return int((d * 100).quantize(Decimal('1'), rounding=ROUND_DOWN))


def to_rupees(paise: int) -> float:
    """Paise → rupees float (display only, never for arithmetic)."""
    return round(int(paise) / 100.0, 2)


def paise_str(paise: int) -> str:
    """Exact decimal string of rupees for a paise amount ('850.00')."""
    p = int(paise)
    sign = '-' if p < 0 else ''
    p = abs(p)
    return f'{sign}{p // 100}.{p % 100:02d}'


def add(*values: int) -> int:
    return sum(int(v) for v in values)


def sub(a: int, b: int) -> int:
    return int(a) - int(b)


def clamp_non_negative(v: int) -> int:
    return v if v > 0 else 0


def percent_of(amount_paise: int, percent) -> int:
    """percentage (e.g. 5 for 5%) of an amount, rounded down."""
    try:
        p = Decimal(str(percent))
    except (InvalidOperation, ValueError):
        return 0
    return int((Decimal(amount_paise) * p / Decimal(100)).quantize(Decimal('1'), rounding=ROUND_DOWN))


def apply_discount(amount_paise: int, discount_paise: int) -> int:
    return max(0, int(amount_paise) - int(discount_paise))


def margin(sell_paise: int, cost_paise: int) -> int:
    """Estimated gross margin (sell - cost). Not 'net profit'."""
    return int(sell_paise) - int(cost_paise)


def split_payment(total_paise: int, paid_paise: int) -> dict:
    """Split a bill total into paid + credit portions (never negative)."""
    total = max(0, int(total_paise))
    paid = min(max(0, int(paid_paise)), total)
    return {'paid_paise': paid, 'credit_paise': total - paid}


def fmt(paise: int, with_symbol: bool = True) -> str:
    """Format paise as Indian-grouped rupees: 12345678 → ₹1,23,456.78"""
    p = int(paise)
    sign = '-' if p < 0 else ''
    p = abs(p)
    rupees = p // 100
    cents = p % 100
    s = str(rupees)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ','.join(parts) + ',' + tail
    return f'{sign}{SYMBOL if with_symbol else ""}{s}.{cents:02d}'


def parse_money_input(text) -> int:
    """Parse user money input ('1,200.50', '₹850') to paise. Raises ValueError."""
    if text is None:
        raise ValueError('empty')
    cleaned = str(text).replace(SYMBOL, '').replace(',', '').strip()
    if cleaned == '':
        raise ValueError('empty')
    try:
        d = Decimal(cleaned)
    except InvalidOperation:
        raise ValueError('invalid money')
    if d < 0:
        raise ValueError('negative')
    return int((d * 100).quantize(Decimal('1'), rounding=ROUND_DOWN))
