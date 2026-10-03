"""Database access.

Uses MongoDB via motor when MONGO_URL is configured (production / local mongo).
When no MONGO_URL is available (sandbox/dev without a mongo daemon) it falls
back to an in-memory Mongo-compatible store (mongomock_motor) so the full
application — including index enforcement and aggregation pipelines — can run
and be tested.  The application code only ever sees the motor API.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ.get('MONGO_URL', '').strip()
DB_NAME = os.environ.get('DB_NAME', 'nafamitra')

_using_memory = False

if MONGO_URL:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(MONGO_URL, uuidRepresentation='standard')
    db = client[DB_NAME]
else:
    try:
        from mongomock_motor import AsyncMongoMockClient
        client = AsyncMongoMockClient()
        db = client[DB_NAME]
        _using_memory = True
    except ImportError:  # pragma: no cover
        raise RuntimeError(
            'MONGO_URL is not set and mongomock_motor is not installed. '
            'Set MONGO_URL to a MongoDB instance.'
        )


def using_memory_db() -> bool:
    return _using_memory


async def ensure_indexes() -> None:
    """Idempotent index creation for every collection we rely on.

    These indexes back both performance (tenant-scoped list queries) and
    integrity (unique phone / idempotency keys / invoice numbers).
    """
    # --- identities -------------------------------------------------------
    await db.users.create_index('id', unique=True)
    await db.users.create_index('phone_normalized', unique=True, sparse=True)
    await db.users.create_index('email', unique=True, sparse=True)

    await db.memberships.create_index([('shop_id', 1), ('user_id', 1)], unique=True)
    await db.memberships.create_index('user_id')

    await db.businesses.create_index('id', unique=True)

    # --- customers --------------------------------------------------------
    await db.customers.create_index('id', unique=True)
    await db.customers.create_index('nm_id', unique=True, sparse=True)
    await db.customers.create_index('phone_normalized', sparse=True)
    await db.customers.create_index('qr_token', unique=True, sparse=True)
    await db.customers.create_index('user_id', sparse=True)

    await db.shop_customers.create_index([('shop_id', 1), ('customer_id', 1)], unique=True)
    await db.shop_customers.create_index('shop_id')
    await db.shop_customers.create_index('customer_id')
    await db.shop_customers.create_index([('shop_id', 1), ('normalized_phone', 1)], sparse=True)

    # --- billing ----------------------------------------------------------
    await db.invoices.create_index('id', unique=True)
    await db.invoices.create_index([('shop_id', 1), ('created_at', -1)])
    await db.invoices.create_index([('shop_id', 1), ('invoice_number', 1)], unique=True)
    await db.invoices.create_index('share_token', sparse=True)
    await db.invoices.create_index([('shop_id', 1), ('customer_id', 1)])
    await db.idempotency_keys.create_index([('shop_id', 1), ('key', 1)], unique=True)

    # --- ledgers ----------------------------------------------------------
    await db.credit_accounts.create_index([('shop_id', 1), ('customer_id', 1)], unique=True)
    await db.credit_accounts.create_index('shop_id')
    await db.credit_transactions.create_index([('shop_id', 1), ('created_at', -1)])
    await db.credit_transactions.create_index([('shop_id', 1), ('customer_id', 1)])

    await db.loyalty_accounts.create_index([('shop_id', 1), ('customer_id', 1)], unique=True)
    await db.loyalty_accounts.create_index('shop_id')
    await db.loyalty_transactions.create_index([('shop_id', 1), ('created_at', -1)])
    await db.loyalty_transactions.create_index([('shop_id', 1), ('customer_id', 1)])

    # --- auth / otp / audit ------------------------------------------------
    await db.otp_codes.create_index('phone_normalized')
    await db.otp_codes.create_index('expires_at')  # cleaned manually (TTL ignored by mock)
    await db.audit_logs.create_index([('shop_id', 1), ('created_at', -1)])
    await db.magic_links.create_index('token_hash', unique=True)
    await db.magic_links.create_index('expires_at')

    # --- requirements / notifications / favorites --------------------------
    await db.requirements.create_index([('customer_id', 1), ('created_at', -1)])
    await db.requirements.create_index([('shop_id', 1), ('status', 1)])
    await db.customer_notifications.create_index([('customer_id', 1), ('created_at', -1)])
    await db.customer_notifications.create_index([('customer_id', 1), ('read_at', 1)])
    await db.notification_prefs.create_index('customer_id', unique=True)
    await db.favorites.create_index([('customer_id', 1), ('shop_id', 1)], unique=True)

    # --- legacy collections ------------------------------------------------
    await db.sales.create_index([('business_id', 1), ('created_at', -1)])
    await db.products.create_index([('business_id', 1), ('name', 1)])
    await db.suppliers.create_index('business_id')
    await db.counters.create_index('_id')
