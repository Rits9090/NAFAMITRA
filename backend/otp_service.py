"""Phone OTP service.

The generated code is stored only as a salted hash with an expiry and an
attempt counter.  Codes are never logged.  Delivery is pluggable: with a real
SMS/WhatsApp provider configured, the code is sent out-of-band; in dev mode
the API returns the code to the caller so environments without a provider can
still run the genuine verification flow (nothing is auto-accepted).
"""
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from config import OTP
from database import db
from errors import AppError

logger = logging.getLogger('nafamitra.otp')


def _hash_code(phone: str, code: str) -> str:
    salt = os.environ.get('OTP_HASH_SALT', 'nafamitra-otp')
    return hashlib.sha256(f'{salt}:{phone}:{code}'.encode()).hexdigest()


async def _send_via_provider(phone: str, code: str) -> bool:
    """Pluggable provider hook. Returns True only on confirmed delivery."""
    provider = OTP.get('provider', '')
    if not provider:
        return False
    try:
        if provider == 'twilio':  # pragma: no cover - requires credentials
            from twilio.rest import Client  # type: ignore
            client = Client(os.environ.get('TWILIO_ACCOUNT_SID'),
                            os.environ.get('TWILIO_AUTH_TOKEN'))
            msg = client.messages.create(
                body=f'{code} is your NafaMitra verification code.',
                from_=os.environ.get('TWILIO_FROM_NUMBER'),
                to=f'+91{phone}')
            return msg.sid is not None
    except Exception:
        logger.exception('OTP provider delivery failed')
        return False
    return False


async def request_otp(phone: str) -> dict:
    """Create (and deliver) an OTP for a normalised phone number."""
    now = datetime.now(timezone.utc)

    # resend cooldown
    recent = await db.otp_codes.find_one(
        {'phone_normalized': phone, 'purpose': 'login'},
        sort=[('created_at', -1)])
    if recent:
        created = datetime.fromisoformat(recent['created_at'])
        elapsed = (now - created).total_seconds()
        if elapsed < OTP['resend_cooldown_seconds']:
            raise AppError(
                f'Please wait {int(OTP["resend_cooldown_seconds"] - elapsed) + 1}s before requesting again.',
                429, 'cooldown',
                f'पुन्हा विनंती करण्यापूर्वी {int(OTP["resend_cooldown_seconds"] - elapsed) + 1} सेकंद थांबा.')

    # rate limit per phone (rolling 10 minutes)
    window_start = (now - timedelta(minutes=10)).isoformat()
    sends = await db.otp_codes.count_documents(
        {'phone_normalized': phone, 'created_at': {'$gte': window_start}})
    if sends >= OTP['max_sends_per_10min']:
        raise AppError('Too many attempts. Please try again later.',
                       429, 'rate_limited',
                       'खूप प्रयत्न झाले. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.')

    code = ''.join(secrets.choice('0123456789') for _ in range(OTP['length']))
    doc = {
        'phone_normalized': phone,
        'purpose': 'login',
        'code_hash': _hash_code(phone, code),
        'attempts': 0,
        'consumed': False,
        'created_at': now.isoformat(),
        'expires_at': (now + timedelta(seconds=OTP['ttl_seconds'])).isoformat(),
    }
    await db.otp_codes.insert_one(doc)

    delivered = await _send_via_provider(phone, code)
    result = {
        'ok': True,
        'delivered': delivered,
        'ttl_seconds': OTP['ttl_seconds'],
        'resend_cooldown_seconds': OTP['resend_cooldown_seconds'],
        'dev_mode': OTP['dev_mode'],
    }
    if OTP['dev_mode'] and not delivered:
        # Honest dev-mode: the real code, only because no provider is wired up.
        result['dev_otp'] = code
        logger.info('OTP issued (dev mode) for phone ending %s', phone[-4:])
    return result


async def verify_otp(phone: str, code: str) -> bool:
    """Verify and consume an OTP. Returns True on success."""
    now = datetime.now(timezone.utc)
    doc = await db.otp_codes.find_one(
        {'phone_normalized': phone, 'purpose': 'login', 'consumed': False},
        sort=[('created_at', -1)])
    if not doc:
        raise AppError('No active code for this number. Please request a new one.',
                       400, 'otp_missing',
                       'या नंबरसाठी सक्रिय कोड नाही. नवीन कोड विनंती करा.')

    if datetime.fromisoformat(doc['expires_at']) < now:
        raise AppError('This code has expired. Please request a new one.',
                       400, 'otp_expired',
                       'हा कोड कालबाह्य झाला आहे. कृपया नवीन कोड विनंती करा.')

    if doc['attempts'] >= OTP['max_attempts']:
        raise AppError('Too many incorrect attempts. Please request a new code.',
                       429, 'otp_locked',
                       'खूप चुकीचे प्रयत्न. कृपया नवीन कोड विनंती करा.')

    if not secrets.compare_digest(doc['code_hash'], _hash_code(phone, str(code))):
        await db.otp_codes.update_one(
            {'_id': doc['_id']}, {'$inc': {'attempts': 1}})
        remaining = OTP['max_attempts'] - (doc['attempts'] + 1)
        raise AppError(
            f'Incorrect code. {max(remaining, 0)} attempts remaining.',
            400, 'otp_invalid',
            f'चुकीचा कोड. {max(remaining, 0)} प्रयत्न उरलेले आहेत.')

    await db.otp_codes.update_one({'_id': doc['_id']},
                                  {'$set': {'consumed': True,
                                            'consumed_at': now.isoformat()}})
    # cleanup expired codes opportunistically
    await db.otp_codes.delete_many({'expires_at': {'$lt': (now - timedelta(hours=1)).isoformat()}})
    return True
