/**
 * DEMO FIXTURES — synthetic sample data for NafaMitra Demo Mode.
 *
 * Source: harvested from the real local API (seeded with obviously-synthetic
 * "Demo *" records), then phone-masked and unwrapped to raw response bodies.
 * Shapes are byte-compatible with production responses so every real screen
 * renders unmodified. NEVER contains real customer data. Writes outside the
 * explicit local-demo allowlist are rejected (see demoHandle.js).
 */

export const DEMO_SHOP = {
  id: 'demo-shop-001',
  name: 'Demo Kirana Store',
  category: 'kirana',
  location: 'Pune',
};

export const DEMO_ME = {
  user: { id: 'demo-user-001', phone: '9876543210', name: 'Demo Owner', is_active: true },
  identities: {
    kind: 'merchant',
    shops: [{ id: 'demo-shop-001', name: 'Demo Kirana Store', category: 'kirana', role: 'owner' }],
    customer_profiles: [],
  },
};

/** GET-path (or path?query) → response body, merchant side. */
export const DEMO_MERCHANT = {
 "/config": {
  "brand": {
   "name": "NafaMitra",
   "tagline": "ग्राहक वाढवा, नफा वाढवा!",
   "tagline_en": "Grow Customers. Grow Profit.",
   "meaning": "Nafa = profit, Mitra = trusted business companion"
  },
  "business": {
   "timezone": "Asia/Kolkata",
   "currency": "INR",
   "currency_symbol": "₹",
   "default_language": "mr"
  },
  "languages": [
   {
    "code": "mr",
    "label": "मराठी"
   },
   {
    "code": "en",
    "label": "English"
   },
   {
    "code": "hi",
    "label": "हिंदी"
   }
  ],
  "support": {
   "whatsapp_number": "",
   "email": "",
   "enabled": false
  },
  "otp": {
   "dev_mode": true,
   "length": 5,
   "ttl_seconds": 300,
   "resend_cooldown_seconds": 30
  },
  "features": {
   "voice_assistant": true,
   "ai_assistant": true,
   "customer_magic_links": true,
   "qr_scanning": true
  }
 },
 "/dashboard/stats": {
  "today": {
   "revenue": 1300.0,
   "sales_paise": 130000,
   "sales_fmt": "₹1,300.00",
   "orders": 4,
   "bills": 4,
   "customers": 1,
   "payment_breakdown": {
    "cash": 430.0,
    "upi": 350.0,
    "credit": 520.0
   }
  },
  "month": {
   "revenue": 1300.0,
   "sales_paise": 130000,
   "sales_fmt": "₹1,300.00",
   "orders": 4,
   "bills": 4,
   "avg_bill_paise": 32500,
   "avg_bill_fmt": "₹325.00"
  },
  "customers": {
   "total": 3,
   "new_today": 3,
   "repeat": 1
  },
  "outstanding": 520.0,
  "outstanding_paise": 52000,
  "outstanding_fmt": "₹520.00",
  "credit_accounts": 1,
  "loyalty": {
   "earned": 8,
   "redeemed": 0
  },
  "low_stock_count": 1,
  "metrics": {
   "month": {
    "period": "month",
    "sales_paise": 130000,
    "sales_fmt": "₹1,300.00",
    "margin_paise": 51600,
    "margin_fmt": "₹516.00",
    "bills": 4,
    "avg_bill_paise": 32500,
    "avg_bill_fmt": "₹325.00",
    "customers_served": 1,
    "credit_collected_paise": 0,
    "credit_extended_paise": 52000,
    "loyalty_earned": 8,
    "loyalty_redeemed": 0,
    "revenue": 1300.0,
    "avg_order_value": 325.0
   },
   "today": {
    "period": "today",
    "sales_paise": 130000,
    "sales_fmt": "₹1,300.00",
    "margin_paise": 51600,
    "margin_fmt": "₹516.00",
    "bills": 4,
    "avg_bill_paise": 32500,
    "avg_bill_fmt": "₹325.00",
    "customers_served": 1,
    "credit_collected_paise": 0,
    "credit_extended_paise": 52000,
    "loyalty_earned": 8,
    "loyalty_redeemed": 0,
    "revenue": 1300.0,
    "avg_order_value": 325.0
   }
  }
 },
 "/dashboard/recent-bills": [
  {
   "id": "24ce1092-76f4-45ec-a1f9-e42c74a0a000",
   "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
   "invoice_number": "INV-2610-0004",
   "status": "ACTIVE",
   "mode": "items",
   "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
   "customer_name": "Sunita Deshmukh",
   "items": [
    {
     "product_id": "8604dea0-85c7-44f6-90df-71d76d89a24f",
     "name": "Basmati Rice 5kg",
     "sku": "SKU6E2301",
     "quantity": 1,
     "unit_price_paise": 52000,
     "discount_paise": 0,
     "total_paise": 52000,
     "cost_paise": 47000,
     "min_unit_price_paise": 49500
    }
   ],
   "subtotal_paise": 52000,
   "discount_paise": 0,
   "loyalty_redeemed_points": 0,
   "loyalty_redeemed_value_paise": 0,
   "total_paise": 52000,
   "cost_paise": 47000,
   "payment_mode": "credit",
   "payment_status": "credit",
   "paid_paise": 0,
   "credit_paise": 52000,
   "loyalty_earned_points": 5,
   "share_token": "b09fdaf079c0d7c2e6b2313d",
   "notes": null,
   "created_at": "2026-10-05T17:44:28.692937+00:00",
   "created_by": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
   "created_by_role": "owner",
   "customer": {
    "name": "Sunita Deshmukh",
    "nm_id": "NM-594596",
    "id": "4e8ebddc-8321-4d1d-959e-91a4187c811f"
   }
  },
  {
   "id": "35c17d7a-3f17-4afb-8f70-9f4692e7adef",
   "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
   "invoice_number": "INV-2610-0003",
   "status": "ACTIVE",
   "mode": "items",
   "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
   "customer_name": "Sunita Deshmukh",
   "items": [
    {
     "product_id": "3e3a88b5-22c2-49bd-8aa9-3c827eec6153",
     "name": "Toor Dal 1kg",
     "sku": "SKU3E72D2",
     "quantity": 2,
     "unit_price_paise": 16000,
     "discount_paise": 0,
     "total_paise": 32000,
     "cost_paise": 28000,
     "min_unit_price_paise": 15000
    },
    {
     "product_id": "b19a4ea1-8135-4399-a766-e267a11469bf",
     "name": "Parle-G Biscuit",
     "sku": "SKU2CD03A",
     "quantity": 4,
     "unit_price_paise": 1000,
     "discount_paise": 0,
     "total_paise": 4000,
     "cost_paise": 3400,
     "min_unit_price_paise": 900
    }
   ],
   "subtotal_paise": 36000,
   "discount_paise": 1000,
   "loyalty_redeemed_points": 0,
   "loyalty_redeemed_value_paise": 0,
   "total_paise": 35000,
   "cost_paise": 31400,
   "payment_mode": "upi",
   "payment_status": "paid",
   "paid_paise": 35000,
   "credit_paise": 0,
   "loyalty_earned_points": 3,
   "share_token": "9a8c748de3bc2289e7280c86",
   "notes": null,
   "created_at": "2026-10-05T17:44:28.688128+00:00",
   "created_by": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
   "created_by_role": "owner",
   "customer": {
    "name": "Sunita Deshmukh",
    "nm_id": "NM-594596",
    "id": "4e8ebddc-8321-4d1d-959e-91a4187c811f"
   }
  },
  {
   "id": "9e2f16e2-bd5b-4511-b19e-11e5683699a6",
   "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
   "invoice_number": "INV-2610-0002",
   "status": "ACTIVE",
   "mode": "quick",
   "customer_id": null,
   "customer_name": null,
   "items": [
    {
     "product_id": null,
     "name": "Quick sale",
     "quantity": 1,
     "unit_price_paise": 18000,
     "discount_paise": 0,
     "total_paise": 18000,
     "cost_paise": 0
    }
   ],
   "subtotal_paise": 18000,
   "discount_paise": 0,
   "loyalty_redeemed_points": 0,
   "loyalty_redeemed_value_paise": 0,
   "total_paise": 18000,
   "cost_paise": 0,
   "payment_mode": "cash",
   "payment_status": "paid",
   "paid_paise": 18000,
   "credit_paise": 0,
   "loyalty_earned_points": 0,
   "share_token": "5d3e736ae25f2f7ce18817b6",
   "notes": null,
   "created_at": "2026-10-05T17:44:28.685056+00:00",
   "created_by": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
   "created_by_role": "owner"
  },
  {
   "id": "e4c1094a-81b6-4f6a-a7f5-068c564d4519",
   "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
   "invoice_number": "INV-2610-0001",
   "status": "ACTIVE",
   "mode": "quick",
   "customer_id": null,
   "customer_name": null,
   "items": [
    {
     "product_id": null,
     "name": "Quick sale",
     "quantity": 1,
     "unit_price_paise": 25000,
     "discount_paise": 0,
     "total_paise": 25000,
     "cost_paise": 0
    }
   ],
   "subtotal_paise": 25000,
   "discount_paise": 0,
   "loyalty_redeemed_points": 0,
   "loyalty_redeemed_value_paise": 0,
   "total_paise": 25000,
   "cost_paise": 0,
   "payment_mode": "cash",
   "payment_status": "paid",
   "paid_paise": 25000,
   "credit_paise": 0,
   "loyalty_earned_points": 0,
   "share_token": "ad2bba6cd9ade2899eb09695",
   "notes": null,
   "created_at": "2026-10-05T17:44:28.681903+00:00",
   "created_by": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
   "created_by_role": "owner"
  }
 ],
 "/dashboard/recent-customers": [
  {
   "id": "de9518e8-4d74-4d02-a171-862325e38b4f",
   "name": "Asha Pawar",
   "nm_id": "NM-735650",
   "phone": "9876543202",
   "created_at": "2026-10-05T17:44:28.664789+00:00",
   "last_purchase_at": null,
   "purchase_count": 0,
   "total_spend_paise": 0
  },
  {
   "id": "643285eb-23f7-404c-b4db-9e6730e5c467",
   "name": "Ramesh Kulkarni",
   "nm_id": "NM-367018",
   "phone": "9876543201",
   "created_at": "2026-10-05T17:44:28.660969+00:00",
   "last_purchase_at": null,
   "purchase_count": 0,
   "total_spend_paise": 0
  },
  {
   "id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
   "name": "Sunita Deshmukh",
   "nm_id": "NM-594596",
   "phone": "9876543200",
   "created_at": "2026-10-05T17:44:28.657438+00:00",
   "last_purchase_at": "2026-10-05T17:44:28.692937+00:00",
   "purchase_count": 2,
   "total_spend_paise": 87000
  }
 ],
 "/retailer/actions": {
  "actions": [
   {
    "id": "low_stock:1",
    "type": "low_stock",
    "priority": 2,
    "reason_key": "action.reasonLowStock",
    "params": {
     "name": "Amul Butter 100g",
     "count": "1"
    },
    "target": "/products",
    "entity_id": null,
    "count": 1
   },
   {
    "id": "due_udhaar:1",
    "type": "due_udhaar",
    "priority": 3,
    "reason_key": "action.reasonDueUdhaar",
    "params": {
     "name": "Sunita Deshmukh",
     "amount": "520",
     "count": "1"
    },
    "target": "/credit",
    "entity_id": null,
    "count": 1
   }
  ],
  "generated_at": "2026-10-05T17:44:28.714208+00:00",
  "total": 2,
  "summary": {
   "overdue": 0,
   "low_stock": 1,
   "winback": 0,
   "requirements": 0
  }
 },
 "/products?limit=100": {
  "products": [
   {
    "id": "7c34e82c-5971-47c5-998a-3132cbc13e57",
    "business_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "sku": "SKUB1459C",
    "name": "Amul Butter 100g",
    "category": "dairy",
    "brand": null,
    "description": null,
    "selling_price": 60.0,
    "purchase_price": 54.0,
    "min_selling_price": 57.0,
    "barcode": null,
    "stock_quantity": 3,
    "low_stock_threshold": 5,
    "unit": "piece",
    "image_url": null,
    "is_active": true,
    "supplier_id": null,
    "expiry_date": null,
    "created_at": "2026-10-05T17:44:28.676012+00:00",
    "stock_status": "low_stock",
    "margin_pct": 11.1
   },
   {
    "id": "8604dea0-85c7-44f6-90df-71d76d89a24f",
    "business_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "sku": "SKU6E2301",
    "name": "Basmati Rice 5kg",
    "category": "grocery",
    "brand": null,
    "description": null,
    "selling_price": 520.0,
    "purchase_price": 470.0,
    "min_selling_price": 495.0,
    "barcode": null,
    "stock_quantity": 17,
    "low_stock_threshold": 5,
    "unit": "piece",
    "image_url": null,
    "is_active": true,
    "supplier_id": null,
    "expiry_date": null,
    "created_at": "2026-10-05T17:44:28.670429+00:00",
    "stock_status": "in_stock",
    "margin_pct": 10.6
   },
   {
    "id": "b19a4ea1-8135-4399-a766-e267a11469bf",
    "business_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "sku": "SKU2CD03A",
    "name": "Parle-G Biscuit",
    "category": "snacks",
    "brand": null,
    "description": null,
    "selling_price": 10.0,
    "purchase_price": 8.5,
    "min_selling_price": 9.0,
    "barcode": null,
    "stock_quantity": 116,
    "low_stock_threshold": 5,
    "unit": "piece",
    "image_url": null,
    "is_active": true,
    "supplier_id": null,
    "expiry_date": null,
    "created_at": "2026-10-05T17:44:28.678849+00:00",
    "stock_status": "in_stock",
    "margin_pct": 17.6
   },
   {
    "id": "95af5250-11f5-49fa-9a4c-6df8002fbc99",
    "business_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "sku": "SKU4158C3",
    "name": "Sunflower Oil 1L",
    "category": "grocery",
    "brand": null,
    "description": null,
    "selling_price": 145.0,
    "purchase_price": 132.0,
    "min_selling_price": 138.0,
    "barcode": null,
    "stock_quantity": 6,
    "low_stock_threshold": 5,
    "unit": "piece",
    "image_url": null,
    "is_active": true,
    "supplier_id": null,
    "expiry_date": null,
    "created_at": "2026-10-05T17:44:28.673177+00:00",
    "stock_status": "in_stock",
    "margin_pct": 9.8
   },
   {
    "id": "3e3a88b5-22c2-49bd-8aa9-3c827eec6153",
    "business_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "sku": "SKU3E72D2",
    "name": "Toor Dal 1kg",
    "category": "grocery",
    "brand": null,
    "description": null,
    "selling_price": 160.0,
    "purchase_price": 140.0,
    "min_selling_price": 150.0,
    "barcode": null,
    "stock_quantity": 38,
    "low_stock_threshold": 5,
    "unit": "piece",
    "image_url": null,
    "is_active": true,
    "supplier_id": null,
    "expiry_date": null,
    "created_at": "2026-10-05T17:44:28.667711+00:00",
    "stock_status": "in_stock",
    "margin_pct": 14.3
   }
  ],
  "total": 5
 },
 "/products/categories": [
  "grocery",
  "dairy",
  "snacks"
 ],
 "/products/low-stock": [
  {
   "id": "7c34e82c-5971-47c5-998a-3132cbc13e57",
   "business_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
   "sku": "SKUB1459C",
   "name": "Amul Butter 100g",
   "category": "dairy",
   "brand": null,
   "description": null,
   "selling_price": 60.0,
   "purchase_price": 54.0,
   "min_selling_price": 57.0,
   "barcode": null,
   "stock_quantity": 3,
   "low_stock_threshold": 5,
   "unit": "piece",
   "image_url": null,
   "is_active": true,
   "supplier_id": null,
   "expiry_date": null,
   "created_at": "2026-10-05T17:44:28.676012+00:00"
  }
 ],
 "/customers?segment=all&limit=20": {
  "customers": [
   {
    "id": "de9518e8-4d74-4d02-a171-862325e38b4f",
    "customer_id": "de9518e8-4d74-4d02-a171-862325e38b4f",
    "nm_id": "NM-735650",
    "name": "Asha Pawar",
    "phone": "9876543202",
    "email": null,
    "birthday": null,
    "created_at": "2026-10-05T17:44:28.664592+00:00",
    "customer_since": "2026-10-05T17:44:28.664789+00:00",
    "is_active": true,
    "purchase_count": 0,
    "total_spend_paise": 0,
    "last_purchase_at": null,
    "first_purchase_at": null,
    "notes": "new",
    "avg_bill_paise": 0,
    "credit_due_paise": 0,
    "loyalty_points": 0,
    "is_repeat": false,
    "is_new": true,
    "is_inactive": true
   },
   {
    "id": "643285eb-23f7-404c-b4db-9e6730e5c467",
    "customer_id": "643285eb-23f7-404c-b4db-9e6730e5c467",
    "nm_id": "NM-367018",
    "name": "Ramesh Kulkarni",
    "phone": "9876543201",
    "email": null,
    "birthday": null,
    "created_at": "2026-10-05T17:44:28.660766+00:00",
    "customer_since": "2026-10-05T17:44:28.660969+00:00",
    "is_active": true,
    "purchase_count": 0,
    "total_spend_paise": 0,
    "last_purchase_at": null,
    "first_purchase_at": null,
    "notes": "udhaar regular",
    "avg_bill_paise": 0,
    "credit_due_paise": 0,
    "loyalty_points": 0,
    "is_repeat": false,
    "is_new": true,
    "is_inactive": true
   },
   {
    "id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "nm_id": "NM-594596",
    "name": "Sunita Deshmukh",
    "phone": "9876543200",
    "email": null,
    "birthday": null,
    "created_at": "2026-10-05T17:44:28.657252+00:00",
    "customer_since": "2026-10-05T17:44:28.657438+00:00",
    "is_active": true,
    "purchase_count": 2,
    "total_spend_paise": 87000,
    "last_purchase_at": "2026-10-05T17:44:28.692937+00:00",
    "first_purchase_at": "2026-10-05T17:44:28.688128+00:00",
    "notes": "regular — buys groceries weekly",
    "avg_bill_paise": 43500,
    "credit_due_paise": 52000,
    "loyalty_points": 8,
    "is_repeat": true,
    "is_new": false,
    "is_inactive": false
   }
  ],
  "total": 3,
  "page": 1,
  "pages": 1,
  "segment": "all"
 },
 "/customers/search?q=a": [
  {
   "id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
   "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
   "nm_id": "NM-594596",
   "name": "Sunita Deshmukh",
   "phone": "9876543200",
   "email": null,
   "birthday": null,
   "created_at": "2026-10-05T17:44:28.657252+00:00",
   "customer_since": "2026-10-05T17:44:28.657438+00:00",
   "is_active": true,
   "purchase_count": 2,
   "total_spend_paise": 87000,
   "last_purchase_at": "2026-10-05T17:44:28.692937+00:00",
   "first_purchase_at": "2026-10-05T17:44:28.688128+00:00",
   "notes": "regular — buys groceries weekly",
   "avg_bill_paise": 43500,
   "credit_due_paise": 52000,
   "loyalty_points": 8
  },
  {
   "id": "643285eb-23f7-404c-b4db-9e6730e5c467",
   "customer_id": "643285eb-23f7-404c-b4db-9e6730e5c467",
   "nm_id": "NM-367018",
   "name": "Ramesh Kulkarni",
   "phone": "9876543201",
   "email": null,
   "birthday": null,
   "created_at": "2026-10-05T17:44:28.660766+00:00",
   "customer_since": "2026-10-05T17:44:28.660969+00:00",
   "is_active": true,
   "purchase_count": 0,
   "total_spend_paise": 0,
   "last_purchase_at": null,
   "first_purchase_at": null,
   "notes": "udhaar regular",
   "avg_bill_paise": 0,
   "credit_due_paise": 0,
   "loyalty_points": 0
  },
  {
   "id": "de9518e8-4d74-4d02-a171-862325e38b4f",
   "customer_id": "de9518e8-4d74-4d02-a171-862325e38b4f",
   "nm_id": "NM-735650",
   "name": "Asha Pawar",
   "phone": "9876543202",
   "email": null,
   "birthday": null,
   "created_at": "2026-10-05T17:44:28.664592+00:00",
   "customer_since": "2026-10-05T17:44:28.664789+00:00",
   "is_active": true,
   "purchase_count": 0,
   "total_spend_paise": 0,
   "last_purchase_at": null,
   "first_purchase_at": null,
   "notes": "new",
   "avg_bill_paise": 0,
   "credit_due_paise": 0,
   "loyalty_points": 0
  }
 ],
 "/sales?page=1&limit=10": {
  "bills": [
   {
    "id": "24ce1092-76f4-45ec-a1f9-e42c74a0a000",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "invoice_number": "INV-2610-0004",
    "status": "ACTIVE",
    "mode": "items",
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "customer_name": "Sunita Deshmukh",
    "items": [
     {
      "product_id": "8604dea0-85c7-44f6-90df-71d76d89a24f",
      "name": "Basmati Rice 5kg",
      "sku": "SKU6E2301",
      "quantity": 1,
      "unit_price_paise": 52000,
      "discount_paise": 0,
      "total_paise": 52000,
      "cost_paise": 47000,
      "min_unit_price_paise": 49500
     }
    ],
    "subtotal_paise": 52000,
    "discount_paise": 0,
    "loyalty_redeemed_points": 0,
    "loyalty_redeemed_value_paise": 0,
    "total_paise": 52000,
    "cost_paise": 47000,
    "payment_mode": "credit",
    "payment_status": "credit",
    "paid_paise": 0,
    "credit_paise": 52000,
    "loyalty_earned_points": 5,
    "share_token": "b09fdaf079c0d7c2e6b2313d",
    "notes": null,
    "created_at": "2026-10-05T17:44:28.692937+00:00",
    "created_by": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
    "created_by_role": "owner",
    "customer": {
     "id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
     "nm_id": "NM-594596",
     "name": "Sunita Deshmukh",
     "phone": "9876543200"
    }
   },
   {
    "id": "35c17d7a-3f17-4afb-8f70-9f4692e7adef",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "invoice_number": "INV-2610-0003",
    "status": "ACTIVE",
    "mode": "items",
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "customer_name": "Sunita Deshmukh",
    "items": [
     {
      "product_id": "3e3a88b5-22c2-49bd-8aa9-3c827eec6153",
      "name": "Toor Dal 1kg",
      "sku": "SKU3E72D2",
      "quantity": 2,
      "unit_price_paise": 16000,
      "discount_paise": 0,
      "total_paise": 32000,
      "cost_paise": 28000,
      "min_unit_price_paise": 15000
     },
     {
      "product_id": "b19a4ea1-8135-4399-a766-e267a11469bf",
      "name": "Parle-G Biscuit",
      "sku": "SKU2CD03A",
      "quantity": 4,
      "unit_price_paise": 1000,
      "discount_paise": 0,
      "total_paise": 4000,
      "cost_paise": 3400,
      "min_unit_price_paise": 900
     }
    ],
    "subtotal_paise": 36000,
    "discount_paise": 1000,
    "loyalty_redeemed_points": 0,
    "loyalty_redeemed_value_paise": 0,
    "total_paise": 35000,
    "cost_paise": 31400,
    "payment_mode": "upi",
    "payment_status": "paid",
    "paid_paise": 35000,
    "credit_paise": 0,
    "loyalty_earned_points": 3,
    "share_token": "9a8c748de3bc2289e7280c86",
    "notes": null,
    "created_at": "2026-10-05T17:44:28.688128+00:00",
    "created_by": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
    "created_by_role": "owner",
    "customer": {
     "id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
     "nm_id": "NM-594596",
     "name": "Sunita Deshmukh",
     "phone": "9876543200"
    }
   },
   {
    "id": "9e2f16e2-bd5b-4511-b19e-11e5683699a6",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "invoice_number": "INV-2610-0002",
    "status": "ACTIVE",
    "mode": "quick",
    "customer_id": null,
    "customer_name": null,
    "items": [
     {
      "product_id": null,
      "name": "Quick sale",
      "quantity": 1,
      "unit_price_paise": 18000,
      "discount_paise": 0,
      "total_paise": 18000,
      "cost_paise": 0
     }
    ],
    "subtotal_paise": 18000,
    "discount_paise": 0,
    "loyalty_redeemed_points": 0,
    "loyalty_redeemed_value_paise": 0,
    "total_paise": 18000,
    "cost_paise": 0,
    "payment_mode": "cash",
    "payment_status": "paid",
    "paid_paise": 18000,
    "credit_paise": 0,
    "loyalty_earned_points": 0,
    "share_token": "5d3e736ae25f2f7ce18817b6",
    "notes": null,
    "created_at": "2026-10-05T17:44:28.685056+00:00",
    "created_by": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
    "created_by_role": "owner"
   },
   {
    "id": "e4c1094a-81b6-4f6a-a7f5-068c564d4519",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "invoice_number": "INV-2610-0001",
    "status": "ACTIVE",
    "mode": "quick",
    "customer_id": null,
    "customer_name": null,
    "items": [
     {
      "product_id": null,
      "name": "Quick sale",
      "quantity": 1,
      "unit_price_paise": 25000,
      "discount_paise": 0,
      "total_paise": 25000,
      "cost_paise": 0
     }
    ],
    "subtotal_paise": 25000,
    "discount_paise": 0,
    "loyalty_redeemed_points": 0,
    "loyalty_redeemed_value_paise": 0,
    "total_paise": 25000,
    "cost_paise": 0,
    "payment_mode": "cash",
    "payment_status": "paid",
    "paid_paise": 25000,
    "credit_paise": 0,
    "loyalty_earned_points": 0,
    "share_token": "ad2bba6cd9ade2899eb09695",
    "notes": null,
    "created_at": "2026-10-05T17:44:28.681903+00:00",
    "created_by": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
    "created_by_role": "owner"
   }
  ],
  "total": 4,
  "page": 1,
  "pages": 1
 },
 "/udhaar": {
  "udhaars": [
   {
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "nm_id": "NM-594596",
    "name": "Sunita Deshmukh",
    "phone": "9876543200",
    "outstanding_paise": 52000,
    "total_credit_paise": 52000,
    "total_paid_paise": 0,
    "last_transaction_at": "2026-10-05T17:44:28.693755+00:00"
   }
  ],
  "accounts": [
   {
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "nm_id": "NM-594596",
    "name": "Sunita Deshmukh",
    "phone": "9876543200",
    "outstanding_paise": 52000,
    "total_credit_paise": 52000,
    "total_paid_paise": 0,
    "last_transaction_at": "2026-10-05T17:44:28.693755+00:00"
   }
  ],
  "total_outstanding": 52000,
  "total_outstanding_paise": 52000,
  "total_outstanding_fmt": "₹520.00"
 },
 "/loyalty/transactions": [
  {
   "id": "9bb743ee-3b33-4150-adc4-72c293aba18a",
   "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
   "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
   "type": "EARN",
   "points": 5,
   "delta": 5,
   "balance_after": 8,
   "invoice_id": "24ce1092-76f4-45ec-a1f9-e42c74a0a000",
   "actor_id": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
   "note": "Bill INV-2610-0004",
   "created_at": "2026-10-05T17:44:28.693954+00:00",
   "customer": {
    "name": "Sunita Deshmukh",
    "nm_id": "NM-594596"
   }
  },
  {
   "id": "0ca16ca4-ac2a-4b71-839e-30bd8565ec51",
   "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
   "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
   "type": "EARN",
   "points": 3,
   "delta": 3,
   "balance_after": 3,
   "invoice_id": "35c17d7a-3f17-4afb-8f70-9f4692e7adef",
   "actor_id": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
   "note": "Bill INV-2610-0003",
   "created_at": "2026-10-05T17:44:28.689092+00:00",
   "customer": {
    "name": "Sunita Deshmukh",
    "nm_id": "NM-594596"
   }
  }
 ],
 "/loyalty/rules": {
  "points_per_100": 1,
  "redemption_value": 0.1,
  "redemption_value_paise": 10,
  "loyalty_enabled": true
 },
 "/loyalty/leaderboard": [
  {
   "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
   "nm_id": "NM-594596",
   "name": "Sunita Deshmukh",
   "loyalty_points": 8,
   "total_purchases": 2,
   "membership_level": "bronze"
  }
 ],
 "/reports/sales?period=month": {
  "period": "month",
  "total_revenue": 1300.0,
  "total_profit": 516.0,
  "total_orders": 4,
  "avg_order_value": 325.0,
  "payment_breakdown": {
   "cash": 430.0,
   "upi": 350.0,
   "credit": 520.0
  },
  "credit_collected": 0.0,
  "loyalty_earned": 8,
  "loyalty_redeemed": 0,
  "daily": [
   {
    "date": "2026-10-05",
    "label": "2026-10-05",
    "revenue": 1300.0,
    "profit": 516.0,
    "orders": 4
   }
  ]
 },
 "/reports/products?period=month": [
  {
   "name": "Basmati Rice 5kg",
   "qty": 1,
   "revenue": 520.0,
   "profit": 50.0
  },
  {
   "name": "Quick sale",
   "qty": 2,
   "revenue": 430.0,
   "profit": 430.0
  },
  {
   "name": "Toor Dal 1kg",
   "qty": 2,
   "revenue": 320.0,
   "profit": 40.0
  },
  {
   "name": "Parle-G Biscuit",
   "qty": 4,
   "revenue": 40.0,
   "profit": 6.0
  }
 ],
 "/reports/customers": {
  "total": 3,
  "new_this_month": 3,
  "repeat": 1,
  "inactive_30d": 0,
  "never_purchased": 2,
  "total_spend": 870.0,
  "segments": [
   {
    "key": "all",
    "count": 3
   },
   {
    "key": "new",
    "count": 2
   },
   {
    "key": "repeat",
    "count": 1
   },
   {
    "key": "inactive",
    "count": 0
   }
  ]
 },
 "/reports/outstanding": {
  "total_paise": 52000,
  "total": 520.0,
  "total_fmt": "₹520.00",
  "rows": [
   {
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "nm_id": "NM-594596",
    "name": "Sunita Deshmukh",
    "phone": "9876543200",
    "outstanding_paise": 52000
   }
  ],
  "count": 1
 },
 "/reports/inventory": {
  "products": [
   {
    "id": "3e3a88b5-22c2-49bd-8aa9-3c827eec6153",
    "name": "Toor Dal 1kg",
    "category": "grocery",
    "selling_price": 160.0,
    "purchase_price": 140.0,
    "stock_quantity": 38,
    "low_stock_threshold": 5,
    "created_at": "2026-10-05T17:44:28.667711+00:00"
   },
   {
    "id": "8604dea0-85c7-44f6-90df-71d76d89a24f",
    "name": "Basmati Rice 5kg",
    "category": "grocery",
    "selling_price": 520.0,
    "purchase_price": 470.0,
    "stock_quantity": 17,
    "low_stock_threshold": 5,
    "created_at": "2026-10-05T17:44:28.670429+00:00"
   },
   {
    "id": "95af5250-11f5-49fa-9a4c-6df8002fbc99",
    "name": "Sunflower Oil 1L",
    "category": "grocery",
    "selling_price": 145.0,
    "purchase_price": 132.0,
    "stock_quantity": 6,
    "low_stock_threshold": 5,
    "created_at": "2026-10-05T17:44:28.673177+00:00"
   },
   {
    "id": "7c34e82c-5971-47c5-998a-3132cbc13e57",
    "name": "Amul Butter 100g",
    "category": "dairy",
    "selling_price": 60.0,
    "purchase_price": 54.0,
    "stock_quantity": 3,
    "low_stock_threshold": 5,
    "created_at": "2026-10-05T17:44:28.676012+00:00"
   },
   {
    "id": "b19a4ea1-8135-4399-a766-e267a11469bf",
    "name": "Parle-G Biscuit",
    "category": "snacks",
    "selling_price": 10.0,
    "purchase_price": 8.5,
    "stock_quantity": 116,
    "low_stock_threshold": 5,
    "created_at": "2026-10-05T17:44:28.678849+00:00"
   }
  ],
  "stock_value": 15250.0,
  "low_stock_count": 1,
  "total_products": 5,
  "low_stock": [
   {
    "id": "7c34e82c-5971-47c5-998a-3132cbc13e57",
    "name": "Amul Butter 100g",
    "category": "dairy",
    "selling_price": 60.0,
    "purchase_price": 54.0,
    "stock_quantity": 3,
    "low_stock_threshold": 5,
    "created_at": "2026-10-05T17:44:28.676012+00:00"
   }
  ],
  "out_of_stock": [],
  "dead_stock": [
   {
    "id": "95af5250-11f5-49fa-9a4c-6df8002fbc99",
    "name": "Sunflower Oil 1L",
    "category": "grocery",
    "stock_quantity": 6,
    "purchase_price": 132.0,
    "stuck_amount": 792.0
   },
   {
    "id": "7c34e82c-5971-47c5-998a-3132cbc13e57",
    "name": "Amul Butter 100g",
    "category": "dairy",
    "stock_quantity": 3,
    "purchase_price": 54.0,
    "stuck_amount": 162.0
   }
  ],
  "dead_stock_amount": 954.0
 },
 "/suppliers": [
  {
   "id": "afe900e6-fe80-47d8-af70-699b6a919185",
   "business_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
   "name": "Demo Distributors",
   "phone": "9876543203",
   "email": null,
   "address": null,
   "gst_number": null,
   "total_purchases": 0.0,
   "total_paid": 0.0,
   "outstanding": 0.0,
   "created_at": "2026-10-05T17:44:28.696919+00:00"
  }
 ],
 "/requirements": {
  "requirements": []
 },
 "/requirements/shop/list": {
  "requirements": []
 },
 "/notifications": {
  "notifications": [],
  "unread": 0
 },
 "/analytics/events": {
  "events": []
 },
 "/auth/me": {
  "user": {
   "id": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
   "phone": "9876543204",
   "name": "Demo Owner",
   "is_active": true,
   "created_at": "2026-10-05T17:44:28.649822+00:00",
   "updated_at": "2026-10-05T17:44:28.653156+00:00"
  },
  "identities": {
   "shops": [
    {
     "id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
     "name": "Demo Kirana Store",
     "category": "kirana",
     "role": "owner",
     "location": "Pune",
     "settings": {
      "loyalty_points_per_100": 1,
      "redemption_value_paise": 10,
      "loyalty_enabled": true,
      "prevent_below_min": false
     }
    }
   ],
   "customer_profiles": [],
   "kind": "merchant"
  }
 }
}
/** Customer side. */
export const DEMO_CUSTOMER = {
 "/auth/me": {
  "user": {
   "id": "19c17efb-016a-4c1d-b16d-23286e001893",
   "phone": "9876543200",
   "name": null,
   "is_active": true,
   "created_at": "2026-10-05T17:44:28.774211+00:00"
  },
  "identities": {
   "shops": [],
   "customer_profiles": [
    {
     "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
     "nm_id": "NM-594596",
     "name": "Sunita Deshmukh",
     "phone": "9876543200"
    }
   ],
   "kind": "customer"
  }
 },
 "/customer/me": {
  "profiles": [
   {
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "nm_id": "NM-594596",
    "name": "Sunita Deshmukh",
    "phone": "9876543200",
    "created_at": "2026-10-05T17:44:28.657252+00:00"
   }
  ],
  "active_profile": "4e8ebddc-8321-4d1d-959e-91a4187c811f"
 },
 "/customer/overview": {
  "dhanlabh": [
   {
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "shop_name": "Demo Kirana Store",
    "points": 8,
    "redemption_value_paise": 10,
    "estimated_value_paise": 80
   }
  ],
  "credit": [
   {
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "shop_name": "Demo Kirana Store",
    "outstanding_paise": 52000
   }
  ],
  "shops": [
   {
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "shop_name": "Demo Kirana Store",
    "category": "kirana",
    "since": "2026-10-05T17:44:28.688128+00:00",
    "purchase_count": 2,
    "total_spend_paise": 87000,
    "nm_id": "NM-594596"
   }
  ],
  "recent_bills": [
   {
    "id": "24ce1092-76f4-45ec-a1f9-e42c74a0a000",
    "invoice_number": "INV-2610-0004",
    "shop_name": "Demo Kirana Store",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "status": "ACTIVE",
    "created_at": "2026-10-05T17:44:28.692937+00:00",
    "total_paise": 52000,
    "payment_mode": "credit",
    "payment_status": "credit",
    "loyalty_earned_points": 5,
    "loyalty_redeemed_points": 0,
    "share_token": "b09fdaf079c0d7c2e6b2313d",
    "paise": true
   },
   {
    "id": "35c17d7a-3f17-4afb-8f70-9f4692e7adef",
    "invoice_number": "INV-2610-0003",
    "shop_name": "Demo Kirana Store",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "status": "ACTIVE",
    "created_at": "2026-10-05T17:44:28.688128+00:00",
    "total_paise": 35000,
    "payment_mode": "upi",
    "payment_status": "paid",
    "loyalty_earned_points": 3,
    "loyalty_redeemed_points": 0,
    "share_token": "9a8c748de3bc2289e7280c86",
    "paise": true
   }
  ],
  "totals": {
   "dhanlabh_points": 8,
   "credit_paise": 52000
  }
 },
 "/customer/nafa-summary": {
  "known_spending": {
   "total_paise": 87000,
   "bills_count": 2,
   "by_shop": [
    {
     "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
     "shop_name": "Demo Kirana Store",
     "paise": 87000
    }
   ],
   "by_category": [
    {
     "category": "grocery",
     "paise": 84000
    },
    {
     "category": "snacks",
     "paise": 4000
    }
   ],
   "source": "nafamitra_recorded",
   "partial": true
  },
  "prev_month_paise": 0,
  "delta_pct": null,
  "discount_paise": 1000,
  "loyalty_value_paise": 80,
  "dhanlabh_earned_points": 8,
  "bills_count": 2,
  "stores": {
   "my_count": 6,
   "connected_count": 0,
   "linked_count": 1,
   "target": 5
  },
  "goals": [
   {
    "id": "d8ba1e8c-ad03-4efe-ab20-8230bf885d04",
    "name": "New Phone",
    "emoji": null,
    "target_paise": 15000000,
    "progress_paise": 4500000,
    "monthly_target_paise": null,
    "created_at": "2026-10-05T17:44:28.779617+00:00",
    "updated_at": "2026-10-05T17:44:28.779630+00:00",
    "deleted_at": null,
    "percent": 30.0
   }
  ],
  "saving_target_paise": 300000,
  "saving_progress_paise": 1080,
  "expenses": {
   "total_paise": 6000,
   "by_category": [
    {
     "category": "other",
     "paise": 6000
    }
   ],
   "source": "customer_added"
  },
  "insight": {
   "key": "first_period"
  },
  "entitlements": [
   {
    "id": "1ab5f8ef-5bc0-4505-945a-b44449d84258",
    "code": "premium_stores5_30d",
    "feature": "premium",
    "source": "5_stores_added",
    "starts_at": "2026-10-05T17:44:28.800765+00:00",
    "expires_at": "2026-11-04T17:44:28.800765+00:00"
   }
  ]
 },
 "/customer/bills?limit=50": {
  "bills": [
   {
    "id": "24ce1092-76f4-45ec-a1f9-e42c74a0a000",
    "invoice_number": "INV-2610-0004",
    "shop_name": "Demo Kirana Store",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "status": "ACTIVE",
    "created_at": "2026-10-05T17:44:28.692937+00:00",
    "total_paise": 52000,
    "payment_mode": "credit",
    "payment_status": "credit",
    "loyalty_earned_points": 5,
    "loyalty_redeemed_points": 0,
    "share_token": "b09fdaf079c0d7c2e6b2313d",
    "paise": true
   },
   {
    "id": "35c17d7a-3f17-4afb-8f70-9f4692e7adef",
    "invoice_number": "INV-2610-0003",
    "shop_name": "Demo Kirana Store",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "status": "ACTIVE",
    "created_at": "2026-10-05T17:44:28.688128+00:00",
    "total_paise": 35000,
    "payment_mode": "upi",
    "payment_status": "paid",
    "loyalty_earned_points": 3,
    "loyalty_redeemed_points": 0,
    "share_token": "9a8c748de3bc2289e7280c86",
    "paise": true
   }
  ]
 },
 "/customer/loyalty": {
  "accounts": [
   {
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "shop_name": "Demo Kirana Store",
    "points": 8,
    "redemption_value_paise": 10,
    "estimated_value_paise": 80,
    "transactions": [
     {
      "id": "9bb743ee-3b33-4150-adc4-72c293aba18a",
      "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
      "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
      "type": "EARN",
      "points": 5,
      "delta": 5,
      "balance_after": 8,
      "invoice_id": "24ce1092-76f4-45ec-a1f9-e42c74a0a000",
      "actor_id": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
      "note": "Bill INV-2610-0004",
      "created_at": "2026-10-05T17:44:28.693954+00:00"
     },
     {
      "id": "0ca16ca4-ac2a-4b71-839e-30bd8565ec51",
      "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
      "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
      "type": "EARN",
      "points": 3,
      "delta": 3,
      "balance_after": 3,
      "invoice_id": "35c17d7a-3f17-4afb-8f70-9f4692e7adef",
      "actor_id": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
      "note": "Bill INV-2610-0003",
      "created_at": "2026-10-05T17:44:28.689092+00:00"
     }
    ]
   }
  ]
 },
 "/customer/credit": {
  "accounts": [
   {
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "shop_name": "Demo Kirana Store",
    "outstanding_paise": 52000,
    "transactions": [
     {
      "id": "33207991-4429-417d-9e3e-22bc5f2d62af",
      "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
      "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
      "type": "CREDIT",
      "amount_paise": 52000,
      "delta_paise": 52000,
      "balance_after_paise": 52000,
      "invoice_id": "24ce1092-76f4-45ec-a1f9-e42c74a0a000",
      "actor_id": "f25fa384-ff2f-4efb-8138-562ff52d7fd0",
      "payment_mode": null,
      "note": "Bill INV-2610-0004",
      "created_at": "2026-10-05T17:44:28.693755+00:00"
     }
    ]
   }
  ]
 },
 "/customer/goals": {
  "goals": [
   {
    "id": "d8ba1e8c-ad03-4efe-ab20-8230bf885d04",
    "name": "New Phone",
    "emoji": null,
    "target_paise": 15000000,
    "progress_paise": 4500000,
    "monthly_target_paise": null,
    "created_at": "2026-10-05T17:44:28.779617+00:00",
    "updated_at": "2026-10-05T17:44:28.779630+00:00",
    "deleted_at": null,
    "percent": 30.0
   }
  ]
 },
 "/customer/expenses": {
  "expenses": [
   {
    "id": "b43b2ced-bd70-4d26-b4fb-fd2072bacf0a",
    "title": "Auto-rickshaw",
    "amount_paise": 6000,
    "category": "other",
    "date": "2026-10-05",
    "currency": "INR",
    "source": "customer_added",
    "verification": "customer_entered",
    "created_at": "2026-10-05T17:44:28.785300+00:00",
    "deleted_at": null
   }
  ],
  "total_paise": 6000,
  "source": "customer_added"
 },
 "/customer/settings": {
  "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
  "saving_target_paise": 300000,
  "updated_at": "2026-10-05T17:44:28.782318+00:00",
  "created_at": "2026-10-05T17:44:28.782329+00:00",
  "budgets": []
 },
 "/mystores": {
  "stores": [
   {
    "id": "bb22fd4a-3b65-450a-9a4c-cdd202ea734c",
    "name": "Fresh Basket",
    "phone": null,
    "phone_normalized": null,
    "category": "kirana",
    "purchase_amount_paise": 0,
    "purchase_date": null,
    "notes": null,
    "matched_shop_id": null,
    "source": "customer_added",
    "created_at": "2026-10-05T17:44:28.803385+00:00",
    "deleted_at": null
   },
   {
    "id": "5b0cd2b1-52f3-4e2a-9422-5dff77c0ecbe",
    "name": "Super Value",
    "phone": null,
    "phone_normalized": null,
    "category": "kirana",
    "purchase_amount_paise": 0,
    "purchase_date": null,
    "notes": null,
    "matched_shop_id": null,
    "source": "customer_added",
    "created_at": "2026-10-05T17:44:28.800558+00:00",
    "deleted_at": null
   },
   {
    "id": "cf6122ea-ab83-43d9-a26c-fca53b68d17b",
    "name": "Corner Store",
    "phone": null,
    "phone_normalized": null,
    "category": "kirana",
    "purchase_amount_paise": 0,
    "purchase_date": null,
    "notes": null,
    "matched_shop_id": null,
    "source": "customer_added",
    "created_at": "2026-10-05T17:44:28.797542+00:00",
    "deleted_at": null
   },
   {
    "id": "40f8f58b-53f9-4271-b55d-e404ac7be910",
    "name": "Daily Bazaar",
    "phone": null,
    "phone_normalized": null,
    "category": "kirana",
    "purchase_amount_paise": 0,
    "purchase_date": null,
    "notes": null,
    "matched_shop_id": null,
    "source": "customer_added",
    "created_at": "2026-10-05T17:44:28.795075+00:00",
    "deleted_at": null
   },
   {
    "id": "224d5c06-83a2-4feb-a742-3aabb483b9d8",
    "name": "Green Mart",
    "phone": null,
    "phone_normalized": null,
    "category": "kirana",
    "purchase_amount_paise": 0,
    "purchase_date": null,
    "notes": null,
    "matched_shop_id": null,
    "source": "customer_added",
    "created_at": "2026-10-05T17:44:28.792161+00:00",
    "deleted_at": null
   },
   {
    "id": "76c59fb2-1b16-4096-99b1-e89b616973bc",
    "name": "Demo Kirana Store",
    "phone": null,
    "phone_normalized": null,
    "category": "kirana",
    "purchase_amount_paise": 0,
    "purchase_date": null,
    "notes": null,
    "matched_shop_id": null,
    "source": "customer_added",
    "created_at": "2026-10-05T17:44:28.788685+00:00",
    "deleted_at": null,
    "suggested_shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "suggested_shop_name": "Demo Kirana Store",
    "match_reason": "linked_shop"
   }
  ],
  "activation": {
   "count": 6,
   "target": 5,
   "qualified": true,
   "claimed": true,
   "granted_now": false,
   "entitlements": [
    {
     "id": "1ab5f8ef-5bc0-4505-945a-b44449d84258",
     "code": "premium_stores5_30d",
     "feature": "premium",
     "source": "5_stores_added",
     "starts_at": "2026-10-05T17:44:28.800765+00:00",
     "expires_at": "2026-11-04T17:44:28.800765+00:00"
    }
   ]
  }
 },
 "/requirements": {
  "requirements": [
   {
    "id": "48d2c514-be3d-42a7-8868-ce6224baf7e7",
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "shop_id": null,
    "title": "Need birthday cake",
    "items": [],
    "budget_paise": null,
    "need_by": null,
    "category": "bakery",
    "notes": null,
    "status": "open",
    "source": "manual",
    "retailer_notes": null,
    "created_at": "2026-10-05T17:44:28.806744+00:00",
    "updated_at": "2026-10-05T17:44:28.806752+00:00"
   }
  ]
 },
 "/notifications": {
  "notifications": [
   {
    "id": "957675112bc2466581a4b1e0b7e6bcba",
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "category": "transaction",
    "title_key": "notif.billCreated",
    "title": null,
    "params": {
     "amount": "520",
     "invoice": "INV-2610-0004"
    },
    "read_at": null,
    "created_at": "2026-10-05T17:44:28.694360+00:00",
    "shop_name": "Demo Kirana Store"
   },
   {
    "id": "3e058166cbf1495a9c9b5f8189278b5a",
    "customer_id": "4e8ebddc-8321-4d1d-959e-91a4187c811f",
    "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
    "category": "transaction",
    "title_key": "notif.billCreated",
    "title": null,
    "params": {
     "amount": "350",
     "invoice": "INV-2610-0003"
    },
    "read_at": null,
    "created_at": "2026-10-05T17:44:28.689706+00:00",
    "shop_name": "Demo Kirana Store"
   }
  ],
  "unread": 2
 },
 "/favorites": {
  "favorites": []
 },
 "POST /customer/brain/chat": {
  "intent": "spending",
  "reply_key": "brain.tSpending",
  "data": {
   "total_paise": 87000,
   "bills_count": 2,
   "top_category": "grocery",
   "top_category_paise": 84000,
   "by_shop": [
    {
     "shop_id": "2f7648e2-473b-47a5-aaee-8685762ac51f",
     "shop_name": "Demo Kirana Store",
     "paise": 87000
    }
   ],
   "partial": true,
   "source": "nafamitra_recorded"
  },
  "partial": true,
  "actions": [
   {
    "key": "brain.aViewBills",
    "to": "/c/bills"
   }
  ]
 }
}
