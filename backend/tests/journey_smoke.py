"""Full user-journey smoke test through the dev-server proxy (port 3000).

Simulates the exact request sequence + payloads the React app makes, so both
the UI contract and the proxy path are exercised end-to-end.
"""
import sys
import time
import uuid

import requests

BASE = 'http://localhost:3000/api'
PASS = []
FAIL = []


def check(name, cond, extra=''):
    if cond:
        PASS.append(name)
        print(f'  ✓ {name}')
    else:
        FAIL.append((name, str(extra)[:300]))
        print(f'  ✗ {name} — {str(extra)[:300]}')


class Session:
    def __init__(self):
        self.s = requests.Session()
        self.token = None
        self.shop_id = None

    def req(self, method, path, **kw):
        headers = kw.pop('headers', {})
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        if self.shop_id:
            headers['X-Shop-Id'] = self.shop_id
        return self.s.request(method, BASE + path, headers=headers, timeout=15, **kw)


def main():
    print('== 1. Config (login screen) ==')
    r = requests.get(BASE + '/config', timeout=10)
    cfg = r.json() if r.ok else {}
    check('config 200', r.status_code == 200, r.text)
    check('brand NafaMitra', cfg.get('brand', {}).get('name') == 'NafaMitra', cfg)
    check('no fake support number', cfg.get('support', {}).get('enabled') in (False, None) or cfg['support'].get('whatsapp_number'),
          cfg.get('support'))

    m = Session()
    print('== 2. Phone → OTP login ==')
    phone = '9' + str(int(time.time() * 10) % 1000000000).zfill(9)
    r = m.req('POST', '/auth/request-otp', json={'phone': phone})
    check('request-otp', r.status_code == 200, r.text)
    otp = r.json().get('dev_otp')
    check('dev otp present', bool(otp), r.text)
    r = m.req('POST', '/auth/verify-otp', json={'phone': phone, 'code': otp})
    check('verify-otp', r.status_code == 200, r.text)
    if r.status_code == 200:
        m.token = r.json()['token']
    r = m.req('GET', '/auth/me')
    check('me before shop', r.status_code == 200 and r.json()['identities']['kind'] in ('new', 'customer'), r.text)

    print('== 3. Merchant onboarding ==')
    r = m.req('POST', '/auth/onboard/shop', json={
        'owner_name': 'Sunita Devi', 'shop_name': 'Journey Test Kirana',
        'category': 'kirana', 'location': 'Pune'})
    check('onboard shop', r.status_code == 200, r.text)
    if r.status_code == 200:
        m.shop_id = r.json()['shop']['id']
    # dual identity: same login also becomes a customer (switcher, no logout)
    r = m.req('POST', '/auth/onboard/customer', json={'name': 'Sunita Devi'})
    check('onboard customer (dual identity)', r.status_code == 200, r.text)
    r = m.req('GET', '/auth/me')
    ident = r.json().get('identities', {})
    shops = ident.get('shops', [])
    check('me has shop', len(shops) >= 1, r.text)
    check("kind == 'both'", ident.get('kind') == 'both', ident.get('kind'))
    check('customer profile present', bool(ident.get('customer_profiles')), ident)
    st = shops[0].get('settings') if shops else None
    check('shop settings exposed', st is not None and 'loyalty_points_per_100' in st and 'prevent_below_min' in st, st)

    print('== 4. Dashboard (UI calls) ==')
    r = m.req('GET', '/dashboard/stats')
    ok = r.status_code == 200 and 'today' in r.json() and 'outstanding_paise' in r.json()
    check('dashboard/stats shape', ok, r.text)
    r = m.req('GET', '/dashboard/recent-bills')
    jb = r.json() if r.ok else None
    check('recent-bills (list)', isinstance(jb, list), r.text)
    r = m.req('GET', '/dashboard/recent-customers')
    ja = r.json() if r.ok else None
    check('recent-customers (list)', isinstance(ja, list), r.text)

    print('== 5. Activation analytics ==')
    r = m.req('POST', '/analytics/events', json={'event': 'onboarding_shop_created', 'props': {'category': 'kirana'}})
    check('analytics event', r.status_code == 200 and r.json().get('ok'), r.text)
    r = m.req('GET', '/analytics/events')
    check('owner can list events', r.status_code == 200 and any(e['event'] == 'onboarding_shop_created' for e in r.json().get('events', [])), r.text)

    print('== 6. Customers ==')
    r = m.req('GET', '/customers', params={'segment': 'all', 'limit': 50})
    check('customers list', r.status_code == 200 and 'customers' in r.json(), r.text)
    r = m.req('POST', '/customers', json={'name': 'Ganesh Patil', 'phone': '9123456780', 'notes': 'regular'})
    check('create customer', r.status_code == 200 and r.json().get('nm_id', '').startswith('NM-'), r.text)
    cust = r.json()
    cid = cust.get('id')
    r = m.req('GET', '/customers/search', params={'q': 'Ganesh'})
    check('search customers', r.status_code == 200 and isinstance(r.json(), list), r.text)
    r = m.req('GET', f'/customers/{cid}')
    check('customer detail', r.status_code == 200 and 'customer' in r.json(), r.text)

    print('== 7. Products (itemized bill input) ==')
    r = m.req('POST', '/products', json={
        'name': 'Toor Dal 1kg', 'category': 'grocery', 'selling_price': 160.0,
        'purchase_price': 140.0, 'min_selling_price': 150.0, 'stock_quantity': 50})
    check('create product', r.status_code == 200, r.text)
    prod = r.json()
    pid = prod.get('id')
    r = m.req('GET', '/products', params={'limit': 100})
    check('products list', r.status_code == 200 and isinstance(r.json().get('products', r.json() if isinstance(r.json(), list) else []), list), r.text)

    print('== 8. Quick bill + idempotency ==')
    key = uuid.uuid4().hex
    payload = {'mode': 'quick', 'amount': '85.00', 'payment_mode': 'cash', 'idempotency_key': key}
    r1 = m.req('POST', '/sales', json=payload)
    check('quick bill', r1.status_code == 200 and r1.json().get('total_paise') == 8500, r1.text)
    r2 = m.req('POST', '/sales', json=payload)  # double tap
    inv1 = r1.json().get('invoice_number')
    inv2 = r2.json().get('invoice_number')
    check('double-tap = 1 bill', r1.status_code == 200 and r2.status_code == 200 and inv1 == inv2, f'{inv1} vs {inv2}')
    bill_id = r1.json().get('id')

    print('== 9. Itemized bill + profit protection ==')
    r = m.req('POST', '/sales', json={
        'mode': 'items',
        'items': [{'product_id': pid, 'quantity': 2, 'unit_price': '160.00'}],
        'payment_mode': 'upi', 'customer_id': cid, 'discount': '10.00',
        'idempotency_key': uuid.uuid4().hex})
    check('itemized bill', r.status_code == 200 and r.json().get('total_paise') == 31000, r.text)
    earned = r.json().get('loyalty_earned_points', 0)
    check('loyalty earned on bill', earned >= 1, r.text)

    # profit protection: enable → blocked; disable → allowed (real toggle)
    r = m.req('PUT', '/auth/shop/settings', json={'prevent_below_min': True})
    check('enable profit protection', r.status_code == 200 and r.json()['settings'].get('prevent_below_min') is True, r.text)
    r = m.req('POST', '/sales', json={
        'mode': 'items',
        'items': [{'product_id': pid, 'quantity': 1, 'unit_price': '145.00'}],
        'payment_mode': 'cash', 'idempotency_key': uuid.uuid4().hex})
    check('below safe price BLOCKED', r.status_code == 400 and r.json()['error']['code'] == 'below_min_price', r.text)
    r = m.req('PUT', '/auth/shop/settings', json={'prevent_below_min': False})
    check('disable profit protection', r.status_code == 200 and r.json()['settings'].get('prevent_below_min') is False, r.text)
    r = m.req('POST', '/sales', json={
        'mode': 'items',
        'items': [{'product_id': pid, 'quantity': 1, 'unit_price': '145.00'}],
        'payment_mode': 'cash', 'idempotency_key': uuid.uuid4().hex})
    check('below price allowed when off', r.status_code == 200, r.text)

    print('== 10. Bills list / detail / void ==')
    r = m.req('GET', '/sales', params={'page': 1, 'limit': 20})
    body = r.json()
    check('bills list shape', r.status_code == 200 and isinstance(body.get('bills'), list) and 'pages' in body, r.text)
    r = m.req('GET', '/sales', params={'page': 1, 'limit': 20, 'status': 'ACTIVE'})
    check('bills status filter', r.status_code == 200, r.text)
    r = m.req('GET', f'/sales/{bill_id}')
    check('bill detail', r.status_code == 200 and r.json().get('invoice_number') == inv1, r.text)
    share_token = r.json().get('share_token')
    r = m.req('POST', f'/sales/{bill_id}/void', json={'reason': 'journey test'})
    check('void bill', r.status_code == 200 and r.json().get('status') == 'VOIDED', r.text)

    print('== 11. Credit (udhaar) ==')
    r = m.req('GET', '/udhaar')
    check('udhaar shape', r.status_code == 200 and 'total_outstanding_paise' in r.json() and 'accounts' in r.json(), r.text)
    r = m.req('POST', '/udhaar', json={'customer_id': cid, 'amount': 500.0, 'description': 'journey credit'})
    check('give credit', r.status_code == 200, r.text)
    r = m.req('GET', '/udhaar')
    accounts = r.json().get('accounts', [])
    check('outstanding now', any(a['outstanding_paise'] == 50000 for a in accounts), accounts)
    r = m.req('POST', f'/udhaar/{cid}/payment', json={
        'amount': 200.0, 'payment_mode': 'cash', 'notes': 'part pay',
        'idempotency_key': uuid.uuid4().hex})
    check('record payment', r.status_code == 200, r.text)

    print('== 12. Loyalty ==')
    r = m.req('GET', '/loyalty/rules')
    check('loyalty rules', r.status_code == 200 and 'points_per_100' in r.json(), r.text)
    r = m.req('PUT', '/loyalty/rules', json={'points_per_100': 2, 'redemption_value': 0.1})
    check('update rules', r.status_code == 200, r.text)
    r = m.req('GET', '/loyalty/leaderboard')
    check('leaderboard array', r.status_code == 200 and isinstance(r.json(), list), r.text)
    r = m.req('GET', '/loyalty/transactions')
    check('ledger', r.status_code == 200 and isinstance(r.json(), list), r.text)

    print('== 13. Staff ==')
    r = m.req('GET', '/auth/staff')
    check('staff list', r.status_code == 200 and 'staff' in r.json(), r.text)
    r = m.req('POST', '/auth/staff', json={'phone': '9988776655', 'role': 'cashier'})
    check('invite staff', r.status_code in (200, 201), r.text)
    staff = [x for x in m.req('GET', '/auth/staff').json().get('staff', []) if x.get('role') == 'cashier']
    if staff:
        r = m.req('DELETE', f"/auth/staff/{staff[0]['membership_id']}")
        check('remove staff', r.status_code == 200, r.text)

    print('== 14. Reports (UI tabs) ==')
    for path in ('/reports/sales?period=month', '/reports/products?period=month',
                 '/reports/customers', '/reports/outstanding', '/reports/inventory'):
        r = m.req('GET', path)
        check(f'reports {path.split("?")[0].split("/")[-1]}', r.status_code == 200, r.text)

    print('== 15. Settings save ==')
    r = m.req('PUT', '/auth/business', json={
        'name': 'Journey Test Kirana', 'category': 'kirana',
        'address': '12 MG Road, Pune', 'phone': '9876543210'})
    check('save shop profile', r.status_code == 200, r.text)

    print('== 16. Customer portal (same session) ==')
    for path in ('/customer/me', '/customer/overview', '/customer/bills',
                 '/customer/loyalty', '/customer/credit', '/customer/qr'):
        r = m.req('GET', path)
        check(f'portal {path.split("/")[-1]}', r.status_code == 200, r.text)
    r = m.req('GET', '/customer/overview')
    if r.status_code == 200:
        ov = r.json()
        check('overview shops isolated per shop', all('shop_id' in s for s in ov.get('shops', [])) or not ov.get('shops'), ov)
    r = m.req('POST', '/customer/magic-link', json={'ttl_minutes': 30})
    check('magic link', r.status_code == 200 and 'url' in r.json(), r.text)
    magic_url = r.json().get('url', '')
    token_qs = magic_url.split('token=')[-1] if 'token=' in magic_url else ''

    print('== 17. Public receipt + magic exchange (no session) ==')
    r = requests.get(f'{BASE}/sales/public/receipt/{share_token}', timeout=10)
    check('public receipt', r.status_code == 200 and r.json().get('invoice_number'), r.text)
    r = requests.get(f'{BASE}/sales/public/receipt/bad-token', timeout=10)
    check('bad token 404', r.status_code == 404, r.status_code)
    if token_qs:
        r = requests.post(f'{BASE}/customer/exchange', json={'token': token_qs}, timeout=10)
        check('magic exchange', r.status_code == 200 and 'token' in r.json(), r.text)
        r2 = requests.post(f'{BASE}/customer/exchange', json={'token': token_qs}, timeout=10)
        check('exchange one-time', r2.status_code == 400, r2.status_code)

    print('== 18. Admin disabled by default ==')
    r = requests.get('http://localhost:3000/api/admin/shop-health', timeout=10)
    check('admin 404 when unconfigured', r.status_code == 404, r.status_code)

    print(f'\n{"=" * 50}\nPASSED: {len(PASS)}   FAILED: {len(FAIL)}')
    for name, extra in FAIL:
        print(f'  FAIL {name}: {extra}')
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
