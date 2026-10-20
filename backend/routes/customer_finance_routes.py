"""Customer private finance: goals, saving target, budgets, customer-added
expenses, and the My Nafa server-side summary.

Rules of the domain (docs/nafamitra-customer-data-definitions.md):
  * All money is integer paise, computed server-side.
  * 'known spending' = ACTIVE invoices from shops the customer is linked to.
    It is NEVER presented as total monthly spending.
  * customer_added expenses are the customer's own records with their own
    source label — never merged into verified retailer totals without labels.
  * Soft delete (deleted_at) for goals/expenses — no hard deletes of
    financial records.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import require_portal
from database import db
from entitlements import active_entitlements
from errors import NotFound
from routes.customer_portal_routes import _resolve_profile_ids, _shop_name

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _month_bounds(now: datetime | None = None):
    now = now or datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        nxt = start.replace(year=start.year + 1, month=1)
    else:
        nxt = start.replace(month=start.month + 1)
    return start.isoformat(), nxt.isoformat()


def _prev_month_bounds(now: datetime | None = None):
    now = now or datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 1:
        prv = start.replace(year=start.year - 1, month=12)
    else:
        prv = start.replace(month=start.month - 1)
    # previous month span
    pstart = prv.replace(day=1)
    if pstart.month == 12:
        pnxt = pstart.replace(year=pstart.year + 1, month=1)
    else:
        pnxt = pstart.replace(month=pstart.month + 1)
    return pstart.isoformat(), pnxt.isoformat()


class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    emoji: str | None = Field(default=None, max_length=8)
    target_paise: int = Field(ge=1)
    progress_paise: int = Field(default=0, ge=0)
    monthly_target_paise: int | None = Field(default=None, ge=0)


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    emoji: str | None = Field(default=None, max_length=8)
    target_paise: int | None = Field(default=None, ge=1)
    progress_paise: int | None = Field(default=None, ge=0)
    monthly_target_paise: int | None = Field(default=None, ge=0)


class SavingTargetIn(BaseModel):
    target_paise: int = Field(ge=0)


class BudgetIn(BaseModel):
    category: str = Field(min_length=1, max_length=60)
    limit_paise: int = Field(ge=0)


class BudgetsIn(BaseModel):
    budgets: list[BudgetIn] = Field(default_factory=list, max_length=20)


class ExpenseIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    amount_paise: int = Field(gt=0, le=10_000_000_00)
    category: str | None = Field(default=None, max_length=60)
    date: str | None = Field(default=None, max_length=40)  # YYYY-MM-DD


def _goal_public(g: dict) -> dict:
    g = dict(g)
    g.pop('_id', None)
    g.pop('customer_id', None)
    target = max(int(g.get('target_paise') or 0), 1)
    progress = int(g.get('progress_paise') or 0)
    g['percent'] = round(min(progress, target * 10) / target * 100, 1)
    return g


# ------------------------------------------------------------------ goals
@router.get('/goals')
async def list_goals(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    rows = await db.customer_goals.find(
        {'customer_id': {'$in': ids}, 'deleted_at': None},
        {'_id': 0}).sort('created_at', -1).to_list(100)
    return {'goals': [_goal_public(r) for r in rows]}


@router.post('/goals')
async def create_goal(req: GoalIn, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    doc = {
        'id': str(uuid.uuid4()),
        'customer_id': ids[0],
        'name': req.name.strip(),
        'emoji': req.emoji,
        'target_paise': int(req.target_paise),
        'progress_paise': int(req.progress_paise),
        'monthly_target_paise': (int(req.monthly_target_paise)
                                 if req.monthly_target_paise is not None else None),
        'created_at': _now(),
        'updated_at': _now(),
        'deleted_at': None,
    }
    await db.customer_goals.insert_one(dict(doc))
    doc.pop('_id', None)
    return {'goal': _goal_public(doc)}


@router.put('/goals/{goal_id}')
async def update_goal(goal_id: str, req: GoalUpdate,
                      payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    sets = {k: v for k, v in req.model_dump(exclude_none=True).items()}
    if not sets:
        return {'goal': _goal_public(
            await db.customer_goals.find_one({'id': goal_id},
                                             {'_id': 0}) or {})}
    sets['updated_at'] = _now()
    res = await db.customer_goals.update_one(
        {'id': goal_id, 'customer_id': {'$in': ids}, 'deleted_at': None},
        {'$set': sets})
    if res.matched_count == 0:
        raise NotFound('Goal not found.', 'ध्येय सापडले नाही.')
    row = await db.customer_goals.find_one({'id': goal_id}, {'_id': 0})
    return {'goal': _goal_public(row)}


@router.delete('/goals/{goal_id}')
async def delete_goal(goal_id: str, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    res = await db.customer_goals.update_one(
        {'id': goal_id, 'customer_id': {'$in': ids}, 'deleted_at': None},
        {'$set': {'deleted_at': _now()}})
    if res.matched_count == 0:
        raise NotFound('Goal not found.', 'ध्येय सापडले नाही.')
    return {'removed': True, 'goal_id': goal_id}


# -------------------------------------------- saving target + budgets
async def _settings(customer_id: str) -> dict:
    row = await db.customer_settings.find_one(
        {'customer_id': customer_id}, {'_id': 0}) or {}
    row.setdefault('saving_target_paise', 0)
    row.setdefault('budgets', [])
    return row


@router.get('/settings')
async def get_settings(payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        return {'saving_target_paise': 0, 'budgets': []}
    return await _settings(ids[0])


@router.put('/saving-target')
async def set_saving_target(req: SavingTargetIn,
                            payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    await db.customer_settings.update_one(
        {'customer_id': ids[0]},
        {'$set': {'saving_target_paise': int(req.target_paise),
                  'updated_at': _now()},
         '$setOnInsert': {'created_at': _now(), 'customer_id': ids[0]}},
        upsert=True)
    return await _settings(ids[0])


@router.put('/budgets')
async def set_budgets(req: BudgetsIn, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    budgets = [{'category': b.category, 'limit_paise': int(b.limit_paise)}
               for b in req.budgets]
    await db.customer_settings.update_one(
        {'customer_id': ids[0]},
        {'$set': {'budgets': budgets, 'updated_at': _now()},
         '$setOnInsert': {'created_at': _now(), 'customer_id': ids[0]}},
        upsert=True)
    return await _settings(ids[0])


# -------------------------------------------------- customer-added expenses
@router.get('/expenses')
async def list_expenses(month: str | None = None,
                        payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    q: dict = {'customer_id': {'$in': ids}, 'deleted_at': None,
               'source': 'customer_added'}
    if month and len(month) == 7:
        q['date'] = {'$gte': f'{month}-01', '$lt': f'{month}-99'}
    rows = await db.customer_expenses.find(
        q, {'_id': 0}).sort('date', -1).to_list(200)
    for r in rows:
        r.pop('customer_id', None)
    total = sum(int(r.get('amount_paise') or 0) for r in rows)
    return {'expenses': rows, 'total_paise': total, 'source': 'customer_added'}


@router.post('/expenses')
async def add_expense(req: ExpenseIn, payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    if not ids:
        raise NotFound('No customer profile yet.', 'अद्याप ग्राहक प्रोफाइल नाही.')
    today = datetime.now(timezone.utc)
    date = (req.date or '').strip() or today.strftime('%Y-%m-%d')
    doc = {
        'id': str(uuid.uuid4()),
        'customer_id': ids[0],
        'title': req.title.strip(),
        'amount_paise': int(req.amount_paise),
        'category': (req.category or 'other').strip().lower(),
        'date': date,
        'currency': 'INR',
        'source': 'customer_added',
        'verification': 'customer_entered',
        'created_at': _now(),
        'deleted_at': None,
    }
    await db.customer_expenses.insert_one(dict(doc))
    doc.pop('_id', None)
    return {'expense': doc}


@router.delete('/expenses/{expense_id}')
async def delete_expense(expense_id: str,
                         payload: dict = Depends(require_portal)):
    ids = await _resolve_profile_ids(payload)
    res = await db.customer_expenses.update_one(
        {'id': expense_id, 'customer_id': {'$in': ids}, 'deleted_at': None},
        {'$set': {'deleted_at': _now()}})
    if res.matched_count == 0:
        raise NotFound('Expense not found.', 'खर्च सापडला नाही.')
    return {'removed': True, 'expense_id': expense_id}


# ----------------------------------------------------------- nafa summary
async def _invoices_in(ids: list[str], start: str, end: str) -> list[dict]:
    return await db.invoices.find(
        {'customer_id': {'$in': ids}, 'status': 'ACTIVE',
         'created_at': {'$gte': start, '$lt': end}},
        {'_id': 0, 'id': 1, 'shop_id': 1, 'created_at': 1, 'total_paise': 1,
         'discount_paise': 1, 'loyalty_earned_points': 1, 'items': 1,
         'invoice_number': 1, 'payment_status': 1, 'payment_mode': 1,
         'loyalty_redeemed_points': 1},
    ).to_list(500)


async def _category_map(product_ids: set) -> dict:
    if not product_ids:
        return {}
    rows = await db.products.find(
        {'id': {'$in': list(product_ids)}},
        {'_id': 0, 'id': 1, 'category': 1}).to_list(2000)
    return {r['id']: (r.get('category') or 'other') for r in rows}


async def _spend_breakdown(invoices: list[dict]) -> dict:
    by_shop: dict[str, int] = {}
    by_cat: dict[str, int] = {}
    pids = set()
    for inv in invoices:
        by_shop[inv.get('shop_id') or ''] = by_shop.get(
            inv.get('shop_id') or '', 0) + int(inv.get('total_paise') or 0)
        for it in inv.get('items') or []:
            if it.get('product_id'):
                pids.add(it['product_id'])
    cats = await _category_map(pids)
    for inv in invoices:
        for it in inv.get('items') or []:
            pid = it.get('product_id')
            if not pid:
                by_cat['other'] = by_cat.get('other', 0) + int(
                    it.get('total_paise') or 0)
                continue
            c = cats.get(pid) or 'other'
            by_cat[c] = by_cat.get(c, 0) + int(it.get('total_paise') or 0)
    shops = []
    for sid, paise in sorted(by_shop.items(), key=lambda kv: -kv[1]):
        shops.append({'shop_id': sid, 'shop_name': await _shop_name(sid),
                      'paise': paise})
    cats_out = [{'category': c, 'paise': p}
                for c, p in sorted(by_cat.items(), key=lambda kv: -kv[1])]
    return {'by_shop': shops, 'by_category': cats_out}


@router.get('/nafa-summary')
async def nafa_summary(payload: dict = Depends(require_portal)):
    """One aggregated call for My Nafa / Home — everything computed here."""
    ids = await _resolve_profile_ids(payload)
    empty = {
        'known_spending': {'total_paise': 0, 'bills_count': 0,
                           'by_shop': [], 'by_category': [],
                           'source': 'nafamitra_recorded', 'partial': True},
        'prev_month_paise': 0, 'delta_pct': None,
        'discount_paise': 0, 'dhanlabh_earned_points': 0,
        'bills_count': 0, 'stores': {'my_count': 0, 'connected_count': 0,
                                     'target': 5},
        'goals': [], 'saving_target_paise': 0, 'saving_progress_paise': 0,
        'expenses': {'total_paise': 0, 'by_category': []},
        'insight': {'key': 'no_data'},
        'entitlements': [],
    }
    if not ids:
        return empty

    cur_start, cur_end = _month_bounds()
    prv_start, prv_end = _prev_month_bounds()
    cur = await _invoices_in(ids, cur_start, cur_end)
    prv = await _invoices_in(ids, prv_start, prv_end)

    cur_total = sum(int(i.get('total_paise') or 0) for i in cur)
    prv_total = sum(int(i.get('total_paise') or 0) for i in prv)
    breakdown = await _spend_breakdown(cur)

    # this month's recorded benefits: discounts + धनलाभ earned (value per
    # shop rules applied by caller — here we keep points; value computed
    # from per-shop redemption rules below)
    discount = sum(int(i.get('discount_paise') or 0) for i in cur)
    earned_pts = sum(int(i.get('loyalty_earned_points') or 0) for i in cur)
    loyalty_value = 0
    # redemption value per shop settings
    for sid in {i.get('shop_id') for i in cur if i.get('shop_id')}:
        shop = await db.businesses.find_one({'id': sid},
                                            {'_id': 0, 'settings': 1}) or {}
        val = int((shop.get('settings') or {}).get('redemption_value_paise')
                  or 10)
        pts = sum(int(i.get('loyalty_earned_points') or 0)
                  for i in cur if i.get('shop_id') == sid)
        loyalty_value += pts * val

    # stores: manual + connected
    my_count = await db.my_stores.count_documents(
        {'customer_id': {'$in': ids}, 'deleted_at': None})
    connected_count = await db.my_stores.count_documents(
        {'customer_id': {'$in': ids}, 'deleted_at': None,
         'matched_shop_id': {'$ne': None}})
    links = await db.shop_customers.count_documents(
        {'customer_id': {'$in': ids}, 'status': 'active'})

    goals = [_goal_public(g) for g in await db.customer_goals.find(
        {'customer_id': {'$in': ids}, 'deleted_at': None},
        {'_id': 0}).to_list(100)]
    settings = await _settings(ids[0])
    target = int(settings.get('saving_target_paise') or 0)
    saving_progress = discount + loyalty_value

    # customer-added expenses (labelled separately — never merged into
    # verified retailer spending)
    exp_rows = await db.customer_expenses.find(
        {'customer_id': {'$in': ids}, 'deleted_at': None,
         'source': 'customer_added', 'date': {'$gte': cur_start[:10]}},
        {'_id': 0, 'amount_paise': 1, 'category': 1}).to_list(500)
    exp_by_cat: dict[str, int] = {}
    for e in exp_rows:
        c = e.get('category') or 'other'
        exp_by_cat[c] = exp_by_cat.get(c, 0) + int(e.get('amount_paise') or 0)

    # deterministic insight — only when both periods have data
    if not cur and not prv:
        insight = {'key': 'no_data'}
    elif not prv or len(prv) < 1:
        insight = {'key': 'first_period'}
    else:
        cur_top = breakdown['by_category'][0] if breakdown['by_category'] else None
        prv_break = await _spend_breakdown(prv)
        prv_top = prv_break['by_category'][0] if prv_break['by_category'] else None
        if cur_top and prv_top and cur_top['category'] == prv_top['category']:
            delta = cur_top['paise'] - prv_top['paise']
            insight = {'key': 'category_trend',
                       'category': cur_top['category'],
                       'delta_paise': delta,
                       'current_paise': cur_top['paise'],
                       'previous_paise': prv_top['paise']}
        elif cur_top:
            insight = {'key': 'top_category',
                       'category': cur_top['category'],
                       'paise': cur_top['paise']}
        else:
            insight = {'key': 'no_data'}

    delta_pct = None
    if prv_total > 0:
        delta_pct = round((cur_total - prv_total) / prv_total * 100, 1)

    return {
        'known_spending': {
            'total_paise': cur_total,
            'bills_count': len(cur),
            **breakdown,
            'source': 'nafamitra_recorded',
            'partial': True,
        },
        'prev_month_paise': prv_total,
        'delta_pct': delta_pct,
        'discount_paise': discount,
        'loyalty_value_paise': loyalty_value,
        'dhanlabh_earned_points': earned_pts,
        'bills_count': len(cur),
        'stores': {'my_count': my_count, 'connected_count': connected_count,
                   'linked_count': links, 'target': 5},
        'goals': goals,
        'saving_target_paise': target,
        'saving_progress_paise': saving_progress,
        'expenses': {
            'total_paise': sum(exp_by_cat.values()),
            'by_category': [{'category': c, 'paise': p} for c, p in
                            sorted(exp_by_cat.items(), key=lambda kv: -kv[1])],
            'source': 'customer_added',
        },
        'insight': insight,
        'entitlements': await active_entitlements(ids[0]),
    }
