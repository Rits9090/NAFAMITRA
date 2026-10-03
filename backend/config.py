"""Centralised application configuration.

Everything that might differ per deployment (brand, support contact, OTP
delivery, feature flags) lives here so that components never hardcode values.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


def _bool(name: str, default: str = 'false') -> bool:
    return os.environ.get(name, default).strip().lower() in ('1', 'true', 'yes', 'on')


BRAND = {
    'name': 'NafaMitra',
    'tagline': 'ग्राहक वाढवा, नफा वाढवा!',
    'tagline_en': 'Grow Customers. Grow Profit.',
    'meaning': 'Nafa = profit, Mitra = trusted business companion',
}

BUSINESS = {
    'timezone': os.environ.get('BUSINESS_TIMEZONE', 'Asia/Kolkata'),
    'currency': 'INR',
    'currency_symbol': '₹',
    'default_language': os.environ.get('DEFAULT_LANGUAGE', 'mr'),
}

SUPPORTED_LANGUAGES = [
    {'code': 'mr', 'label': 'मराठी'},
    {'code': 'en', 'label': 'English'},
    {'code': 'hi', 'label': 'हिंदी'},
]

# ---------------------------------------------------------------------------
# Support contact — never hardcode a fake number in components.
# If the WhatsApp number is not configured the UI hides the action entirely.
# ---------------------------------------------------------------------------
SUPPORT = {
    'whatsapp_number': os.environ.get('SUPPORT_WHATSAPP_NUMBER', '').strip(),
    'email': os.environ.get('SUPPORT_EMAIL', '').strip(),
}
SUPPORT['enabled'] = bool(SUPPORT['whatsapp_number'] or SUPPORT['email'])

# ---------------------------------------------------------------------------
# OTP delivery.
# A real SMS/WhatsApp provider can be plugged in via OTP_PROVIDER.  When no
# provider is configured the code is returned to the client in dev mode so
# the pilot/dev environment can complete the real (hashed, expiring, attempt
# limited) OTP flow.  It is never accepted without checking the stored hash.
# ---------------------------------------------------------------------------
OTP = {
    'length': 5,
    'ttl_seconds': int(os.environ.get('OTP_TTL_SECONDS', '300')),
    'max_attempts': int(os.environ.get('OTP_MAX_ATTEMPTS', '5')),
    'resend_cooldown_seconds': int(os.environ.get('OTP_RESEND_COOLDOWN', '30')),
    'max_sends_per_10min': int(os.environ.get('OTP_MAX_SENDS', '6')),
    'provider': os.environ.get('OTP_PROVIDER', '').strip(),   # '' | 'twilio' | 'whatsapp'
    # When no provider is configured, expose the OTP to the client for dev/pilot.
    'dev_mode': _bool('OTP_DEV_MODE', 'true') and not os.environ.get('OTP_PROVIDER', '').strip(),
}

FEATURES = {
    'voice_assistant': _bool('FEATURE_VOICE_ASSISTANT', 'true'),
    'ai_assistant': _bool('FEATURE_AI_ASSISTANT', 'true'),
    'customer_magic_links': _bool('FEATURE_MAGIC_LINKS', 'true'),
    'qr_scanning': _bool('FEATURE_QR_SCANNING', 'true'),
}

SESSION_TOKEN_DAYS = int(os.environ.get('SESSION_TOKEN_DAYS', '30'))
PORTAL_TOKEN_MINUTES = int(os.environ.get('PORTAL_TOKEN_MINUTES', '30'))

# Never fall back to a weak secret in a real deployment.
JWT_SECRET = os.environ.get('JWT_SECRET', '')
if not JWT_SECRET:
    if _bool('ALLOW_INSECURE_JWT', 'false'):
        JWT_SECRET = 'nafamitra-dev-insecure-secret'
    else:
        # Ephemeral secret: stable for the lifetime of the process only.
        # Sessions do not survive a restart which is the safe default.
        import secrets
        JWT_SECRET = secrets.token_hex(32)


def public_config() -> dict:
    """Safe-to-expose configuration for the frontend."""
    return {
        'brand': BRAND,
        'business': BUSINESS,
        'languages': SUPPORTED_LANGUAGES,
        'support': SUPPORT,
        'otp': {
            'dev_mode': OTP['dev_mode'],
            'length': OTP['length'],
            'ttl_seconds': OTP['ttl_seconds'],
            'resend_cooldown_seconds': OTP['resend_cooldown_seconds'],
        },
        'features': FEATURES,
    }
