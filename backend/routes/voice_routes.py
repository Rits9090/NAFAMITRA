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
        # Honest fallback: never fabricate a transcription the user did not speak.
        return {
            'transcription': '',
            'language': '',
            'demo_mode': True,
            'notice': 'Speech-to-text is not configured on this server yet. Type your command instead.'
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
            'transcription': '',
            'language': '',
            'demo_mode': True,
            'notice': 'Speech-to-text failed. Type your command instead.',
            'error': str(e)[:200]
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
        # Deterministic keyword fallback (no AI configured). READ-only intents are
        # safe to classify locally because execute reads real data; WRITE intents
        # are never fabricated — we require clarification instead of inventing
        # customer names or amounts.
        t = req.transcription.lower()
        ai_note = ('Voice AI is not configured on this server, so I can only '
                   'understand simple read-only questions. For bills or payments, '
                   'use the Billing screen.')
        if 'bill' in t or 'invoice' in t or 'बिल' in t:
            intent_data = {"intent": "CREATE_SALE", "confidence": 0.5,
                           "response_message": ai_note,
                           "requires_clarification": True,
                           "clarification_question": "Voice AI for bill creation is not configured. Open Billing to create this bill."}
        elif 'payment' in t or 'jama' in t or 'जमा' in t or 'भरपाई' in t or 'येवणी' in t:
            intent_data = {"intent": "RECORD_PAYMENT", "confidence": 0.5,
                           "response_message": ai_note,
                           "requires_clarification": True,
                           "clarification_question": "Voice AI for payments is not configured. Record the payment from the Credit screen."}
        elif 'sales' in t or 'bikri' in t or 'sale' in t or 'विक्री' in t:
            intent_data = {"intent": "CHECK_SALES", "confidence": 0.7,
                           "response_message": "Checking today's recorded sales…",
                           "requires_clarification": False}
        elif 'stock' in t or 'inventory' in t or 'स्टॉक' in t:
            intent_data = {"intent": "CHECK_STOCK", "confidence": 0.7,
                           "response_message": "Checking low stock…",
                           "requires_clarification": False}
        elif 'margin' in t or 'profit' in t or 'munafa' in t or 'नफा' in t or 'तोटा' in t:
            intent_data = {"intent": "CHECK_PROFIT", "confidence": 0.7,
                           "response_message": "Checking today's estimated gross margin…",
                           "requires_clarification": False}
        elif 'udhaar' in t or 'outstanding' in t or 'due' in t or 'मागडी' in t:
            intent_data = {"intent": "CHECK_OUTSTANDING", "confidence": 0.7,
                           "response_message": "Checking outstanding credit…",
                           "requires_clarification": False}
        else:
            intent_data = {"intent": "GENERAL_QUERY", "confidence": 0.4,
                           "response_message": ai_note,
                           "requires_clarification": True,
                           "clarification_question": "I could not understand that without the voice AI service."}

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
    result = {'success': True, 'intent': intent, 'message': ''}

    if intent == 'CHECK_SALES':
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0).isoformat()
        invoices = await db.invoices.find(
            {'shop_id': bid, 'status': 'ACTIVE', 'created_at': {'$gte': today_start}},
            {'_id': 0, 'total_paise': 1}).to_list(500)
        legacy = await db.sales.find(
            {'business_id': bid, 'created_at': {'$gte': today_start}},
            {'_id': 0, 'total_amount': 1}).to_list(500)
        total_paise = sum(i.get('total_paise', 0) for i in invoices)
        total_paise += sum(int(s.get('total_amount', 0) or 0) * 100 for s in legacy)
        bills = len(invoices) + len(legacy)
        result['data'] = {'total_paise': total_paise, 'bill_count': bills,
                          'date': now.strftime('%d %b %Y')}
        result['message'] = f"Today's recorded sales: ₹{total_paise // 100} from {bills} bills"

    elif intent == 'CHECK_PROFIT':
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0).isoformat()
        invoices = await db.invoices.find(
            {'shop_id': bid, 'status': 'ACTIVE', 'created_at': {'$gte': today_start}},
            {'_id': 0, 'total_paise': 1, 'cost_paise': 1}).to_list(500)
        legacy = await db.sales.find(
            {'business_id': bid, 'created_at': {'$gte': today_start}},
            {'_id': 0, 'total_amount': 1, 'total_cost': 1}).to_list(500)
        margin_paise = sum(i.get('total_paise', 0) - i.get('cost_paise', 0) for i in invoices)
        margin_paise += sum(int(s.get('total_amount', 0) or 0) * 100
                            - int(s.get('total_cost', 0) or 0) * 100 for s in legacy)
        result['data'] = {'estimated_gross_margin_paise': margin_paise}
        result['message'] = (f"Today's estimated gross margin: ₹{margin_paise // 100} "
                             f"(recorded sales minus estimated cost)")

    elif intent == 'CHECK_OUTSTANDING':
        accounts = await db.credit_accounts.find(
            {'shop_id': bid, 'outstanding_paise': {'$gt': 0}},
            {'_id': 0, 'outstanding_paise': 1}).to_list(200)
        total_paise = sum(a.get('outstanding_paise', 0) for a in accounts)
        result['data'] = {'total_outstanding_paise': total_paise,
                          'customer_count': len(accounts)}
        result['message'] = f"Total outstanding: ₹{total_paise // 100} from {len(accounts)} customers"

    elif intent == 'CHECK_STOCK':
        low_stock = await db.products.find(
            {'business_id': bid, 'is_active': True,
             '$expr': {'$lte': ['$stock_quantity', '$low_stock_threshold']}},
            {'_id': 0, 'name': 1, 'stock_quantity': 1}).to_list(20)
        result['data'] = {'low_stock_products': low_stock, 'count': len(low_stock)}
        result['message'] = f"{len(low_stock)} products are low on stock"

    else:
        # Never claim success for an action we did not perform.
        result = {'success': False, 'intent': intent,
                  'message': 'Nothing was executed: this action needs the voice AI '
                             'service (not configured) or is not a supported '
                             'read-only query. Use the app screens instead.'}

    if req.session_id:
        await db.voice_commands.update_one({'business_id': bid, 'entities.session_id': req.session_id}, {'$set': {'execution_status': 'executed'}})

    return result

@router.get("/history")
async def get_voice_history(user: dict = Depends(require_business)):
    bid = user['business_id']
    commands = await db.voice_commands.find({'business_id': bid}, {'_id': 0}).sort('created_at', -1).to_list(20)
    return commands
