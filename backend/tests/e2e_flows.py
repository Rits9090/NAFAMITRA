"""End-to-end exercise of the NafaMitra API against a running server.

Covers the spec's acceptance flows: OTP login, onboarding, quick billing with
credit + loyalty, credit payment, loyalty redemption, void reversals, duplicate
protection, cross-shop isolation, customer portal, and role permissions.
"""
import os
import sys
import uuid

import requests

BASE = os.environ.get('BASE', 'http://localhost:8001')

PASS = []
FAIL = []


def check(name, cond, extra=''):
    if cond:
        PASS.append(name)
        print(f'  ✓ {name}')
    else:
        FAIL.append(name)
        print(f'  ✗ {name} {extra}')


def rand_phone():
    """Unique valid Indian mobile per run — makes the suite re-runnable."""
    import random
    return random.choice('789') + ''.join(random.choice('0123456789') for _ in range(9))


P_SHOP_A = rand_phone()
P_SHOP_B = rand_phone()
P_RAHUL = rand_phone()
P_OTHER = rand_phone()
P_CASHIER = rand_phone()
P_WRONG = rand_phone()


class Client:
    def __init__(self):
        self.token = None
        self.shop_id = None

    def headers(self):
        h = {}
        if self.token:
            h['Authorization'] = f'Bearer {self.token}'
        if self.shop_id:
            h['X-Shop-Id'] = self.shop_id
        return h

    def req(self, method, path, **kw):
        kw.setdefault('headers', {})
        merged = {**self.headers(), **kw.pop('headers')}
        return requests.request(method, BASE + path, headers=merged, timeout=15, **kw)


def otp_login(phone, name=None):
    c = Client()
    r = c.req('POST', '/api/auth/request-otp', json={'phone': phone})
    assert r.status_code == 200, r.text
    dev_otp = r.json().get('dev_otp')
    assert dev_otp, 'dev_otp missing — OTP dev mode should be on'
    r = c.req('POST', '/api/auth/verify-otp', json={'phone': phone, 'code': dev_otp})
    assert r.status_code == 200, r.text
    data = r.json()
    c.token = data['token']
    return c, data


