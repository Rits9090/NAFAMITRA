import uuid, random
from datetime import datetime, timezone, timedelta
from auth import hash_password

DEMO_EMAIL = "demo@nafamitra.com"
DEMO_PASSWORD = "Demo@123"
BUSINESS_NAME = "Shree Ganesh General Store"

CUSTOMERS = [
    {"name": "Ramesh Sharma", "phone": "9876543210"},
    {"name": "Sunita Devi", "phone": "9812345678"},
    {"name": "Dinesh Patel", "phone": "9823456789"},
    {"name": "Mahesh Gupta", "phone": "9834567890"},
    {"name": "Priya Singh", "phone": "9845678901"},
    {"name": "Vikram Rao", "phone": "9856789012"},
    {"name": "Anita Kumari", "phone": "9867890123"},
    {"name": "Suresh Verma", "phone": "9878901234"},
    {"name": "Kavita Mishra", "phone": "9889012345"},
    {"name": "Rajesh Tiwari", "phone": "9890123456"},
    {"name": "Meena Agarwal", "phone": "9801234567"},
    {"name": "Amit Joshi", "phone": "9811234567"},
    {"name": "Geeta Yadav", "phone": "9821234567"},
    {"name": "Ravi Kumar", "phone": "9831234567"},
    {"name": "Shanti Pandey", "phone": "9841234567"},
    {"name": "Deepak Srivastava", "phone": "9851234567"},
    {"name": "Pooja Chaudhary", "phone": "9861234567"},
    {"name": "Vinod Mehta", "phone": "9871234567"},
    {"name": "Lata Bhatt", "phone": "9881234567"},
    {"name": "Arun Saxena", "phone": "9891234567"},
    {"name": "Neha Dubey", "phone": "9876123456"},
    {"name": "Satish Nair", "phone": "9812654321"},
    {"name": "Rekha Pillai", "phone": "9823765432"},
    {"name": "Mohan Iyer", "phone": "9834876543"},
    {"name": "Pushpa Reddy", "phone": "9845987654"}
]

