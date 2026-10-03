"""Authentication & authorization.

Design:
* A *person* is identified by a normalised phone number (users collection).
* One person may simultaneously be a shop member (owner/manager/cashier)
  and/or a customer across many shops.  There is no single `role` column on
  the user — roles live on ``memberships``.
* JWTs only carry the user id (+ scope).  Shop context is resolved from the
  database on every request: the client may send ``X-Shop-Id`` but the server
  verifies membership before trusting it (never trust browser-supplied ids).
* Password/email auth is retained for backwards compatibility with existing
  deployments, but phone OTP is the primary entry.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import JWT_SECRET, SESSION_TOKEN_DAYS
from errors import Forbidden, Unauthorized

ALGORITHM = 'HS256'
security = HTTPBearer(auto_error=False)

ROLE_RANK = {'cashier': 1, 'manager': 2, 'owner': 3}
DEFAULT_ROLE = 'cashier'


# ---------------------------------------------------------------------------
# passwords (legacy compatibility)
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    try:
        import bcrypt
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# tokens
# ---------------------------------------------------------------------------
def create_access_token(user_id: str, email: str = '', business_id: Optional[str] = None,
                        role: str = 'owner', days: int = SESSION_TOKEN_DAYS,
                        scope: str = 'app', customer_id: Optional[str] = None) -> str:
    payload = {
        'user_id': user_id,
        'scope': scope,
        'exp': datetime.now(timezone.utc) + timedelta(days=days if scope == 'app'
                                                      else 0),
        'iat': datetime.now(timezone.utc),
    }
    if scope == 'portal':
        # short-lived customer portal session (minutes, not days)
        payload['exp'] = datetime.now(timezone.utc) + timedelta(minutes=30)
        payload['customer_id'] = customer_id
    else:
        if business_id:
            payload['business_id'] = business_id
        if email:
            payload['email'] = email
        if role:
            payload['role'] = role
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise Unauthorized('Your session has expired. Please sign in again.',
                           'तुमचा सत्र कालबाह्य झाला आहे. कृपया पुन्हा साइन इन करा.')
    except jwt.InvalidTokenError:
        raise Unauthorized('Invalid session. Please sign in again.',
                           'अवैध सत्र. कृपया पुन्हा साइन इन करा.')


def _extract_token(request: Optional[Request],
                    credentials: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    """Token from any transport channel.

    The preview edge proxy in front of this app does not reliably forward the
    Authorization header, so the client also sends X-Auth-Token and a cookie;
    all three channels are accepted here.  Whichever arrives first wins.
    """
    if credentials is not None and credentials.credentials:
        return credentials.credentials
    if request is not None:
        auth = request.headers.get('authorization', '')
        if auth.lower().startswith('bearer ') and auth[7:].strip():
            return auth[7:].strip()
        alt = (request.headers.get('x-auth-token') or '').strip()
        if alt:
            return alt
        cookie = (request.cookies.get('nafamitra_token') or '').strip()
        if cookie:
            return cookie
    return None


async def get_current_user(request: Request,
                           credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Resolve the authenticated session payload."""
    token = _extract_token(request, credentials)
    if not token:
        raise Unauthorized()
    return decode_token(token)


def _bearer(request: Request, credentials) -> dict:
    token = _extract_token(request, credentials)
    if not token:
        raise Unauthorized()
    return decode_token(token)


# ---------------------------------------------------------------------------
# roles & membership (the RLS-equivalent layer for MongoDB)
# ---------------------------------------------------------------------------
def role_at_least(role: str | None, minimum: str) -> bool:
    return ROLE_RANK.get(role or '', 0) >= ROLE_RANK.get(minimum, 99)


async def get_membership(user_id: str, shop_id: str) -> Optional[dict]:
    """Server-side membership check — the single source of truth for access."""
    if not user_id or not shop_id:
        return None
    membership = await __import__('database').db.memberships.find_one(
        {'shop_id': shop_id, 'user_id': user_id}, {'_id': 0})
    if membership and membership.get('status', 'active') == 'active':
        return membership
    return None


async def list_memberships(user_id: str) -> list[dict]:
    return await __import__('database').db.memberships.find(
        {'user_id': user_id, 'status': 'active'}, {'_id': 0}).to_list(50)


async def resolve_shop_id(payload: dict, header_shop_id: Optional[str]) -> tuple[Optional[str], Optional[dict]]:
    """Determine which shop the request is for and validate authorization."""
    from database import db
    user_id = payload.get('user_id')
    if not user_id:
        return None, None
    wanted = header_shop_id
    if not wanted:
        # fall back to first (only) membership — keeps single-shop UX simple
        first = await db.memberships.find_one({'user_id': user_id, 'status': 'active'}, {'_id': 0})
        if first:
            return first['shop_id'], first
        user = await db.users.find_one({'id': user_id}, {'_id': 0, 'business_id': 1})
        if user and user.get('business_id'):
            wanted = user['business_id']
        else:
            return None, None
    membership = await get_membership(user_id, wanted)
    return wanted, membership


async def require_business(request: Request,
                           credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Authorised shop context for merchant routes.

    Returns a dict: {user_id, business_id, role, scope}.  Raises unless the
    authenticated person holds an active membership in the requested shop.
    """
    payload = _bearer(request, credentials)
    if payload.get('scope') == 'portal':
        raise Forbidden('This session can only view customer data.',
                        'हे सत्र फक्त ग्राहक माहिती पाहू शकते.')
    header_shop = request.headers.get('x-shop-id')
    shop_id, membership = await resolve_shop_id(payload, header_shop)
    if not shop_id:
        raise Forbidden('No shop linked to this account yet.',
                        'या खात्याला अद्याप दुकान जोडलेले नाही.')
    if not membership:
        # header shop id manipulated or removed from staff → deny
        raise Forbidden('You do not have access to this shop.',
                        'तुम्हाला या दुकानात प्रवेश नाही.')
    return {
        'user_id': payload['user_id'],
        'business_id': shop_id,
        'shop_id': shop_id,
        'role': membership.get('role', DEFAULT_ROLE),
        'scope': 'app',
        'token': payload,
    }


def require_role(minimum: str):
    """Dependency factory: enforce a minimum staff role inside require_business."""
    async def _dep(user: dict = Depends(require_business)) -> dict:
        if not role_at_least(user.get('role'), minimum):
            raise Forbidden(
                f'This action requires {minimum} permission.',
                f'या कृतीसाठी {minimum} परवानगी आवश्यक आहे.')
        return user
    return _dep


async def require_portal(request: Request,
                         credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Customer-facing session.

    Accepts both a normal OTP login (scope=app — one entry point for the whole
    product) and a magic-link exchange (scope=portal).  Profiles are resolved
    from the session, never from client-supplied ids.
    """
    payload = _bearer(request, credentials)
    if payload.get('scope') not in ('portal', 'app'):
        raise Forbidden('Customer session required.')
    return payload