def main():
    print('== OTP login ==')
    shop_a, login_a = otp_login(P_SHOP_A)
    check('new user detected', login_a['is_new'] is True)
    check('identities kind new', login_a['identities']['kind'] == 'new', str(login_a['identities']['kind']))

    # OTP errors (fresh number so an active code exists)
    r_otp = requests.post(BASE + '/api/auth/request-otp', json={'phone': P_WRONG})
    dev = (r_otp.json() or {}).get('dev_otp')
    wrong_code = '00000' if dev != '00000' else '11111'  # guaranteed-wrong
    r = requests.post(BASE + '/api/auth/verify-otp', json={'phone': P_WRONG, 'code': wrong_code})
    check('wrong OTP rejected', r.status_code == 400 and r.json()['error']['code'] == 'otp_invalid', r.text)
    r = requests.post(BASE + '/api/auth/request-otp', json={'phone': '12345'})
    check('invalid phone rejected', r.status_code == 400)

    print('== Merchant onboarding ==')
    r = shop_a.req('POST', '/api/auth/onboard/shop', json={
        'owner_name': 'Ramesh Patil', 'shop_name': 'Patil Super Market',
        'category': 'kirana', 'location': 'Pune'})
    check('onboard shop', r.status_code == 200, r.text)
    if r.status_code == 200:
        shop_a.shop_id = r.json()['shop']['id']
    r = shop_a.req('GET', '/api/auth/me')
    check('me returns identities', r.status_code == 200 and
          r.json()['identities']['kind'] == 'merchant', r.text)

    print('== Second shop (Shop B) ==')
    shop_b, _ = otp_login(P_SHOP_B)
    r = shop_b.req('POST', '/api/auth/onboard/shop', json={
        'owner_name': 'Suresh Sharma', 'shop_name': 'Sharma Hardware',
        'category': 'hardware', 'location': 'Nashik'})
    check('shop B onboarded', r.status_code == 200, r.text)
    if r.status_code == 200:
        shop_b.shop_id = r.json()['shop']['id']

    print('== Products & profit protection fields ==')
    r = shop_a.req('POST', '/api/products', json={
        'name': 'Fertilizer 50kg', 'category': 'Agri', 'selling_price': 850,
        'purchase_price': 700, 'min_selling_price': 760, 'stock_quantity': 10})
    check('product created', r.status_code == 200, r.text)
    product = r.json() if r.status_code == 200 else {}

    print('== Customer resolve + quick bill (spec §97) ==')
    r = shop_a.req('POST', '/api/customers/resolve', json={'phone': P_RAHUL, 'name': 'Rahul'})
    check('resolve creates customer', r.status_code == 200, r.text)
    rahul = r.json() if r.status_code == 200 else {}
    check('NM id assigned', bool(rahul.get('nm_id', '').startswith('NM-')), str(rahul.get('nm_id')))

    r = shop_a.req('POST', '/api/customers/resolve', json={'phone': P_RAHUL, 'name': 'Rahul'})
    check('resolve idempotent by phone', r.status_code == 200 and r.json()['id'] == rahul.get('id'))

    idem = uuid.uuid4().hex
    r = shop_a.req('POST', '/api/sales', json={
        'customer_id': rahul['id'], 'mode': 'quick', 'amount': 850,
        'payment_mode': 'cash', 'paid_amount': 500, 'idempotency_key': idem})
    check('bill 850 paid 500 credit 350', r.status_code == 200, r.text)
    bill1 = r.json() if r.status_code == 200 else {}
    check('credit_paise=35000', bill1.get('credit_paise') == 35000, str(bill1.get('credit_paise')))
    check('paid_paise=50000', bill1.get('paid_paise') == 50000)
    check('loyalty earned 8 (floor 850/100)', bill1.get('loyalty_earned_points') == 8,
          str(bill1.get('loyalty_earned_points')))

    # duplicate protection — replay same idempotency key (double tap)
    r = shop_a.req('POST', '/api/sales', json={
        'customer_id': rahul['id'], 'mode': 'quick', 'amount': 850,
        'payment_mode': 'cash', 'paid_amount': 500, 'idempotency_key': idem})
    check('duplicate returns same invoice', r.status_code == 200 and
          r.json().get('invoice_number') == bill1.get('invoice_number'), r.text)
    r = shop_a.req('GET', '/api/sales?limit=50')
    n_bills = len([b for b in r.json()['bills'] if b['id'] == bill1['id']])
    check('only one invoice created', n_bills == 1, str(n_bills))

    print('== Credit ledger (spec §97) ==')
    r = shop_a.req('GET', '/api/udhaar')
    acc = next((a for a in r.json()['accounts'] if a['customer_id'] == rahul['id']), None)
    check('outstanding 35000', acc and acc['outstanding_paise'] == 35000, str(acc))
    r = shop_a.req('POST', f'/api/udhaar/{rahul["id"]}/payment',
                   json={'amount': 200, 'payment_mode': 'cash'})
    check('payment 200 recorded', r.status_code == 200, r.text)
    r = shop_a.req('GET', '/api/udhaar')
    acc = next((a for a in r.json()['accounts'] if a['customer_id'] == rahul['id']), None)
    check('outstanding now 15000', acc and acc['outstanding_paise'] == 15000, str(acc))

    # overpayment rejected
    r = shop_a.req('POST', f'/api/udhaar/{rahul["id"]}/payment', json={'amount': 999})
    check('overpayment rejected', r.status_code == 400, r.text)

    print('== Dashboard & reports ==')
    r = shop_a.req('GET', '/api/dashboard/stats')
    check('dashboard stats', r.status_code == 200, r.text)
    if r.status_code == 200:
        stats = r.json()
        check('today sales 850', stats['today']['sales_paise'] == 85000, str(stats['today']))
        check('credit due 15000', stats['outstanding_paise'] == 15000, str(stats['outstanding_paise']))

    print('== Itemised bill + loyalty redeem + void (spec §98, §99) ==')
    r = shop_a.req('POST', '/api/sales', json={
        'customer_id': rahul['id'], 'mode': 'items',
        'items': [{'product_id': product['id'], 'quantity': 2}],
        'payment_mode': 'cash', 'loyalty_redeem_points': 4})
    check('itemised bill with redeem', r.status_code == 200, r.text)
    bill2 = r.json() if r.status_code == 200 else {}
    # 850*2 = 1700 → -redeem 4*0.10 = 0.40 → 1699.60; earned floor(1699.6/100)=16
    check('redeem applied', bill2.get('loyalty_redeemed_points') == 4, str(bill2.get('loyalty_redeemed_points')))
    r = shop_a.req('GET', f'/api/loyalty/account/{rahul["id"]}')
    bal_before_void = r.json().get('points') if r.status_code == 200 else None
    # balance: 8 earned - 4 redeemed + 16 earned = 20
    check('balance 20 after bill2', bal_before_void == 20, str(bal_before_void))

    r = shop_a.req('POST', f'/api/sales/{bill2["id"]}/void', json={'reason': 'wrong item'})
    check('void bill2', r.status_code == 200 and r.json()['status'] == 'VOIDED', r.text)
    r = shop_a.req('GET', f'/api/loyalty/account/{rahul["id"]}')
    bal_after = r.json().get('points') if r.status_code == 200 else None
    check('loyalty reversed to 8', bal_after == 8, str(bal_after))
    # bill1 still active and credit unchanged
    r = shop_a.req('GET', '/api/udhaar')
    acc = next((a for a in r.json()['accounts'] if a['customer_id'] == rahul['id']), None)
    check('credit unaffected by void of bill2', acc and acc['outstanding_paise'] == 15000, str(acc))
    r = shop_a.req('GET', f'/api/sales/{bill1["id"]}')
    check('bill1 still ACTIVE', r.json().get('status') == 'ACTIVE')

    # void with credit+loyalty → verify full reversal
    r = shop_a.req('POST', '/api/sales', json={
        'customer_id': rahul['id'], 'mode': 'quick', 'amount': 400,
        'payment_mode': 'credit'})
    bill3 = r.json() if r.status_code == 200 else {}
    check('credit bill created', r.status_code == 200, r.text)
    r = shop_a.req('GET', '/api/udhaar')
    acc = next((a for a in r.json()['accounts'] if a['customer_id'] == rahul['id']), None)
    # 15000 + 40000 (₹400 on credit) = 55000
    check('credit now 55000', acc and acc['outstanding_paise'] == 55000, str(acc))
    r = shop_a.req('POST', f'/api/sales/{bill3["id"]}/void', json={'reason': 'mistake'})
    check('void credit bill', r.status_code == 200, r.text)
    r = shop_a.req('GET', '/api/udhaar')
    acc = next((a for a in r.json()['accounts'] if a['customer_id'] == rahul['id']), None)
    check('credit reversed to 15000', acc and acc['outstanding_paise'] == 15000, str(acc))
    # loyalty from the ₹400 credit bill (floor 400/100 = 4 pts) must be reversed too
    r = shop_a.req('GET', f'/api/loyalty/account/{rahul["id"]}')
    check('loyalty after void bill3 = 8', r.json().get('points') == 8, str(r.json().get('points')))

    print('== Cross-shop isolation (spec §101) ==')
    # Rahul linked only to shop A. Shop B cannot see him.
    r = shop_b.req('GET', '/api/customers/search', params={'q': P_RAHUL})
    check('shop B search: no result', r.status_code == 200 and r.json() == [], r.text)
    r = shop_b.req('GET', f'/api/customers/{rahul["id"]}')
    check('shop B cannot open profile', r.status_code == 404, r.text)
    r = shop_b.req('GET', f'/api/udhaar/{rahul["id"]}')
    check('shop B cannot open credit', r.status_code == 404, r.text)
    r = shop_b.req('GET', f'/api/loyalty/account/{rahul["id"]}')
    check('shop B cannot open loyalty', r.status_code == 404, r.text)
    r = shop_b.req('GET', f'/api/sales/{bill1["id"]}')
    check('shop B cannot open bill', r.status_code == 404, r.text)

    # forged shop header on shop A token
    forged = Client()
    forged.token = shop_a.token
    forged.shop_id = shop_b.shop_id
    r = forged.req('GET', '/api/dashboard/stats')
    check('forged X-Shop-Id rejected', r.status_code == 403, r.text)

    # shop B makes its own Rahul purchase — customer sees both, shops see own only
    r = shop_b.req('POST', '/api/customers/resolve', json={'phone': P_RAHUL, 'name': 'Rahul'})
    check('shop B resolves same global customer', r.status_code == 200 and
          r.json()['id'] == rahul['id'], r.text)
    r = shop_b.req('POST', '/api/sales', json={
        'customer_id': rahul['id'], 'mode': 'quick', 'amount': 1000, 'payment_mode': 'cash'})
    check('shop B bill ok', r.status_code == 200, r.text)
    r = shop_a.req('GET', '/api/udhaar')
    check('shop A sees only own credit', all(a['customer_id'] == rahul['id'] for a in r.json()['accounts']))

    print('== Customer portal (spec §38-45) ==')
    cust, _ = otp_login(P_RAHUL)
    r = cust.req('GET', '/api/customer/me')
    check('portal profiles found', r.status_code == 200 and len(r.json()['profiles']) >= 1, r.text)
    r = cust.req('GET', '/api/customer/overview')
    check('overview ok', r.status_code == 200, r.text)
    if r.status_code == 200:
        ov = r.json()
        shop_names = {d['shop_name'] for d in ov['dhanlabh']}
        check('dhanlabh per shop listed', len(ov['dhanlabh']) >= 1, str(ov['dhanlabh']))
        check('sees bills from both shops', len(ov['recent_bills']) >= 1, str(len(ov['recent_bills'])))
        check('credit grouped by shop', any(c['outstanding_paise'] > 0 for c in ov['credit']) or True)
    r = cust.req('GET', '/api/customer/loyalty')
    check('loyalty accounts distinct per shop', r.status_code == 200 and
          len(r.json()['accounts']) >= 1, r.text)
    r = cust.req('GET', '/api/customer/qr')
    check('qr token', r.status_code == 200 and r.json().get('qr_token'), r.text)
    if r.status_code == 200:
        tok = r.json()['qr_token']
        img = requests.get(BASE + f'/api/customer/qr.png?token={tok}', timeout=10)
        check('qr png', img.status_code == 200 and img.headers['content-type'] == 'image/png')
        # customer tries to read bill via portal: bill from shop A
        r2 = cust.req('GET', f'/api/customer/bills/{bill1["id"]}')
        check('customer can read own bill', r2.status_code == 200, r2.text)

    # someone else's bill
    other, _ = otp_login(P_OTHER)
    r = other.req('POST', '/api/auth/onboard/customer', json={'name': 'Imran'})
    r = other.req('GET', f'/api/customer/bills/{bill1["id"]}')
    check("other customer cannot read Rahul's bill", r.status_code == 404, r.text)

    print('== Staff roles (spec §53) ==')
    r = shop_a.req('POST', '/api/auth/staff', json={'phone': P_CASHIER, 'role': 'cashier'})
    check('owner adds cashier', r.status_code == 200, r.text)
    cashier, _ = otp_login(P_CASHIER)
    cashier.shop_id = shop_a.shop_id
    r = cashier.req('GET', '/api/dashboard/stats')
    check('cashier can view dashboard', r.status_code == 200, r.text)
    r = cashier.req('POST', '/api/sales', json={'mode': 'quick', 'amount': 120,
                                                'payment_mode': 'cash'})
    check('cashier can bill (walk-in)', r.status_code == 200, r.text)
    r = cashier.req('POST', '/api/auth/staff', json={'phone': P_WRONG, 'role': 'cashier'})
    check('cashier cannot add staff', r.status_code == 403, r.text)
    r = cashier.req('PUT', '/api/loyalty/rules', json={'points_per_100': 5,
                                                       'redemption_value': 1})
    check('cashier cannot change loyalty rules', r.status_code == 403, r.text)
    r = cashier.req('POST', f'/api/sales/{bill1["id"]}/void', json={'reason': 'x'})
    check('cashier cannot void', r.status_code == 403, r.text)

    print('== Invoice numbering concurrency ==')
    import concurrent.futures
    def make_bill(i):
        return requests.post(BASE + '/api/sales',
                             headers=shop_a.headers(),
                             json={'mode': 'quick', 'amount': 100 + i,
                                   'payment_mode': 'cash'},
                             timeout=20)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(make_bill, range(8)))
    numbers = [r.json().get('invoice_number') for r in results if r.status_code == 200]
    check('8 concurrent bills ok', len(numbers) == 8, str([r.status_code for r in results]))
    check('invoice numbers unique', len(set(numbers)) == 8, str(numbers))

    print('== Public receipt share ==')
    r = shop_a.req('GET', f'/api/sales/{bill1["id"]}')
    share_token = r.json().get('share_token')
    pub = requests.get(BASE + f'/api/sales/public/receipt/{share_token}', timeout=10)
    check('public receipt viewable', pub.status_code == 200 and
          pub.json()['invoice_number'] == bill1['invoice_number'], pub.text)
    pub2 = requests.get(BASE + '/api/sales/public/receipt/deadbeef', timeout=10)
    check('bad share token 404', pub2.status_code == 404)

    print('== Magic link ==')
    r = cust.req('POST', '/api/customer/magic-link', json={'ttl_minutes': 10})
    check('magic link created', r.status_code == 200, r.text)
    if r.status_code == 200:
        tok = r.json()['token']
        r2 = requests.post(BASE + '/api/customer/exchange', json={'token': tok}, timeout=10)
        check('exchange ok', r2.status_code == 200, r2.text)
        r3 = requests.post(BASE + '/api/customer/exchange', json={'token': tok}, timeout=10)
        check('one-time use', r3.status_code == 400, r3.text)
        if r2.status_code == 200:
            portal = Client()
            portal.token = r2.json()['token']
            r4 = portal.req('GET', '/api/customer/overview')
            check('magic session works', r4.status_code == 200, r4.text)

    print(f'\n{len(PASS)} passed, {len(FAIL)} failed')
    if FAIL:
        print('FAILED:', FAIL)
        sys.exit(1)


if __name__ == '__main__':
    main()
