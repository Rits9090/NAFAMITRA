from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid, os, json, tempfile
from database import db
from auth import require_business
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / '.env')

router = APIRouter()

VOICE_SYSTEM_PROMPT = """You are NafaMitra AI, helping an Indian shopkeeper understand voice commands.
The shopkeeper may speak in Hindi, English, Hinglish, or Marathi.

Extract structured information and return ONLY a valid JSON object:
{
  "intent": "CREATE_SALE|ADD_UDHAAR|RECORD_PAYMENT|CHECK_SALES|CHECK_PROFIT|CHECK_OUTSTANDING|CHECK_STOCK|ADD_PRODUCT|ADD_CUSTOMER|SEARCH_CUSTOMER|CREATE_REMINDER|GENERAL_QUERY",
  "customer_name": "string or null",
  "customer_phone": "string or null",
  "amount": number or null,
  "product_name": "string or null",
  "quantity": number or null,
  "payment_mode": "cash|upi|card|udhaar|null",
  "payment_status": "paid|pending|partial|null",
  "time_reference": "string or null",
  "notes": "string or null",
  "confidence": 0.0 to 1.0,
  "response_message": "Brief friendly response in Hinglish confirming what was understood",
  "requires_clarification": true or false,
  "clarification_question": "string or null"
}

Examples:
- "Ramesh ka 500 rupaye ka bill banao" → intent: CREATE_SALE, customer_name: Ramesh, amount: 500
- "Dinesh ne 1000 cash jama kiye" → intent: RECORD_PAYMENT, customer_name: Dinesh, amount: 1000, payment_mode: cash
- "Aaj ki sales kitni hai" → intent: CHECK_SALES
- "Atta ka stock 50 packets add karo" → intent: ADD_PRODUCT, product_name: Atta, quantity: 50
- "Sunita ka naam add karo, number 9876543210" → intent: ADD_CUSTOMER, customer_name: Sunita, customer_phone: 9876543210
"""

class UnderstandRequest(BaseModel):
    transcription: str
    session_id: Optional[str] = None

class ExecuteRequest(BaseModel):
    intent: str
    entities: dict
    session_id: Optional[str] = None

@router.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...), user: dict = Depends(require_business)):
    key = os.getenv('EMERGENT_LLM_KEY')
    audio_bytes = await audio.read()

    if not key or key == 'your-key-here':
        return {
            'transcription': 'Ramesh ka 500 rupaye ka bill banao, UPI se payment hua hai.',
            'language': 'hi',
            'demo_mode': True
        }

    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        stt = OpenAISpeechToText(api_key=key)

        suffix = '.webm'
        if audio.content_type:
            if 'mp4' in audio.content_type: suffix = '.mp4'
            elif 'wav' in audio.content_type: suffix = '.wav'
            elif 'mp3' in audio.content_type: suffix = '.mp3'

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, 'rb') as f:
                response = await stt.transcribe(
                    file=f, model="whisper-1", response_format="json",
                    prompt="Indian shopkeeper speaking about business: bill, udhaar, payment, cash, UPI, customer names, product names in Hindi/English/Hinglish/Marathi"
                )
            return {'transcription': response.text, 'language': 'hi', 'demo_mode': False}
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        return {
            'transcription': 'Aaj ki total sales kitni hui?',
            'language': 'hi',
            'demo_mode': True,
            'error': str(e)
        }

