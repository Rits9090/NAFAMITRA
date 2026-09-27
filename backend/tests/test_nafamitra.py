"""NafaMitra API Tests - Full coverage for all major flows"""
import pytest
import requests
from requests import Session
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

def make_session(token=None):
    """Session that preserves auth headers through redirects"""
    session = Session()
    if token:
        session.headers.update({"Authorization": f"Bearer {token}"})
    session.headers.update({"Content-Type": "application/json"})
    # Rebuild auth on redirect
    def rebuild_auth(prepared, response, **kwargs):
        if token:
            prepared.headers['Authorization'] = f'Bearer {token}'
    session.rebuild_auth = rebuild_auth
    return session

@pytest.fixture(scope="module")
def auth_token():
    """Seed demo data and login to get token"""
    requests.post(f"{BASE_URL}/api/seed")
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo@nafamitra.com",
        "password": "Demo@123"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

@pytest.fixture(scope="module")
def sess(auth_token):
    """Session with auth headers that survive redirects"""
    return make_session(auth_token)

# ---- Health ----
def test_health():
    resp = requests.get(f"{BASE_URL}/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

# ---- Auth ----
def test_seed():
    resp = requests.post(f"{BASE_URL}/api/seed")
    assert resp.status_code == 200
    print(f"Seed result: {resp.json()}")

def test_login_demo():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo@nafamitra.com",
        "password": "Demo@123"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "user" in data
    print(f"Login OK: {data['user'].get('email')}")

def test_login_invalid():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "wrong@example.com",
        "password": "wrongpass"
    })
    assert resp.status_code in [400, 401, 422]

def test_register_new_user():
    resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": "test_reg_nafamitra@test.com",
        "password": "Test@123",
        "name": "Test User"
    })
    assert resp.status_code in [200, 201, 400]
    print(f"Register: {resp.status_code} - {resp.text[:100]}")

# ---- Dashboard ----
def test_dashboard_stats(sess):
    resp = sess.get(f"{BASE_URL}/api/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "today" in data or "month" in data or "outstanding" in data
    print(f"Dashboard stats keys: {list(data.keys())}")

def test_dashboard_chart(sess):
    resp = sess.get(f"{BASE_URL}/api/dashboard/chart")
    assert resp.status_code == 200
    data = resp.json()
    print(f"Chart data type: {type(data)}, length: {len(data) if isinstance(data, list) else 'n/a'}")

# ---- Customers ----
def test_get_customers(headers):
    resp = requests.get(f"{BASE_URL}/api/customers", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    customers = data.get("customers", data) if isinstance(data, dict) else data
    assert len(customers) >= 10, f"Expected >= 10 customers, got {len(customers)}"
    print(f"Customers count: {len(customers)}")

def test_search_customer(headers):
    resp = requests.get(f"{BASE_URL}/api/customers?search=Ramesh", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    customers = data.get("customers", data) if isinstance(data, dict) else data
    print(f"Search Ramesh: {len(customers)} results")
    assert len(customers) >= 1

def test_create_customer(headers):
    resp = requests.post(f"{BASE_URL}/api/customers", headers=headers, json={
        "name": "TEST_Customer_New",
        "phone": "7777777777",
        "address": "Test Address"
    })
    assert resp.status_code in [200, 201]
    data = resp.json()
    assert "id" in data or "_id" in data
    print(f"Created customer: {data.get('name')}")

# ---- Products ----
def test_get_products(headers):
    resp = requests.get(f"{BASE_URL}/api/products", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    products = data.get("products", data) if isinstance(data, dict) else data
    assert len(products) >= 10, f"Expected >= 10 products, got {len(products)}"
    print(f"Products count: {len(products)}")

def test_create_product(headers):
    resp = requests.post(f"{BASE_URL}/api/products", headers=headers, json={
        "name": "TEST_Product_New",
        "selling_price": 100,
        "purchase_price": 80,
        "category": "Test",
        "stock": 50,
        "unit": "kg"
    })
    assert resp.status_code in [200, 201]
    data = resp.json()
    print(f"Created product: {data.get('name')}")

# ---- Sales ----
def test_get_sales(headers):
    resp = requests.get(f"{BASE_URL}/api/sales", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    sales = data.get("sales", data) if isinstance(data, dict) else data
    print(f"Sales count: {len(sales) if isinstance(sales, list) else data}")

def test_create_sale(headers):
    customers_resp = requests.get(f"{BASE_URL}/api/customers", headers=headers).json()
    customers = customers_resp.get("customers", customers_resp) if isinstance(customers_resp, dict) else customers_resp
    products_resp = requests.get(f"{BASE_URL}/api/products", headers=headers).json()
    products = products_resp.get("products", products_resp) if isinstance(products_resp, dict) else products_resp
    assert len(customers) > 0 and len(products) > 0

    cid = customers[0].get("id")
    pid = products[0].get("id")
    price = products[0].get("selling_price", 100)

    resp = requests.post(f"{BASE_URL}/api/sales", headers=headers, json={
        "customer_id": cid,
        "items": [{"product_id": pid, "quantity": 1, "price": price}],
        "total": price,
        "payment_mode": "cash",
        "discount": 0
    })
    assert resp.status_code in [200, 201]
    print(f"Sale created: {resp.json()}")

# ---- Udhaar ----
def test_get_udhaar(headers):
    resp = requests.get(f"{BASE_URL}/api/udhaar", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    print(f"Udhaar: {str(data)[:100]}")

# ---- Suppliers ----
def test_get_suppliers(headers):
    resp = requests.get(f"{BASE_URL}/api/suppliers", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    print(f"Suppliers: {str(data)[:100]}")

# ---- Reports ----
def test_reports_sales(sess):
    resp = sess.get(f"{BASE_URL}/api/reports/sales")
    assert resp.status_code == 200

def test_reports_products(sess):
    resp = sess.get(f"{BASE_URL}/api/reports/products")
    assert resp.status_code == 200

def test_reports_customers(sess):
    resp = sess.get(f"{BASE_URL}/api/reports/customers")
    assert resp.status_code == 200

# ---- Voice ----
def test_voice_understand(sess):
    # POST without trailing slash to avoid 307→301 redirect that converts POST→GET
    resp = sess.post(f"{BASE_URL}/api/voice/understand", json={
        "transcription": "Aaj ki total sales kitni hai?"
    })
    assert resp.status_code == 200
    data = resp.json()
    print(f"Voice understand: {data}")
    assert "intent" in data or "action" in data or "result" in data

# ---- AI Assistant ----
def test_assistant_chat(sess):
    resp = sess.post(f"{BASE_URL}/api/assistant/chat", json={
        "message": "How are my sales this month?",
        "stream": False
    }, timeout=15)
    assert resp.status_code == 200
    print(f"Assistant response: {resp.text[:200]}")