PRODUCTS = [
    {"name": "Aashirvaad Atta 5kg", "category": "Atta & Rice", "selling_price": 220, "purchase_price": 190, "stock": 45, "unit": "bag"},
    {"name": "India Gate Basmati Rice 1kg", "category": "Atta & Rice", "selling_price": 95, "purchase_price": 80, "stock": 60, "unit": "kg"},
    {"name": "Toor Dal 1kg", "category": "Dal & Pulses", "selling_price": 130, "purchase_price": 115, "stock": 35, "unit": "kg"},
    {"name": "Moong Dal 1kg", "category": "Dal & Pulses", "selling_price": 110, "purchase_price": 95, "stock": 28, "unit": "kg"},
    {"name": "Sugar 1kg", "category": "Staples", "selling_price": 42, "purchase_price": 38, "stock": 80, "unit": "kg"},
    {"name": "Iodized Salt 1kg", "category": "Staples", "selling_price": 20, "purchase_price": 15, "stock": 100, "unit": "kg"},
    {"name": "Saffola Active Oil 1L", "category": "Oils", "selling_price": 140, "purchase_price": 125, "stock": 30, "unit": "litre"},
    {"name": "MDH Garam Masala 100g", "category": "Spices", "selling_price": 70, "purchase_price": 58, "stock": 22, "unit": "packet"},
    {"name": "Tata Tea Premium 250g", "category": "Beverages", "selling_price": 95, "purchase_price": 82, "stock": 40, "unit": "packet"},
    {"name": "Nescafe Classic 50g", "category": "Beverages", "selling_price": 135, "purchase_price": 118, "stock": 18, "unit": "jar"},
    {"name": "Colgate Strong Teeth 200g", "category": "Personal Care", "selling_price": 88, "purchase_price": 74, "stock": 25, "unit": "piece"},
    {"name": "Lux Soap 100g", "category": "Personal Care", "selling_price": 40, "purchase_price": 32, "stock": 50, "unit": "piece"},
    {"name": "Dettol Soap 125g", "category": "Personal Care", "selling_price": 52, "purchase_price": 43, "stock": 35, "unit": "piece"},
    {"name": "Clinic Plus Shampoo 175ml", "category": "Personal Care", "selling_price": 102, "purchase_price": 88, "stock": 20, "unit": "bottle"},
    {"name": "Vim Bar 200g", "category": "Household", "selling_price": 30, "purchase_price": 24, "stock": 60, "unit": "piece"},
    {"name": "Ariel Detergent 1kg", "category": "Household", "selling_price": 255, "purchase_price": 224, "stock": 15, "unit": "kg"},
    {"name": "Harpic Power Plus 500ml", "category": "Household", "selling_price": 85, "purchase_price": 72, "stock": 18, "unit": "bottle"},
    {"name": "Eno Fruit Salt 100g", "category": "Health", "selling_price": 70, "purchase_price": 58, "stock": 25, "unit": "bottle"},
    {"name": "Parachute Coconut Oil 200ml", "category": "Personal Care", "selling_price": 75, "purchase_price": 63, "stock": 30, "unit": "bottle"},
    {"name": "Dabur Honey 250g", "category": "Health", "selling_price": 120, "purchase_price": 104, "stock": 15, "unit": "bottle"},
    {"name": "Real Fruit Juice Mango 1L", "category": "Beverages", "selling_price": 75, "purchase_price": 62, "stock": 25, "unit": "pack"},
    {"name": "Kurkure Masala Munch 90g", "category": "Snacks", "selling_price": 20, "purchase_price": 16, "stock": 40, "unit": "packet"},
    {"name": "Lay's Classic Salted 52g", "category": "Snacks", "selling_price": 20, "purchase_price": 16, "stock": 35, "unit": "packet"},
    {"name": "Parle-G Biscuits 250g", "category": "Biscuits", "selling_price": 30, "purchase_price": 24, "stock": 55, "unit": "packet"},
    {"name": "Marie Gold Biscuits 200g", "category": "Biscuits", "selling_price": 35, "purchase_price": 28, "stock": 45, "unit": "packet"},
    {"name": "KitKat 4 Finger 41g", "category": "Chocolates", "selling_price": 30, "purchase_price": 24, "stock": 30, "unit": "piece"},
    {"name": "Pepsi 600ml", "category": "Beverages", "selling_price": 38, "purchase_price": 32, "stock": 48, "unit": "bottle"},
    {"name": "Bisleri Water 1L", "category": "Beverages", "selling_price": 20, "purchase_price": 15, "stock": 70, "unit": "bottle"},
    {"name": "Maggi Noodles 70g", "category": "Noodles", "selling_price": 14, "purchase_price": 11, "stock": 65, "unit": "packet"},
    {"name": "Glucon-D Orange 200g", "category": "Health", "selling_price": 65, "purchase_price": 55, "stock": 8, "unit": "bottle"},
    {"name": "Dettol Handwash 200ml", "category": "Personal Care", "selling_price": 70, "purchase_price": 58, "stock": 3, "unit": "bottle"},
    {"name": "Chyawanprash 500g", "category": "Health", "selling_price": 145, "purchase_price": 125, "stock": 2, "unit": "jar"},
    {"name": "Amul Butter 100g", "category": "Dairy", "selling_price": 55, "purchase_price": 48, "stock": 10, "unit": "pack"},
    {"name": "Nestle Milkmaid 200g", "category": "Dairy", "selling_price": 50, "purchase_price": 42, "stock": 12, "unit": "tin"},
    {"name": "Lifebuoy Soap 100g", "category": "Personal Care", "selling_price": 38, "purchase_price": 30, "stock": 4, "unit": "piece"},
]

SUPPLIERS = [
    {"name": "Brijlal & Sons Distributors", "phone": "9900112233"},
    {"name": "Shiv Shakti Wholesale", "phone": "9900223344"},
    {"name": "Metro Cash & Carry", "phone": "9900334455"},
    {"name": "HUL Distributor - Ravi Agencies", "phone": "9900445566"},
    {"name": "P&G Representative - Mahesh Traders", "phone": "9900556677"},
]