@router.post("/understand")
async def understand_command(req: UnderstandRequest, user: dict = Depends(require_business)):
    bid = user['business_id']
    key = os.getenv('EMERGENT_LLM_KEY')

    session_id = req.session_id or str(uuid.uuid4())
    demo_mode = not key or key == 'your-key-here'
    intent_data = None

    if not demo_mode:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage, StreamDone
            chat = LlmChat(api_key=key, session_id=f"voice-{session_id}", system_message=VOICE_SYSTEM_PROMPT).with_model("gemini", "gemini-3-flash-preview")
            response = await chat.send_message(UserMessage(text=req.transcription))
            text = response.strip()
            if text.startswith('```json'): text = text[7:]
            if text.startswith('```'): text = text[3:]
            if text.endswith('```'): text = text[:-3]
            intent_data = json.loads(text.strip())
        except Exception as e:
            demo_mode = True

    if demo_mode or not intent_data:
        t = req.transcription.lower()
        if 'bill' in t or 'invoice' in t:
            intent_data = {"intent": "CREATE_SALE", "customer_name": "Ramesh", "amount": 500, "payment_mode": "upi", "confidence": 0.85, "response_message": "Bill banane ki request samajh aa gaya!", "requires_clarification": False, "clarification_question": None}
        elif 'sales' in t or 'bikri' in t or 'sale' in t:
            intent_data = {"intent": "CHECK_SALES", "confidence": 0.95, "response_message": "Aaj ki sales check kar raha hoon...", "requires_clarification": False}
        elif 'payment' in t or 'jama' in t:
            intent_data = {"intent": "RECORD_PAYMENT", "customer_name": "Dinesh", "amount": 1000, "payment_mode": "cash", "confidence": 0.88, "response_message": "Payment record karunga!", "requires_clarification": False}
        elif 'stock' in t or 'inventory' in t:
            intent_data = {"intent": "CHECK_STOCK", "confidence": 0.9, "response_message": "Stock check kar raha hoon...", "requires_clarification": False}
        elif 'profit' in t or 'munafa' in t:
            intent_data = {"intent": "CHECK_PROFIT", "confidence": 0.9, "response_message": "Aaj ka profit dekh raha hoon...", "requires_clarification": False}
        else:
            intent_data = {"intent": "GENERAL_QUERY", "confidence": 0.7, "response_message": "Aapka command samajh gaya, processing...", "requires_clarification": False}

    now = datetime.now(timezone.utc).isoformat()
    await db.voice_commands.insert_one({
        'id': str(uuid.uuid4()), 'business_id': bid, 'user_id': user['user_id'],
        'transcription': req.transcription, 'intent': intent_data.get('intent'),
        'entities': intent_data, 'confidence': intent_data.get('confidence', 0),
        'execution_status': 'pending', 'demo_mode': demo_mode, 'created_at': now
    })

    return {**intent_data, 'session_id': session_id, 'demo_mode': demo_mode}

@router.post("/execute")
async def execute_command(req: ExecuteRequest, user: dict = Depends(require_business)):
    bid = user['business_id']
    intent = req.intent
    entities = req.entities
    result = {'success': True, 'intent': intent, 'message': 'Command executed successfully'}

    if intent == 'CHECK_SALES':
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0).isoformat()
        sales = await db.sales.find({'business_id': bid, 'created_at': {'$gte': today_start}}, {'_id': 0}).to_list(500)
        total = sum(s.get('total_amount', 0) for s in sales)
        result['data'] = {'total_sales': total, 'order_count': len(sales), 'date': now.strftime('%d %b %Y')}
        result['message'] = f"Today's total sales: ₹{total:.0f} ({len(sales)} orders)"

    elif intent == 'CHECK_PROFIT':
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0).isoformat()
        sales = await db.sales.find({'business_id': bid, 'created_at': {'$gte': today_start}}, {'_id': 0}).to_list(500)
        profit = sum(s.get('total_amount', 0) - s.get('total_cost', 0) for s in sales)
        result['data'] = {'profit': profit}
        result['message'] = f"Today's profit: ₹{profit:.0f}"

    elif intent == 'CHECK_OUTSTANDING':
        udhaars = await db.udhaar.find({'business_id': bid, 'outstanding': {'$gt': 0}}, {'_id': 0}).to_list(100)
        total = sum(u.get('outstanding', 0) for u in udhaars)
        result['data'] = {'total_outstanding': total, 'customer_count': len(udhaars)}
        result['message'] = f"Total outstanding: ₹{total:.0f} from {len(udhaars)} customers"

    elif intent == 'CHECK_STOCK':
        low_stock = await db.products.find({'business_id': bid, 'is_active': True, '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}}, {'_id': 0, 'name': 1, 'stock_quantity': 1}).to_list(20)
        result['data'] = {'low_stock_products': low_stock, 'count': len(low_stock)}
        result['message'] = f"{len(low_stock)} products are low on stock"

    if req.session_id:
        await db.voice_commands.update_one({'business_id': bid, 'entities.session_id': req.session_id}, {'$set': {'execution_status': 'executed'}})

    return result

@router.get("/history")
async def get_voice_history(user: dict = Depends(require_business)):
    bid = user['business_id']
    commands = await db.voice_commands.find({'business_id': bid}, {'_id': 0}).sort('created_at', -1).to_list(20)
    return commands
