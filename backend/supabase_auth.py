"""Supabase Auth token verification for API requests.

Access tokens issued by Supabase GoTrue are accepted by the FastAPI layer so
the SPA keeps ONE session (Supabase) while all business data stays behind the
existing authorized API (memberships, shop scoping, portal scope).

Two verification modes, both standard for Supabase projects:

* HS256 with the project JWT secret (``SUPABASE_JWT_SECRET``) — fast, works
  offline; the secret stays server-side only.
* RS256 via the project JWKS (``{SUPABASE_URL}/auth/v1/.well-known/jwks.json``)
  — no shared secret; requires outbound network to the Supabase project.

Tokens are routed by their unverified ``iss`` claim; a token that CLAIMS to be
issued by this Supabase project but fails verification is rejected outright
(it never falls through to the legacy HS256 path).
"""
import json
import threading
import time
import urllib.error
import urllib.request

import jwt

from config import SUPABASE
from errors import Unauthorized

_JWKS_TTL_SECONDS = 3600
_jwks_cache = {'keys': None, 'fetched_at': 0.0, 'url': None}
_jwks_lock = threading.Lock()


def _issuer_values() -> list[str]:
    base = SUPABASE['url']
    if not base:
        return []
    return [f'{base}/auth/v1', f'{base}/auth/v1/']


def _unverified_claims(token: str) -> dict | None:
    """Read claims WITHOUT trusting them — used only to route the token."""
    try:
        return jwt.decode(
            token,
            options={'verify_signature': False, 'verify_exp': False, 'verify_aud': False},
            algorithms=['HS256', 'RS256'],
        )
    except Exception:
        return None


def claims_look_like_supabase(claims: dict | None) -> bool:
    if not claims or not SUPABASE['url']:
        return False
    iss = str(claims.get('iss') or '')
    return any(iss == v for v in _issuer_values())


def _fetch_jwks() -> dict:
    url = f"{SUPABASE['url']}/auth/v1/.well-known/jwks.json"
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _get_jwk(kid: str) -> dict | None:
    now = time.time()
    with _jwks_lock:
        fresh = (_jwks_cache['keys'] is not None
                 and now - _jwks_cache['fetched_at'] < _JWKS_TTL_SECONDS
                 and _jwks_cache['url'] == SUPABASE['url'])
        keys = _jwks_cache['keys'] or {}
        for k in keys.get('keys', []):
            if k.get('kid') == kid:
                return k
        if fresh:
            return None
        # (re)fetch on first use or unknown kid past the TTL
        try:
            data = _fetch_jwks()
        except (urllib.error.URLError, OSError, ValueError):
            # Network blocked or bad payload: keep stale keys if we have them.
            if _jwks_cache['keys'] is None:
                raise
            _jwks_cache['fetched_at'] = now
            keys = _jwks_cache['keys']
            for k in keys.get('keys', []):
                if k.get('kid') == kid:
                    return k
            return None
        _jwks_cache['keys'] = data
        _jwks_cache['fetched_at'] = now
        _jwks_cache['url'] = SUPABASE['url']
        for k in data.get('keys', []):
            if k.get('kid') == kid:
                return k
    return None


def decode_supabase_token(token: str) -> dict:
    """Verify a Supabase-issued access token → request payload.

    Raises Unauthorized when the token is expired, forged, misconfigured, or
    cannot be verified (verification failure never falls back to legacy auth).
    """
    claims = _unverified_claims(token)
    header = {}
    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        raise Unauthorized('Invalid session. Please sign in again.',
                           'अवैध सत्र. कृपया पुन्हा साइन इन करा.')

    common = {'audience': 'authenticated', 'issuer': _issuer_values(),
              'options': {'require': ['exp', 'sub']}}
    try:
        if SUPABASE['jwt_secret']:
            verified = jwt.decode(token, SUPABASE['jwt_secret'],
                                  algorithms=['HS256'], **common)
        else:
            jwk = _get_jwk(header.get('kid') or '')
            if jwk is None:
                raise Unauthorized(
                    'Could not verify the session with Supabase. Please sign in again.',
                    'सत्र पडताळता आले नाही. कृपया पुन्हा साइन इन करा.')
            key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
            verified = jwt.decode(token, key, algorithms=['RS256'], **common)
    except Unauthorized:
        raise
    except jwt.ExpiredSignatureError:
        raise Unauthorized('Your session has expired. Please sign in again.',
                           'तुमचा सत्र कालबाह्य झाला आहे. कृपया पुन्हा साइन इन करा.')
    except jwt.InvalidTokenError:
        raise Unauthorized('Invalid session. Please sign in again.',
                           'अवैध सत्र. कृपया पुन्हा साइन इन करा.')

    sub = verified.get('sub')
    if not sub or not isinstance(sub, str):
        raise Unauthorized('Invalid session. Please sign in again.',
                           'अवैध सत्र. कृपया पुन्हा साइन इन करा.')
    meta = verified.get('user_metadata') or {}
    return {
        'user_id': sub,
        'sub': sub,
        'scope': 'app',
        'supabase': True,
        'email': verified.get('email') or None,
        'user_metadata': meta,
        'phone': meta.get('phone_number') if isinstance(meta, dict) else None,
        'exp': verified.get('exp'),
    }


def maybe_decode_supabase(token: str) -> dict | None:
    """Return a verified payload for Supabase-issued tokens, else None.

    None ⇒ token is not for us (legacy path). Raises Unauthorized when the
    token claims this project's issuer but verification fails.
    """
    if not SUPABASE['enabled']:
        return None
    claims = _unverified_claims(token)
    if not claims_look_like_supabase(claims):
        return None
    return decode_supabase_token(token)
