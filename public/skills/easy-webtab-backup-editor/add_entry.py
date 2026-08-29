#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
easy-web-tab 备份数据编辑器 - 通用新增脚本
封装：备份原文件 -> 校验格式 -> 生成 ID/时间戳 -> push 新条目 -> 写回 -> 回验。
支持格式 A（工作台 v9 备份）与格式 B（销售记账独立备份，type=business-backup）。

用法见同目录 SKILL.md「九、使用脚本 add_entry.py」。
"""
import argparse
import json
import shutil
import os
import datetime
import random
import sys

DEFAULT_BACKUP = r"C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\backup.json"
PW_FIELDS = ("passwords", "passwordsSalt", "passwordVerification")


def ts():
    """ISO 8601 UTC 时间戳，形如 2026-08-23T12:00:00.000Z"""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def make_id(prefix):
    suffix = ''.join(random.choices('0123456789abcdef', k=4))
    return f"{prefix}_{datetime.datetime.now():%Y%m%d_%H%M%S}_{suffix}"


def do_backup(src):
    bak = src.replace("backup.json", f"backup-{datetime.datetime.now():%Y%m%d-%H%M%S}.json")
    shutil.copy2(src, bak)
    return bak


def load(src):
    with open(src, encoding='utf-8') as f:
        return json.load(f)


def save(src, data):
    with open(src, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def business_root(data):
    """返回销售记账数据的根：格式 B 在 data.*，格式 A 在 business.*"""
    if data.get("type") == "business-backup":
        return data.setdefault("data", {})
    return data.setdefault("business", {})


def ensure(data, *keys, default):
    cur = data
    for k in keys[:-1]:
        cur = cur.setdefault(k, {})
    return cur.setdefault(keys[-1], default)


def collect_ids(data):
    ids = set()
    for arr in (data.get("todos", []) or [], data.get("countdowns", []) or []):
        ids.add(arr.get("id") if isinstance(arr, dict) else None)
    ledger = data.get("ledger", {}) or {}
    for e in ledger.get("entries", []) or []:
        ids.add(e.get("id"))
    notes = data.get("notes", {}) or {}
    for e in notes.get("notes", []) or []:
        ids.add(e.get("id"))
    habits = data.get("habits", {}) or {}
    for e in habits.get("habits", []) or []:
        ids.add(e.get("id"))
    for e in habits.get("records", []) or []:
        ids.add(e.get("id"))
    health = data.get("health", {}).get("records", {}) or {}
    for arr in health.values():
        if isinstance(arr, list):
            for e in arr:
                ids.add(e.get("id"))
    br = business_root(data)
    for k in ("products", "purchases", "dailyRecords", "expenses"):
        for e in br.get(k, []) or []:
            ids.add(e.get("id"))
    ids.discard(None)
    return ids


def append_unique(arr, entry, ids):
    if entry.get("id") in ids:
        raise SystemExit(f"ID 冲突: {entry['id']}")
    arr.append(entry)


def validate(data):
    if data.get("version") == 9:
        assert isinstance(data.get("todos"), list), "todos 应为数组"
        assert isinstance(data.get("notes"), dict), "notes 应为对象"
        assert isinstance(data.get("diary"), dict), "diary 应为对象"
    prefs = data.get("prefs", {}) or {}
    for v in prefs.values():
        if isinstance(v, str) and v.strip()[:1] in ("[", "{"):
            json.loads(v)  # 校验为合法 JSON 字符串
    return True


# ---------------- handlers ----------------

def h_site(data, args):
    prefs = ensure(data, "prefs", default={})
    raw = prefs.get("user-sites", "[]") or "[]"
    sites = json.loads(raw) if raw.strip() else []
    e = {
        "name": args.name, "url": args.url,
        "category": args.category or "other",
        "tags": [t.strip() for t in (args.tags or "").split(",") if t.strip()],
        "description": args.description or "", "icon": "", "sort": 99,
        "createdAt": ts(), "updatedAt": ts(),
    }
    sites.append(e)
    prefs["user-sites"] = json.dumps(sites, ensure_ascii=False)
    return 'prefs["user-sites"]'


def h_todo(data, args):
    arr = ensure(data, "todos", default=[])
    e = {"id": make_id("td"), "title": args.title, "description": args.description or "",
         "priority": args.priority or "medium", "dueDate": args.due or "",
         "completed": False, "createdAt": ts(), "updatedAt": ts(),
         "color": args.color or "#3b82f6", "categoryId": args.category or ""}
    append_unique(arr, e, collect_ids(data))
    return "todos"


def h_note(data, args):
    notes = ensure(data, "notes", default={})
    arr = notes.setdefault("notes", [])
    e = {"id": make_id("nt"), "type": args.type or "normal", "title": args.title,
         "content": args.content or "", "categoryId": args.category or "",
         "pinned": False, "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data))
    return "notes.notes"


def h_countdown(data, args):
    arr = ensure(data, "countdowns", default=[])
    e = {"id": make_id("cd"), "name": args.name, "endDateTime": args.end,
         "repeat": json.loads(args.repeat) if args.repeat else None,
         "category": args.category or "life", "createdAt": ts(), "updatedAt": ts(),
         "showOnDisplay": True, "color": args.color or "#22c55e"}
    append_unique(arr, e, collect_ids(data))
    return "countdowns"


def h_ledger(data, args):
    arr = ensure(data, "ledger", "entries", default=[])
    e = {"id": make_id("ld"), "date": args.date, "categoryId": args.category,
         "amount": args.amount, "note": args.note or "",
         "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data))
    return "ledger.entries"


def h_exercise(data, args):
    arr = ensure(data, "health", "records", "exercise", default=[])
    e = {"id": make_id("ex"), "module": "exercise", "date": args.date,
         "exerciseType": args.type, "duration": args.duration,
         "calories": args.calories, "distanceKm": args.distance or 0,
         "note": args.note or "", "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data))
    return "health.records.exercise"


def h_weight(data, args):
    arr = ensure(data, "health", "records", "weight", default=[])
    e = {"id": make_id("wt"), "module": "weight", "date": args.date,
         "weightKg": args.kg, "note": args.note or "",
         "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data))
    return "health.records.weight"


def h_habit(data, args):
    arr = ensure(data, "habits", "habits", default=[])
    e = {"id": make_id("hb"), "name": args.name, "frequency": args.frequency or 7,
         "color": args.color or "#3b82f6", "createdAt": ts()}
    append_unique(arr, e, collect_ids(data))
    return "habits.habits"


def h_product(data, args):
    br = business_root(data)
    arr = br.setdefault("products", [])
    e = {"id": make_id("bp"), "name": args.name, "categoryId": args.category or "",
         "unit": args.unit or "份", "purchasePrice": args.purchase,
         "sellingPrice": args.selling, "active": True, "createdAt": ts()}
    append_unique(arr, e, collect_ids(data))
    return "business.products"


def h_purchase(data, args):
    br = business_root(data)
    arr = br.setdefault("purchases", [])
    total = args.quantity * args.unit_price
    e = {"id": make_id("bpr"), "productId": args.product, "quantity": args.quantity,
         "unitPrice": args.unit_price, "total": total, "date": args.date,
         "note": args.note or "", "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data))
    return "business.purchases"


def h_expense(data, args):
    br = business_root(data)
    arr = br.setdefault("expenses", [])
    e = {"id": make_id("be"), "date": args.date, "categoryId": args.category,
         "amount": args.amount, "note": args.note or "",
         "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data))
    return "business.expenses"


def h_daily_record(data, args):
    br = business_root(data)
    items = json.loads(args.items_json)
    products = {p["id"]: p for p in br.get("products", [])}
    recs = br.setdefault("dailyRecords", [])
    existing = next((r for r in recs if r.get("date") == args.date), None)
    if existing:
        existing["items"].extend(items)
        existing["totalRevenue"] = sum(
            (it["broughtOut"] - it["remaining"] - it["loss"]) *
            products.get(it["productId"], {}).get("sellingPrice", 0)
            for it in existing["items"]
        )
        existing["updatedAt"] = ts()
        return "business.dailyRecords (同日期追加)"
    total = sum(
        (it["broughtOut"] - it["remaining"] - it["loss"]) *
        products.get(it["productId"], {}).get("sellingPrice", 0)
        for it in items
    )
    e = {"id": make_id("bd"), "date": args.date, "items": items,
         "totalRevenue": total, "note": args.note or "",
         "createdAt": ts(), "updatedAt": ts()}
    append_unique(recs, e, collect_ids(data))
    return "business.dailyRecords"


def h_generic(data, args):
    entry = json.loads(args.json)
    if args.target.startswith("business."):
        br = business_root(data)
        key = args.target.split(".")[1]
        arr = br.setdefault(key, [])
    else:
        parts = args.target.split(".")
        cur = data
        for p in parts[:-1]:
            cur = cur.setdefault(p, {})
        arr = cur.setdefault(parts[-1], [])
    if "id" not in entry:
        entry["id"] = make_id("x")
    if "createdAt" not in entry:
        entry["createdAt"] = ts()
        entry["updatedAt"] = ts()
    append_unique(arr, entry, collect_ids(data))
    return args.target


HANDLERS = {
    "site": h_site, "todo": h_todo, "note": h_note, "countdown": h_countdown,
    "ledger": h_ledger, "exercise": h_exercise, "weight": h_weight,
    "habit": h_habit, "product": h_product, "purchase": h_purchase,
    "expense": h_expense, "daily-record": h_daily_record, "generic": h_generic,
}


def add_common(p):
    p.add_argument("--note", default="")


def build_parser():
    p = argparse.ArgumentParser(description="easy-web-tab 备份新增脚本")
    p.add_argument("--file", default=DEFAULT_BACKUP, help="备份文件路径（默认 Nutstore 路径）")
    sub = p.add_subparsers(dest="cmd", required=True)

    ps = sub.add_parser("site", help="添加网站")
    ps.add_argument("--name", required=True); ps.add_argument("--url", required=True)
    ps.add_argument("--category"); ps.add_argument("--tags", help="逗号分隔，如 购物,日常")
    ps.add_argument("--description")

    pt = sub.add_parser("todo", help="新增待办")
    pt.add_argument("--title", required=True); pt.add_argument("--description")
    pt.add_argument("--priority", choices=["low", "medium", "high"])
    pt.add_argument("--due", help="YYYY-MM-DD"); pt.add_argument("--category")
    pt.add_argument("--color"); add_common(pt)

    pn = sub.add_parser("note", help="新增便签")
    pn.add_argument("--title", required=True); pn.add_argument("--content")
    pn.add_argument("--type", choices=["normal", "timeline"]); pn.add_argument("--category")
    add_common(pn)

    pc = sub.add_parser("countdown", help="新增倒计时")
    pc.add_argument("--name", required=True); pc.add_argument("--end", required=True, help="YYYY-MM-DDTHH:mm")
    pc.add_argument("--category"); pc.add_argument("--repeat", help='如 {"type":"yearly"} 或留空')
    pc.add_argument("--color"); add_common(pc)

    pl = sub.add_parser("ledger", help="新增记账")
    pl.add_argument("--date", required=True, help="YYYY-MM-DD"); pl.add_argument("--category", required=True)
    pl.add_argument("--amount", required=True, type=float); add_common(pl)

    pe = sub.add_parser("exercise", help="新增运动记录")
    pe.add_argument("--date", required=True); pe.add_argument("--type", required=True, help="运动类型")
    pe.add_argument("--duration", required=True, type=int, help="分钟")
    pe.add_argument("--calories", required=True, type=float); pe.add_argument("--distance", type=float)
    add_common(pe)

    pw = sub.add_parser("weight", help="新增体重记录")
    pw.add_argument("--date", required=True); pw.add_argument("--kg", required=True, type=float)
    add_common(pw)

    ph = sub.add_parser("habit", help="新增习惯")
    ph.add_argument("--name", required=True); ph.add_argument("--frequency", type=int)
    ph.add_argument("--color")

    pp = sub.add_parser("product", help="新增商品")
    pp.add_argument("--name", required=True); pp.add_argument("--category")
    pp.add_argument("--unit"); pp.add_argument("--purchase", required=True, type=float)
    pp.add_argument("--selling", required=True, type=float)

    ppu = sub.add_parser("purchase", help="新增进货")
    ppu.add_argument("--product", required=True, help="商品 id"); ppu.add_argument("--quantity", required=True, type=int)
    ppu.add_argument("--unit-price", required=True, type=float, dest="unit_price")
    ppu.add_argument("--date", required=True); add_common(ppu)

    pex = sub.add_parser("expense", help="新增支出")
    pex.add_argument("--date", required=True); pex.add_argument("--category", required=True)
    pex.add_argument("--amount", required=True, type=float); add_common(pex)

    pdr = sub.add_parser("daily-record", help="新增/追加收摊记录")
    pdr.add_argument("--date", required=True)
    pdr.add_argument("--items-json", required=True, dest="items_json",
                     help='JSON 数组，如 [{"productId":"bp_1","broughtOut":30,"remaining":5,"loss":1}]')
    add_common(pdr)

    pg = sub.add_parser("generic", help="通用：直接传 target 路径与 entry JSON")
    pg.add_argument("--target", required=True, help="如 ledger.entries / business.products / notes.notes")
    pg.add_argument("--json", required=True, help="entry 的 JSON 字符串")

    return p


def main():
    args = build_parser().parse_args()
    data = load(args.file)
    pw_before = {k: data.get(k) for k in PW_FIELDS}
    bak = do_backup(args.file)
    module = HANDLERS[args.cmd](data, args)
    save(args.file, data)
    # 回验
    v = load(args.file)
    validate(v)
    for k in PW_FIELDS:
        assert v.get(k) == pw_before[k], f"密码字段被改动: {k}"
    print(f"OK 备份={bak} 模块={module}")


if __name__ == "__main__":
    main()
