"""Personal Nafa Brain — customer-facing intelligence over controlled tools.
Architecture (spec §29):
    message → intent detection → whitelisted deterministic tool → structured
    result → localized explanation (frontend t() renders reply_key + params).

Rules:
  * The backend decides WHICH customer (profiles come from the token only —
    the model/message can never supply arbitrary customer IDs).
  * Every money answer carries a data-provenance flag; partial data MUST be
    disclosed (reply_key `brain.disclaimer*` when `partial` is true).
  * No LLM is required: answers are deterministic and never invent numbers.
    When an AI key exists the same structured result can be narrated later —
    the tool layer never changes.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import require_portal
from database import db
from errors import AppError
from routes.customer_portal_routes import _resolve_profile_ids, _shop_name

router = APIRouter()

# intent → tool. Keywords cover mr / en / hi (voice samples feed these too).
INTENTS = [
    ('spending', ['खर्च', 'kharch', 'spend', 'spending', 'expense',
                  'expenses', 'किती झाला', 'चालू महिना']),
    ('goals', ['goal', 'goals', 'ध्येय', 'लक्ष्य', 'target', 'पुढे',
               'progress', 'bike', 'सेव्हिंग']),
    ('saving', ['बचत', 'saving', 'savings', 'saved', 'सवलत', 'discount',
                'छूट', 'benefit', 'benefits', 'नफा', 'save']),
    ('loyalty', ['धनलाभ', 'धनलाभ', 'point', 'points', 'पॉइंट', 'पॉईंट',
                 'balance', 'किती पॉइंट']),
    ('stores', ['दुकान', 'store', 'stores', 'shops', 'my stores',
                'स्टोअर', 'माझ्या दुकान', 'partner']),
    ('bills', ['बिल', 'bill', 'bills', 'invoice', 'purchase history',
               'खरेदी', 'purchases']),
    ('reorder', ['पुन्हा', 'reorder', 'repeat', 'again', 'गरज',
                 'requirement', 'requirements', 'शेवटचा']),
    ('help', ['काय', 'help', 'मदत', 'what can', 'साहाय्य', 'how']),
]


def detect_intent(message: str) -> str:
    m = (message or '').lower()
    for intent, keys in INTENTS:
        if any(k in m for k in keys):
            return intent
    return 'help'


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)


async def _tool_spending(ids: list[str]) -> dict:
    # lightweight month slice (nafa_summary needs request context)
    from routes.customer_finance_routes import (_month_bounds,
                                                _spend_breakdown)
    cur_start, cur_end = _month_bounds()
    cur = await db.invoices.find(
        {'customer_id': {'$in': ids}, 'status': 'ACTIVE',
         'created_at': {'$gte': cur_start, '$lt': cur_end}},
        {'_id': 0, 'shop_id': 1, 'total_paise': 1, 'items': 1}).to_list(500)
    total = sum(int(i.get('total_paise') or 0) for i in cur)
    breakdown = await _spend_breakdown(cur)
    top = breakdown['by_category'][0] if breakdown['by_category'] else None
    return {
        'total_paise': total,
        'bills_count': len(cur),
        'top_category': top['category'] if top else None,
        'top_category_paise': top['paise'] if top else 0,
        'by_shop': breakdown['by_shop'][:5],
        'partial': True,
        'source': 'nafamitra_recorded',
    }


async def _tool_saving(ids: list[str]) -> dict:
    from routes.customer_finance_routes import (_month_bounds, _spend_breakdown)
    cur_start, cur_end = _month_bounds()
    cur = await db.invoices.find(
        {'customer_id': {'$in': ids}, 'status': 'ACTIVE',
         'created_at': {'$gte': cur_start, '$lt': cur_end}},
        {'_id': 0, 'total_paise': 1, 'discount_paise': 1,
         'loyalty_earned_points': 1, 'shop_id': 1}).to_list(500)
    discount = sum(int(i.get('discount_paise') or 0) for i in cur)
    points = sum(int(i.get('loyalty_earned_points') or 0) for i in cur)
    value = 0
    for sid in {i.get('shop_id') for i in cur if i.get('shop_id')}:
        shop = await db.businesses.find_one({'id': sid},
                                            {'_id': 0, 'settings': 1}) or {}
        val = int((shop.get('settings') or {}).get('redemption_value_paise')
                  or 10)
        pts = sum(int(i.get('loyalty_earned_points') or 0)
                  for i in cur if i.get('shop_id') == sid)
        value += pts * val
    settings = await db.customer_settings.find_one(
        {'customer_id': ids[0]}, {'_id': 0}) or {}
    return {
        'discount_paise': discount,
        'loyalty_value_paise': value,
        'dhanlabh_earned_points': points,
        'total_recorded_paise': discount + value,
        'saving_target_paise': int(settings.get('saving_target_paise') or 0),
        'partial': True,
        'source': 'nafamitra_recorded',
    }


async def _tool_goals(ids: list[str]) -> dict:
    rows = await db.customer_goals.find(
        {'customer_id': {'$in': ids}, 'deleted_at': None},
        {'_id': 0}).to_list(50)
    goals = []
    for g in rows:
        target = max(int(g.get('target_paise') or 0), 1)
        progress = int(g.get('progress_paise') or 0)
        goals.append({
            'name': g.get('name'), 'emoji': g.get('emoji'),
            'target_paise': target, 'progress_paise': progress,
            'percent': round(min(progress, target * 10) / target * 100, 1),
            'monthly_target_paise': g.get('monthly_target_paise'),
        })
    return {'goals': goals, 'count': len(goals), 'partial': False,
            'source': 'customer_entered'}


async def _tool_loyalty(ids: list[str]) -> dict:
    rows = await db.loyalty_accounts.find(
        {'customer_id': {'$in': ids}}, {'_id': 0, 'shop_id': 1,
                                        'balance': 1}).to_list(100)
    out = []
    for r in rows:
        if int(r.get('balance') or 0) <= 0:
            continue
        shop = await db.businesses.find_one({'id': r['shop_id']},
                                            {'_id': 0, 'settings': 1,
                                             'name': 1}) or {}
        val = int((shop.get('settings') or {}).get('redemption_value_paise')
                  or 10)
    out.append({'shop_name': shop.get('name'),
                'points': int(r.get('balance') or 0),
                'value_paise': int(r.get('balance') or 0) * val})
    return {'accounts': out, 'count': len(out), 'partial': False,
            'source': 'verified'}


async def _tool_stores(ids: list[str]) -> dict:
    my = await db.my_stores.find(
        {'customer_id': {'$in': ids}, 'deleted_at': None},
        {'_id': 0, 'name': 1, 'matched_shop_id': 1}).to_list(200)
    linked = await db.shop_customers.find(
        {'customer_id': {'$in': ids}, 'status': 'active'},
        {'_id': 0, 'shop_id': 1}).to_list(200)
    names = []
    for l in linked:
        names.append({'shop_name': await _shop_name(l['shop_id']),
                      'shop_id': l['shop_id'], 'state': 'connected'})
    for s in my:
        if not s.get('matched_shop_id'):
            names.append({'shop_name': s.get('name'), 'state': 'added'})
    return {'stores': names[:10], 'my_count': len(my),
            'connected_count': sum(1 for s in my if s.get('matched_shop_id')),
            'partial': False, 'source': 'mixed'}


async def _tool_bills(ids: list[str]) -> dict:
    rows = await db.invoices.find(
        {'customer_id': {'$in': ids}, 'status': 'ACTIVE'},
        {'_id': 0, 'id': 1, 'shop_id': 1, 'total_paise': 1,
         'created_at': 1, 'invoice_number': 1,
         'loyalty_earned_points': 1}).sort('created_at', -1).to_list(5)
    bills = []
    for b in rows:
        bills.append({'id': b.get('id'), 'invoice_number': b.get('invoice_number'),
                      'shop_name': await _shop_name(b.get('shop_id')),
                      'total_paise': int(b.get('total_paise') or 0),
                      'created_at': b.get('created_at'),
                      'loyalty_earned_points': b.get('loyalty_earned_points') or 0})
    return {'bills': bills, 'count': len(bills), 'partial': True,
            'source': 'verified'}


async def _tool_requirements(ids: list[str]) -> dict:
    rows = await db.requirements.find(
        {'customer_id': {'$in': ids}},
        {'_id': 0, 'title': 1, 'status': 1, 'created_at': 1,
         'shop_id': 1}).sort('created_at', -1).to_list(10)
    return {'requirements': rows, 'count': len(rows), 'partial': False,
            'source': 'customer_entered'}


async def _tool_benefits(ids: list[str]) -> dict:
    from routes.customer_finance_routes import _month_bounds
    cur_start, cur_end = _month_bounds()
    cur = await db.invoices.find(
        {'customer_id': {'$in': ids}, 'status': 'ACTIVE',
         'created_at': {'$gte': cur_start, '$lt': cur_end}},
        {'_id': 0, 'loyalty_earned_points': 1, 'discount_paise': 1,
         'loyalty_redeemed_points': 1}).to_list(500)
    return {
        'earned_points': sum(int(i.get('loyalty_earned_points') or 0)
                             for i in cur),
        'redeemed_points': sum(int(i.get('loyalty_redeemed_points') or 0)
                               for i in cur),
        'discount_paise': sum(int(i.get('discount_paise') or 0)
                              for i in cur),
        'partial': True, 'source': 'verified',
    }


TOOLS = {
    'spending': ('brain.tSpending', _tool_spending),
    'saving': ('brain.tSaving', _tool_saving),
    'goals': ('brain.tGoals', _tool_goals),
    'loyalty': ('brain.tLoyalty', _tool_loyalty),
    'stores': ('brain.tStores', _tool_stores),
    'bills': ('brain.tBills', _tool_bills),
    'reorder': ('brain.tReorder', _tool_requirements),
    'help': ('brain.tHelp', None),
}


@router.post('/chat')
async def brain_chat(req: ChatIn, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise AppError('Create your customer profile first to ask NafaMitra.',
                       400, 'no_profile',
                       'नफा विचारण्यासाठी आधी ग्राहक प्रोफाइल तयार करा.')
    intent = detect_intent(req.message)
    reply_key, tool = TOOLS[intent]
    data = await tool(ids) if tool else {'capabilities': list(TOOLS.keys())}
    return {
        'intent': intent,
        'reply_key': reply_key,
        'data': data,
        'partial': bool(data.get('partial')),
        'actions': _actions_for(intent, data),
    }


def _actions_for(intent: str, data: dict) -> list[dict]:
    """Suggested next steps — navigate-only, never auto-execute (§77)."""
    acts = []
    if intent == 'spending' and data.get('bills_count'):
        acts.append({'key': 'brain.aViewBills', 'to': '/c/bills'})
    if intent == 'reorder' and data.get('bills') is None:
        pass
    if intent == 'goals' and data.get('count') == 0:
        acts.append({'key': 'brain.aAddGoal', 'to': '/c/nafa'})
    if intent == 'reorder':
        acts.append({'key': 'brain.aAddReq', 'to': '/c/search'})
        acts.append({'key': 'brain.aViewBills', 'to': '/c/bills'})
    if intent == 'stores':
        acts.append({'key': 'brain.aMyStores', 'to': '/c/stores'})
    if intent == 'loyalty':
        acts.append({'key': 'brain.aMyNafa', 'to': '/c/nafa'})
    if intent == 'help':
        acts.append({'key': 'brain.aMyNafa', 'to': '/c/nafa'})
        acts.append({'key': 'brain.aAddReq', 'to': '/c/search'})
    if intent == 'saving':
        acts.append({'key': 'brain.aMyNafa', 'to': '/c/nafa'})
    if intent == 'bills' and data.get('bills'):
        acts.append({'key': 'brain.aViewBill', 'to': f"/c/bills/{data['bills'][0]['id']}"})
    return acts[:3]
