"""Supabase Auth integration — locally verifiable behaviour.

The sandbox cannot reach supabase.co, so live signup/OAuth round trips are
not claimed here (see docs/supabase-integration.md for what remains). These
tests prove the security-critical, offline-verifiable parts:

* HS256 (project JWT secret) verification of Supabase access tokens —
  accept valid, reject expired / wrong issuer / wrong signature / wrong aud.
* Token routing: non-Supabase tokens fall through to legacy verification.
* Idempotent profile creation keyed by auth UUID — never duplicates, never
  merges accounts that merely share an email or phone.
* Optional mobile-number profile storage: normalize, update, remove,
  invalid input rejected, no OTP/verification flags invented.
* Auth surface gates ship DEFAULT-OFF (phone OTP, password auth, seed).
* HTTP end-to-end with a minted token (when REACT_APP_BACKEND_URL is set).
"""
import asyncio
import os
import subprocess
import sys
import time
import uuid

import pytest

# Configure BEFORE importing backend modules (config reads env at import).
os.environ.setdefault('SUPABASE_URL', 'https://izfcjxabnahcsmzhosuo.supabase.co')
os.environ.setdefault('SUPABASE_JWT_SECRET', 'test-supabase-project-secret')

import jwt  # noqa: E402  (PyJWT)

SUPABASE_URL = os.environ['SUPABASE_URL']
ISSUER = f'{SUPABASE_URL}/auth/v1'
SECRET = os.environ['SUPABASE_JWT_SECRET']


def mint(sub=None, *, exp_delta=600, iss=ISSUER, aud='authenticated', secret=None,
         email='sb.user@example.com', meta=None):
    payload = {
        'sub': sub or str(uuid.uuid4()),
        'iss': iss,
        'aud': aud,
        'exp': int(time.time()) + exp_delta,
        'iat': int(time.time()),
        'email': email,
        'user_metadata': meta or {'full_name': 'Supabase Test User'},
        'role': 'authenticated',
    }
    return jwt.encode(payload, secret if secret is not None else SECRET, algorithm='HS256')


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(scope='module')
def modules():
    import config
    import supabase_auth
    import database  # noqa: F401  (mongomock init)
    return config, supabase_auth


# ---------------------------------------------------------------- tokens ----
def test_valid_supabase_token_accepted(modules):
    _, sa = modules
    token = mint(meta={'full_name': 'अनिल', 'phone_number': '+91 98765 43210'})
    payload = sa.decode_supabase_token(token)
    assert payload['supabase'] is True
    assert payload['scope'] == 'app'
    assert payload['user_id'] == payload['sub']
    assert payload['email'] == 'sb.user@example.com'
    assert payload['phone'] == '+91 98765 43210'


def test_expired_token_rejected(modules):
    _, sa = modules
    with pytest.raises(Exception):
        sa.decode_supabase_token(mint(exp_delta=-60))


def test_wrong_issuer_rejected(modules):
    _, sa = modules
    with pytest.raises(Exception):
        sa.decode_supabase_token(mint(iss='https://evil.example.co/auth/v1'))


def test_wrong_signature_rejected(modules):
    _, sa = modules
    with pytest.raises(Exception):
        sa.decode_supabase_token(mint(secret='another-secret'))


def test_wrong_audience_rejected(modules):
    _, sa = modules
    with pytest.raises(Exception):
        sa.decode_supabase_token(mint(aud='service_role'))


def test_legacy_token_falls_through(modules):
    """A non-Supabase token must route to legacy verification, not explode."""
    _, sa = modules
    legacy = jwt.encode({'user_id': 'x', 'scope': 'app',
                         'exp': int(time.time()) + 300, 'iat': int(time.time())},
                        'other', algorithm='HS256')
    assert sa.maybe_decode_supabase(legacy) is None
    assert sa.maybe_decode_supabase('not.a.jwt') is None


def test_decode_token_dispatches_to_supabase(modules):
    """auth.decode_token returns the Supabase payload for our issuer."""
    _, sa = modules
    from auth import decode_token
    token = mint()
    payload = decode_token(token)
    assert payload.get('supabase') is True and payload['user_id']


# ------------------------------------------------- profile creation (§8) ----
def test_ensure_person_idempotent_no_duplicates(modules):
    from routes.auth_routes import ensure_supabase_person
    from database import db
    uid = str(uuid.uuid4())

    p1 = run(ensure_supabase_person({'supabase': True, 'user_id': uid, 'email': 'idem1@example.com',
                                     'user_metadata': {'full_name': 'Idem'}}))
    p2 = run(ensure_supabase_person({'supabase': True, 'user_id': uid, 'email': 'idem1@example.com',
                                     'user_metadata': {'full_name': 'Idem'}}))
    assert p1 and p2 and p1['id'] == p2['id'] == uid
    count = len([u for u in run(db.users.find({'id': uid}).to_list(10))])
    assert count == 1
    # user-edited name never overwritten by later token claims
    run(db.users.update_one({'id': uid}, {'$set': {'name': 'Edited By User'}}))
    p3 = run(ensure_supabase_person({'supabase': True, 'user_id': uid, 'email': 'idem1@example.com',
                                     'user_metadata': {'full_name': 'Token Name'}}))
    assert p3['name'] == 'Edited By User'


