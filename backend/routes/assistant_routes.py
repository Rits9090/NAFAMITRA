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
    """Real-data context from CURRENT collections (invoices/shop_id + legacy
    sales compatibility). Every number is recorded data — the model must
    never invent figures on top of this."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0).isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0).isoformat()

    inv_proj = {'_id': 0, 'total_paise': 1, 'cost_paise': 1}
    inv_today = await db.invoices.find(
        {'shop_id': bid, 'status': 'ACTIVE', 'created_at': {'$gte': today_start}}, inv_proj).to_list(2000)
    inv_month = await db.invoices.find(
        {'shop_id': bid, 'status': 'ACTIVE', 'created_at': {'$gte': month_start}}, inv_proj).to_list(5000)
    legacy_today = await db.sales.find(
        {'business_id': bid, 'created_at': {'$gte': today_start}},
        {'_id': 0, 'total_amount': 1, 'total_cost': 1}).to_list(1000)
    legacy_month = await db.sales.find(
        {'business_id': bid, 'created_at': {'$gte': month_start}},
        {'_id': 0, 'total_amount': 1, 'total_cost': 1}).to_list(3000)

    def _paise(invs, leg):
        rev = sum(i.get('total_paise', 0) for i in invs)
        rev += sum(int(s.get('total_amount', 0) or 0) * 100 for s in leg)
        margin = sum(i.get('total_paise', 0) - i.get('cost_paise', 0) for i in invs)
        margin += sum((int(s.get('total_amount', 0) or 0) - int(s.get('total_cost', 0) or 0)) * 100 for s in leg)
        return rev, margin

    today_rev, today_margin = _paise(inv_today, legacy_today)
    month_rev, month_margin = _paise(inv_month, legacy_month)
    today_bills = len(inv_today) + len(legacy_today)
    month_bills = len(inv_month) + len(legacy_month)

    total_customers = await db.shop_customers.count_documents({'shop_id': bid, 'status': 'active'})
    credits = await db.credit_accounts.find(
        {'shop_id': bid, 'outstanding_paise': {'$gt': 0}}, {'_id': 0, 'outstanding_paise': 1}).to_list(200)
    total_outstanding = sum(c.get('outstanding_paise', 0) for c in credits)
    low_stock = await db.products.count_documents(
        {'business_id': bid, 'is_active': True,
         '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}})

    top_products = await db.invoices.aggregate([
        {'$match': {'shop_id': bid, 'status': 'ACTIVE', 'created_at': {'$gte': month_start}}},
        {'$unwind': '$items'},
        {'$group': {'_id': '$items.name', 'revenue': {'$sum': '$items.total_paise'},
                    'qty': {'$sum': '$items.quantity'}}},
        {'$sort': {'revenue': -1}}, {'$limit': 5}
    ]).to_list(5)

    top_lines = chr(10).join(
        f"- {p['_id']}: ₹{p['revenue'] // 100} ({p['qty']} units)" for p in top_products
    ) or "- (no itemized sales recorded this month)"

    return f"""
CURRENT BUSINESS DATA (as of {now.strftime('%d %b %Y, %I:%M %p IST')} — recorded figures only):

Today's Performance:
- Recorded sales: ₹{today_rev // 100}
- Estimated gross margin (sales minus estimated cost): ₹{today_margin // 100}
- Bills: {today_bills}

This Month:
- Recorded sales: ₹{month_rev // 100}
- Estimated gross margin: ₹{month_margin // 100}
- Bills: {month_bills}

Business Overview:
- Active customer links: {total_customers}
- Outstanding credit (udhaar): ₹{total_outstanding // 100}
- Low stock products: {low_stock}

Top Selling Products This Month:
{top_lines}
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
7. Suggest actionable next steps when relevant
8. Say "estimated gross margin" (recorded sales minus estimated cost) — never an unqualified "profit"
9. Never claim to have sent a message, created a record, or performed an action you did not"""

@router.post("/chat")
async def chat(req: ChatRequest, user: dict = Depends(require_business)):
    bid = user['business_id']
    key = os.getenv('EMERGENT_LLM_KEY')
    session_id = req.session_id or str(uuid.uuid4())

    business_context = await build_business_context(bid)
    full_system = ASSISTANT_SYSTEM + "\n\n" + business_context

    if not key or key == 'your-key-here':
        # Honest fallback: no LLM configured → say so; never simulate analysis.
        response_text = ("AI assistant is not configured on this server yet "
                         "(missing AI service key), so I cannot analyse your data "
                         "right now. Your live numbers are always available on the "
                         "Dashboard and Reports screens. / AI सहाय्यक अद्याप "
                         "कॉन्फिगर केलेला नाही — डॅशबोर्डवरील आकडेवारी वापरा.")

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
