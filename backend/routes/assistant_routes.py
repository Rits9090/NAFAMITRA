from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid, os, json
from database import db
from auth import require_business
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / '.env')
router = APIRouter()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

async def build_business_context(bid: str) -> str:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0).isoformat()

    sales_today = await db.sales.find({'business_id': bid, 'created_at': {'$gte': today_start}}, {'_id': 0, 'total_amount': 1, 'total_cost': 1}).to_list(500)
    sales_month = await db.sales.find({'business_id': bid, 'created_at': {'$gte': month_start}}, {'_id': 0, 'total_amount': 1, 'total_cost': 1}).to_list(2000)

    today_revenue = sum(s.get('total_amount', 0) for s in sales_today)
    today_profit = sum(s.get('total_amount', 0) - s.get('total_cost', 0) for s in sales_today)
    month_revenue = sum(s.get('total_amount', 0) for s in sales_month)
    month_profit = sum(s.get('total_amount', 0) - s.get('total_cost', 0) for s in sales_month)

    total_customers = await db.customers.count_documents({'business_id': bid, 'is_active': True})
    udhaars = await db.udhaar.find({'business_id': bid, 'outstanding': {'$gt': 0}}, {'_id': 0, 'outstanding': 1}).to_list(200)
    total_outstanding = sum(u.get('outstanding', 0) for u in udhaars)
    low_stock = await db.products.count_documents({'business_id': bid, 'is_active': True, '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}})

    top_products_pipeline = [
        {'$match': {'business_id': bid, 'created_at': {'$gte': month_start}}},
        {'$unwind': '$items'},
        {'$group': {'_id': '$items.product_name', 'revenue': {'$sum': '$items.total'}, 'qty': {'$sum': '$items.quantity'}}},
        {'$sort': {'revenue': -1}}, {'$limit': 5}
    ]
    top_products = await db.sales.aggregate(top_products_pipeline).to_list(5)

    return f"""
CURRENT BUSINESS DATA (as of {now.strftime('%d %b %Y, %I:%M %p IST')}):

Today's Performance:
- Revenue: ₹{today_revenue:.0f}
- Profit: ₹{today_profit:.0f}
- Orders: {len(sales_today)}

This Month:
- Revenue: ₹{month_revenue:.0f}
- Profit: ₹{month_profit:.0f}
- Orders: {len(sales_month)}

Business Overview:
- Total Active Customers: {total_customers}
- Total Outstanding Udhaar: ₹{total_outstanding:.0f}
- Low Stock Products: {low_stock}

Top Selling Products This Month:
{chr(10).join(f"- {p['_id']}: ₹{p['revenue']:.0f} ({p['qty']} units)" for p in top_products)}
"""

ASSISTANT_SYSTEM = """You are NafaMitra AI Business Advisor - a smart, friendly assistant for Indian shopkeepers.
You have access to real business data provided in the context.

Guidelines:
1. Answer in clear English, be concise and actionable
2. Always cite specific numbers from the data - never make up figures
3. Give practical business advice relevant to Indian retail
4. Use ₹ for currency
5. Be empathetic and encouraging
6. If data is not available for a query, say so honestly
7. Suggest actionable next steps when relevant"""

@router.post("/chat")
async def chat(req: ChatRequest, user: dict = Depends(require_business)):
    bid = user['business_id']
    key = os.getenv('EMERGENT_LLM_KEY')
    session_id = req.session_id or str(uuid.uuid4())

    business_context = await build_business_context(bid)
    full_system = ASSISTANT_SYSTEM + "\n\n" + business_context

    if not key or key == 'your-key-here':
        demo_responses = {
            'sales': f"Based on your business data: Today's sales are looking good! Your revenue and profit details are available in the dashboard.",
            'customer': "Your customer base is growing. Focus on retaining repeat customers for sustainable growth.",
            'stock': "Some products are running low on stock. Check the inventory page for details.",
            'profit': "Your profit margins look healthy. Consider optimizing high-selling, low-margin products.",
        }
        t = req.message.lower()
        for key_word, resp in demo_responses.items():
            if key_word in t:
                response_text = resp
                break
        else:
            response_text = "I'm your NafaMitra AI assistant! I can help you analyze sales, manage customers, track inventory, and grow your business. What would you like to know?"

        async def demo_stream():
            words = response_text.split()
            for i, word in enumerate(words):
                yield f"data: {word}{' ' if i < len(words)-1 else ''}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(demo_stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

        history = await db.chat_sessions.find({'business_id': bid, 'session_id': session_id}, {'_id': 0}).sort('created_at', 1).to_list(20)

        chat = LlmChat(api_key=key, session_id=session_id, system_message=full_system).with_model("gemini", "gemini-3-flash-preview")

        for msg in history[-10:]:
            if msg['role'] == 'user':
                await chat.send_message(UserMessage(text=msg['content']))

        now = datetime.now(timezone.utc).isoformat()
        await db.chat_sessions.insert_one({'id': str(uuid.uuid4()), 'business_id': bid, 'session_id': session_id, 'role': 'user', 'content': req.message, 'created_at': now})

        full_response = []

        async def generate():
            async for event in chat.stream_message(UserMessage(text=req.message)):
                if isinstance(event, TextDelta):
                    full_response.append(event.content)
                    yield f"data: {event.content}\n\n"
                elif isinstance(event, StreamDone):
                    response_text = ''.join(full_response)
                    await db.chat_sessions.insert_one({'id': str(uuid.uuid4()), 'business_id': bid, 'session_id': session_id, 'role': 'assistant', 'content': response_text, 'created_at': datetime.now(timezone.utc).isoformat()})
                    yield "data: [DONE]\n\n"
                    break

        return StreamingResponse(generate(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})

    except Exception as e:
        error_msg = f"AI assistant is temporarily unavailable. Error: {str(e)[:100]}"
        async def error_stream():
            yield f"data: {error_msg}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})

@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    messages = await db.chat_sessions.find({'business_id': bid, 'session_id': session_id}, {'_id': 0}).sort('created_at', 1).to_list(100)
    return messages

@router.delete("/sessions/{session_id}")
async def clear_session(session_id: str, user: dict = Depends(require_business)):
    bid = user['business_id']
    await db.chat_sessions.delete_many({'business_id': bid, 'session_id': session_id})
    return {'success': True}