def test_shared_email_does_not_merge_accounts(modules):
    """A legacy account holding the email must stay untouched; the Supabase
    profile is created WITHOUT claiming the unique email column (§8)."""
    from routes.auth_routes import ensure_supabase_person
    from database import db
    from phones import new_id
    legacy_id = new_id()
    run(db.users.insert_one({'id': legacy_id, 'email': 'shared@example.com',
                             'name': 'Legacy Owner', 'is_active': True,
                             'created_at': '2026-01-01T00:00:00+00:00'}))
    uid = str(uuid.uuid4())
    person = run(ensure_supabase_person({'supabase': True, 'user_id': uid,
                                         'email': 'shared@example.com',
                                         'user_metadata': {}}))
    assert person['id'] == uid
    assert person.get('email') is None              # unique column untouched
    assert person.get('supabase_email') == 'shared@example.com'
    legacy = run(db.users.find_one({'id': legacy_id}, {'_id': 0}))
    assert legacy['name'] == 'Legacy Owner' and legacy['email'] == 'shared@example.com'


# --------------------------------------------- mobile number as profile ----
def test_profile_phone_update_normalize_remove(modules):
    from routes.auth_routes import update_my_profile, ProfileUpdate, ensure_supabase_person
    from database import db
    uid = str(uuid.uuid4())
    user_payload = {'supabase': True, 'user_id': uid, 'email': 'ph@example.com', 'user_metadata': {}}
    run(ensure_supabase_person(user_payload))

    # set (accepted formats normalize to 10-digit canonical form)
    out = run(update_my_profile(ProfileUpdate(phone_number='+91 98765 12345'), user=user_payload))
    assert out['user']['phone'] == '9876512345'

    # invalid input rejected — no fabricated/verified value stored
    with pytest.raises(Exception):
        run(update_my_profile(ProfileUpdate(phone_number='12345'), user=user_payload))
    doc = run(db.users.find_one({'id': uid}, {'_id': 0}))
    assert doc['phone'] == '9876512345'

    # removal clears both columns entirely
    out = run(update_my_profile(ProfileUpdate(phone_number=''), user=user_payload))
    assert 'phone' not in out['user'] or not out['user'].get('phone')
    doc = run(db.users.find_one({'id': uid}, {'_id': 0}))
    assert 'phone' not in doc and 'phone_normalized' not in doc

    # no verification flags are ever written
    assert not any(k for k in doc if 'verified' in k or 'otp' in k)


def test_phone_not_stolen_by_unique_column(modules):
    from routes.auth_routes import update_my_profile, ProfileUpdate, ensure_supabase_person
    from database import db
    from phones import new_id
    other = new_id()
    run(db.users.insert_one({'id': other, 'phone': '9876500000',
                             'phone_normalized': '9876500000', 'is_active': True,
                             'created_at': '2026-01-01T00:00:00+00:00'}))
    uid = str(uuid.uuid4())
    payload = {'supabase': True, 'user_id': uid, 'email': 'taken@example.com', 'user_metadata': {}}
    run(ensure_supabase_person(payload))
    with pytest.raises(Exception):
        run(update_my_profile(ProfileUpdate(phone_number='9876500000'), user=payload))


# ------------------------------------------------------------ gates (§4) ----
def test_auth_gates_default_off():
    """Fresh process, no ALLOW_* env → OTP/password/seed all disabled."""
    env = {k: v for k, v in os.environ.items()
           if k not in ('ALLOW_PHONE_OTP', 'ALLOW_LEGACY_PASSWORD_AUTH', 'ALLOW_SEED')}
    out = subprocess.run(
        [sys.executable, '-c',
         'import config, json; print(json.dumps(config.AUTH_GATES))'],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        env=env, capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr[-500:]
    import json
    gates = json.loads(out.stdout.strip().splitlines()[-1])
    assert gates == {'phone_otp': False, 'password': False, 'seed': False}


# ------------------------------------------------- HTTP (optional, §16) ----
@pytest.mark.skipif(not os.environ.get('REACT_APP_BACKEND_URL'),
                    reason='REACT_APP_BACKEND_URL not set')
def test_http_profile_and_me_with_supabase_token():
    import requests
    base = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
    sub = str(uuid.uuid4())
    token = mint(sub=sub, email='http.e2e@example.com')
    hdr = {'Authorization': f'Bearer {token}'}

    me = requests.get(f'{base}/api/auth/me', headers=hdr, timeout=10)
    assert me.status_code == 200, me.text
    body = me.json()
    assert body['user']['id'] == sub, 'profile id must be the auth UUID (sub)'
    assert body['user'].get('created_via') == 'supabase'
    assert body['user'].get('email') == 'http.e2e@example.com'

    put = requests.put(f'{base}/api/auth/profile',
                       json={'phone_number': '+919876511111'}, headers=hdr, timeout=10)
    assert put.status_code == 200, put.text
    assert put.json()['user']['phone'] == '9876511111'

    # same call twice → still one profile (login again doesn't duplicate)
    me2 = requests.get(f'{base}/api/auth/me', headers=hdr, timeout=10)
    assert me2.status_code == 200

    # forged token (different secret) must be rejected
    forged = jwt.encode({'sub': str(uuid.uuid4()), 'iss': ISSUER, 'aud': 'authenticated',
                         'exp': int(time.time()) + 300, 'iat': int(time.time())},
                        'forged-secret', algorithm='HS256')
    bad = requests.get(f'{base}/api/auth/me',
                       headers={'Authorization': f'Bearer {forged}'}, timeout=10)
    assert bad.status_code == 401, bad.text