async def seed_demo_business(db):
    existing = await db.users.find_one({'email': DEMO_EMAIL}, {'_id': 0})
    if existing:
        return {'status': 'already_seeded', 'email': DEMO_EMAIL, 'password': DEMO_PASSWORD}

    now = datetime.now(timezone.utc)

    # Create user
    user_id = str(uuid.uuid4())
    business_id = str(uuid.uuid4())
    await db.users.insert_one({
        'id': user_id, 'email': DEMO_EMAIL,
        'password_hash': hash_password(DEMO_PASSWORD),
        'name': 'Ganesh Prasad', 'phone': '9876500000',
        'business_id': business_id, 'role': 'owner',
        'is_active': True, 'created_at': now.isoformat()
    })

    # Create business
    await db.businesses.insert_one({
        'id': business_id, 'name': BUSINESS_NAME, 'category': 'kirana',
        'owner_id': user_id, 'address': 'Shop No. 5, Gandhi Market, Mumbai - 400001',
        'phone': '9876500000', 'gst_number': '27AAPFG1234A1Z5',
        'subscription_plan': 'pro',
        'settings': {'loyalty_points_per_100': 1, 'silver_threshold': 500, 'gold_threshold': 2000, 'vip_threshold': 5000, 'redemption_value': 0.1},
        'created_at': now.isoformat()
    })

    # Create products
    product_ids = []
    for i, p in enumerate(PRODUCTS):
        pid = str(uuid.uuid4())
        product_ids.append(pid)
        await db.products.insert_one({
            'id': pid, 'business_id': business_id,
            'sku': f"SKU{(i+1):03d}", 'name': p['name'],
            'category': p['category'], 'brand': p['name'].split()[0],
            'selling_price': p['selling_price'], 'purchase_price': p['purchase_price'],
            'stock_quantity': p['stock'], 'low_stock_threshold': 5,
            'unit': p.get('unit', 'piece'), 'is_active': True,
            'created_at': (now - timedelta(days=random.randint(30, 90))).isoformat()
        })

    # Create suppliers
    supplier_ids = []
    for s in SUPPLIERS:
        sid = str(uuid.uuid4())
        supplier_ids.append(sid)
        await db.suppliers.insert_one({
            'id': sid, 'business_id': business_id,
            'name': s['name'], 'phone': s['phone'],
            'total_purchases': random.uniform(5000, 20000),
            'total_paid': random.uniform(3000, 15000),
            'outstanding': random.uniform(500, 5000),
            'created_at': (now - timedelta(days=60)).isoformat()
        })

    # Create customers
    customer_ids = []
    for i, c in enumerate(CUSTOMERS):
        cid = str(uuid.uuid4())
        customer_ids.append(cid)
        points = random.uniform(0, 3000)
        total_purchases = random.uniform(500, 15000)
        visits = random.randint(2, 40)
        last_purchase = now - timedelta(days=random.randint(0, 45))
        membership = 'bronze'
        if points >= 5000: membership = 'vip'
        elif points >= 2000: membership = 'gold'
        elif points >= 500: membership = 'silver'

        tags = []
        if total_purchases > 10000: tags.append('VIP')
        elif total_purchases > 5000: tags.append('HIGH_VALUE')
        if visits > 20: tags.append('FREQUENT_BUYER')
        if (now - last_purchase).days > 30: tags.append('INACTIVE')

        await db.customers.insert_one({
            'id': cid, 'business_id': business_id,
            'customer_id': f"NF{(i+1):03d}", 'name': c['name'], 'phone': c['phone'],
            'email': None, 'birthday': f"1985-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            'tags': tags, 'notes': None, 'membership_level': membership,
            'loyalty_points': round(points, 2), 'cashback_balance': 0.0,
            'referral_code': f"NM{''.join(w[0].upper() for w in c['name'].split()[:2])}{cid[:4].upper()}",
            'referred_by': None, 'total_purchases': round(total_purchases, 2),
            'total_visits': visits, 'last_purchase_at': last_purchase.isoformat(),
            'is_active': True, 'created_at': (now - timedelta(days=random.randint(30, 180))).isoformat()
        })

    # Create sales (last 30 days)
    payment_modes = ['cash', 'cash', 'upi', 'upi', 'upi', 'card', 'udhaar']
    sale_count = 0
    for day_offset in range(30):
        sale_date = now - timedelta(days=day_offset)
        n_sales = random.randint(1, 5)
        for _ in range(n_sales):
            sale_time = sale_date.replace(hour=random.randint(9, 20), minute=random.randint(0, 59))
            cust_idx = random.randint(0, len(customer_ids) - 1)
            cust_id = customer_ids[cust_idx]
            cust_name = CUSTOMERS[cust_idx]['name']
            n_items = random.randint(1, 4)
            items = []
            total_cost = 0
            for _ in range(n_items):
                prod_idx = random.randint(0, len(PRODUCTS) - 1)
                prod = PRODUCTS[prod_idx]
                qty = random.randint(1, 3)
                total = prod['selling_price'] * qty
                cost = prod['purchase_price'] * qty
                items.append({
                    'product_id': product_ids[prod_idx],
                    'product_name': prod['name'],
                    'sku': f"SKU{(prod_idx+1):03d}",
                    'quantity': qty,
                    'unit_price': prod['selling_price'],
                    'discount': 0.0,
                    'total': total,
                    'cost': cost
                })
                total_cost += cost

            subtotal = sum(i['total'] for i in items)
            payment_mode = random.choice(payment_modes)
            payment_status = 'pending' if payment_mode == 'udhaar' else 'paid'
            paid_amount = 0.0 if payment_mode == 'udhaar' else subtotal
            invoice_num = f"INV-{sale_time.strftime('%y%m')}-{sale_count+1:03d}"
            sale_id = str(uuid.uuid4())

            await db.sales.insert_one({
                'id': sale_id, 'business_id': business_id,
                'invoice_number': invoice_num, 'customer_id': cust_id, 'customer_name': cust_name,
                'items': items, 'subtotal': subtotal, 'discount': 0.0, 'tax': 0.0,
                'total_amount': subtotal, 'total_cost': total_cost,
                'payment_mode': payment_mode, 'payment_status': payment_status,
                'paid_amount': paid_amount, 'balance_amount': subtotal if payment_mode == 'udhaar' else 0,
                'loyalty_points_earned': subtotal / 10, 'loyalty_points_redeemed': 0.0,
                'notes': None, 'created_at': sale_time.isoformat(), 'created_by': user_id
            })
            sale_count += 1

    # Create udhaar for some customers
    udhaar_customers = customer_ids[:8]
    for cid in udhaar_customers:
        idx = customer_ids.index(cid)
        total_credit = round(random.uniform(500, 3000), 2)
        total_paid = round(random.uniform(0, total_credit * 0.6), 2)
        outstanding = total_credit - total_paid
        entries = [
            {'date': (now - timedelta(days=random.randint(5, 25))).isoformat(), 'description': 'Udhaar given', 'amount': total_credit, 'type': 'given'},
        ]
        if total_paid > 0:
            entries.append({'date': (now - timedelta(days=random.randint(1, 10))).isoformat(), 'description': 'Partial payment received', 'amount': total_paid, 'type': 'received', 'payment_mode': 'cash'})
        await db.udhaar.insert_one({
            'id': str(uuid.uuid4()), 'business_id': business_id, 'customer_id': cid,
            'customer_name': CUSTOMERS[idx]['name'], 'customer_phone': CUSTOMERS[idx]['phone'],
            'total_credit': total_credit, 'total_paid': total_paid, 'outstanding': outstanding,
            'entries': entries, 'last_transaction_at': (now - timedelta(days=random.randint(1, 15))).isoformat(),
            'created_at': (now - timedelta(days=30)).isoformat()
        })

    # Create loyalty transactions
    for cid in customer_ids[:15]:
        idx = customer_ids.index(cid)
        await db.loyalty_transactions.insert_one({
            'id': str(uuid.uuid4()), 'business_id': business_id, 'customer_id': cid,
            'sale_id': None, 'points_earned': round(random.uniform(50, 500), 2),
            'points_redeemed': 0.0, 'created_at': (now - timedelta(days=random.randint(1, 30))).isoformat()
        })

    return {'status': 'seeded', 'email': DEMO_EMAIL, 'password': DEMO_PASSWORD, 'business': BUSINESS_NAME, 'customers': len(CUSTOMERS), 'products': len(PRODUCTS), 'sales': sale_count}
