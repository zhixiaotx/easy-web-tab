#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
easy-web-tab 备份数据编辑器 - 通用新增脚本（v2 五文件版）
封装：自动路由文件 → 备份原文件 → 校验格式 → 生成 ID/时间戳 → push 新条目 → 写回 → 回验。
支持 5 个独立文件：nav.json / icons.json / workbench.json / business.json / student.json。

用法见同目录 SKILL.md「九、使用脚本 add_entry.py」。
"""
import argparse
import json
import shutil
import os
import datetime
import random
import sys

DEFAULT_DIR = r"C:\Users\YangLiJuan\Nutstore\1\easy-web-tab"
PW_FIELDS = ("passwords", "passwordsSalt", "passwordVerification")

# 子命令 → 目标文件名映射
CMD_TO_FILE = {
    "site": "nav.json",
    "todo": "workbench.json",
    "note": "workbench.json",
    "countdown": "workbench.json",
    "ledger": "workbench.json",
    "exercise": "workbench.json",
    "weight": "workbench.json",
    "habit": "workbench.json",
    "product": "business.json",
    "purchase": "business.json",
    "expense": "business.json",
    "daily-record": "business.json",
    # generic 需要用户手动指定 --file
}


def ts():
    """ISO 8601 UTC 时间戳"""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def make_id(prefix):
    suffix = ''.join(random.choices('0123456789abcdef', k=4))
    return f"{prefix}_{datetime.datetime.now():%Y%m%d_%H%M%S}_{suffix}"


def resolve_file(args):
    """确定目标文件路径：--file 优先，否则按子命令路由到 --dir 下的对应文件"""
    if args.file:
        return args.file
    fname = CMD_TO_FILE.get(args.cmd)
    if not fname:
        raise SystemExit(f"子命令 '{args.cmd}' 无法自动路由文件，请用 --file 指定目标文件路径")
    return os.path.join(args.dir, fname)


def do_backup(src):
    """备份目标文件（不动其他 4 份）"""
    bak = f"{src}.bak.{datetime.datetime.now():%Y%m%d-%H%M%S}"
    shutil.copy2(src, bak)
    return bak


def load(src):
    with open(src, encoding='utf-8') as f:
        return json.load(f)


def save(src, data):
    with open(src, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def business_root(data):
    """business.json 的 business 包裹层"""
    return data.setdefault("business", {})


def ensure(data, *keys, default):
    cur = data
    for k in keys[:-1]:
        cur = cur.setdefault(k, {})
    return cur.setdefault(keys[-1], default)


def collect_ids(data, filename):
    """收集已有 ID 用于查重（按文件类型收集对应字段）"""
    ids = set()
    if filename == "workbench.json":
        for arr in (data.get("todos", []) or [], data.get("countdowns", []) or []):
            if isinstance(arr, list):
                for e in arr:
                    if isinstance(e, dict):
                        ids.add(e.get("id"))
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
    elif filename == "business.json":
        br = business_root(data)
        for k in ("products", "purchases", "dailyRecords", "expenses"):
            for e in br.get(k, []) or []:
                ids.add(e.get("id"))
    elif filename == "nav.json":
        prefs = data.get("prefs", {}) or {}
        raw = prefs.get("user-sites", "[]") or "[]"
        try:
            sites = json.loads(raw) if raw.strip() else []
            for e in sites:
                ids.add(e.get("url"))  # 网站用 URL 去重
        except json.JSONDecodeError:
            pass
    return ids


def append_unique(arr, entry, ids):
    eid = entry.get("id")
    if eid and eid in ids:
        raise SystemExit(f"ID 冲突: {eid}")
    arr.append(entry)


def validate(data, filename):
    """按各文件格式校验"""
    if filename == "nav.json":
        assert data.get("version") == 1, "nav.json version 应为 1"
        prefs = data.get("prefs", {}) or {}
        for v in prefs.values():
            if isinstance(v, str) and v.strip()[:1] in ("[", "{"):
                json.loads(v)  # 校验为合法 JSON 字符串
    elif filename == "workbench.json":
        assert data.get("version") == 1, "workbench.json version 应为 1"
        assert isinstance(data.get("todos"), list), "todos 应为数组"
        assert isinstance(data.get("notes"), dict), "notes 应为对象"
        assert isinstance(data.get("diary"), dict), "diary 应为对象"
    elif filename == "business.json":
        assert data.get("version") == 1, "business.json version 应为 1"
        br = data.get("business", {})
        assert isinstance(br, dict), "business 应为对象"
        assert isinstance(br.get("products"), list), "business.products 应为数组"
    elif filename == "student.json":
        assert data.get("version") == 1, "student.json version 应为 1"
    return True


def has_pw_fields(filename):
    """只有 workbench.json 含密码字段"""
    return filename == "workbench.json"


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
    append_unique(arr, e, collect_ids(data, "workbench.json"))
    return "todos"


def h_note(data, args):
    notes = ensure(data, "notes", default={})
    arr = notes.setdefault("notes", [])
    e = {"id": make_id("nt"), "type": args.type or "normal", "title": args.title,
         "content": args.content or "", "categoryId": args.category or "",
         "pinned": False, "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data, "workbench.json"))
    return "notes.notes"


def h_countdown(data, args):
    arr = ensure(data, "countdowns", default=[])
    e = {"id": make_id("cd"), "name": args.name, "endDateTime": args.end,
         "repeat": json.loads(args.repeat) if args.repeat else None,
         "category": args.category or "life", "createdAt": ts(), "updatedAt": ts(),
         "showOnDisplay": True, "color": args.color or "#22c55e"}
    append_unique(arr, e, collect_ids(data, "workbench.json"))
    return "countdowns"


def h_ledger(data, args):
    arr = ensure(data, "ledger", "entries", default=[])
    e = {"id": make_id("ld"), "date": args.date, "categoryId": args.category,
         "amount": args.amount, "note": args.note or "",
         "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data, "workbench.json"))
    return "ledger.entries"


def h_exercise(data, args):
    arr = ensure(data, "health", "records", "exercise", default=[])
    e = {"id": make_id("ex"), "module": "exercise", "date": args.date,
         "exerciseType": args.type, "duration": args.duration,
         "calories": args.calories, "distanceKm": args.distance or 0,
         "note": args.note or "", "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data, "workbench.json"))
    return "health.records.exercise"


def h_weight(data, args):
    arr = ensure(data, "health", "records", "weight", default=[])
    e = {"id": make_id("wt"), "module": "weight", "date": args.date,
         "weightKg": args.kg, "note": args.note or "",
         "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data, "workbench.json"))
    return "health.records.weight"


def h_habit(data, args):
    arr = ensure(data, "habits", "habits", default=[])
    e = {"id": make_id("hb"), "name": args.name, "frequency": args.frequency or 7,
         "color": args.color or "#3b82f6", "createdAt": ts()}
    append_unique(arr, e, collect_ids(data, "workbench.json"))
    return "habits.habits"


def h_product(data, args):
    br = business_root(data)
    arr = br.setdefault("products", [])
    e = {"id": make_id("bp"), "name": args.name, "categoryId": args.category or "",
         "unit": args.unit or "份", "purchasePrice": args.purchase,
         "sellingPrice": args.selling, "active": True, "createdAt": ts()}
    append_unique(arr, e, collect_ids(data, "business.json"))
    return "business.products"


def h_purchase(data, args):
    br = business_root(data)
    arr = br.setdefault("purchases", [])
    total = args.quantity * args.unit_price
    e = {"id": make_id("bpr"), "productId": args.product, "quantity": args.quantity,
         "unitPrice": args.unit_price, "total": total, "date": args.date,
         "note": args.note or "", "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data, "business.json"))
    return "business.purchases"


def h_expense(data, args):
    br = business_root(data)
    arr = br.setdefault("expenses", [])
    e = {"id": make_id("be"), "date": args.date, "categoryId": args.category,
         "amount": args.amount, "note": args.note or "",
         "createdAt": ts(), "updatedAt": ts()}
    append_unique(arr, e, collect_ids(data, "business.json"))
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
    append_unique(recs, e, collect_ids(data, "business.json"))
    return "business.dailyRecords"


def h_generic(data, args):
    entry = json.loads(args.json)
    # generic 需要用户指定 --file，target 决定写入路径
    parts = args.target.split(".")
    if parts[0] == "business":
        br = business_root(data)
        if len(parts) == 2:
            arr = br.setdefault(parts[1], [])
        else:
            cur = br
            for p in parts[1:-1]:
                cur = cur.setdefault(p, {})
            arr = cur.setdefault(parts[-1], [])
    elif parts[0] == "prefs":
        prefs = ensure(data, "prefs", default={})
        # prefs 中的值是 JSON 字符串
        key = parts[1] if len(parts) > 1 else None
        if key:
            raw = prefs.get(key, "[]") or "[]"
            arr = json.loads(raw) if raw.strip() else []
            if "id" not in entry:
                entry["id"] = make_id("x")
            if "createdAt" not in entry:
                entry["createdAt"] = ts()
                entry["updatedAt"] = ts()
            arr.append(entry)
            prefs[key] = json.dumps(arr, ensure_ascii=False)
            return f'prefs["{key}"]'
        raise SystemExit("generic + prefs 需要 target 如 prefs.user-sites")
    else:
        cur = data
        for p in parts[:-1]:
            cur = cur.setdefault(p, {})
        arr = cur.setdefault(parts[-1], [])
    if "id" not in entry:
        entry["id"] = make_id("x")
    if "createdAt" not in entry:
        entry["createdAt"] = ts()
        entry["updatedAt"] = ts()
    arr.append(entry)
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
    p = argparse.ArgumentParser(description="easy-web-tab 备份新增脚本（v2 五文件版）")
    p.add_argument("--dir", default=DEFAULT_DIR, help=f"备份目录路径（默认 {DEFAULT_DIR}）")
    p.add_argument("--file", default=None, help="直接指定文件路径（覆盖 --dir 自动路由）")
    sub = p.add_subparsers(dest="cmd", required=True)

    ps = sub.add_parser("site", help="添加网站 → nav.json")
    ps.add_argument("--name", required=True); ps.add_argument("--url", required=True)
    ps.add_argument("--category"); ps.add_argument("--tags", help="逗号分隔，如 购物,日常")
    ps.add_argument("--description")

    pt = sub.add_parser("todo", help="新增待办 → workbench.json")
    pt.add_argument("--title", required=True); pt.add_argument("--description")
    pt.add_argument("--priority", choices=["low", "medium", "high"])
    pt.add_argument("--due", help="YYYY-MM-DD"); pt.add_argument("--category")
    pt.add_argument("--color"); add_common(pt)

    pn = sub.add_parser("note", help="新增便签 → workbench.json")
    pn.add_argument("--title", required=True); pn.add_argument("--content")
    pn.add_argument("--type", choices=["normal", "timeline"]); pn.add_argument("--category")
    add_common(pn)

    pc = sub.add_parser("countdown", help="新增倒计时 → workbench.json")
    pc.add_argument("--name", required=True); pc.add_argument("--end", required=True, help="YYYY-MM-DDTHH:mm")
    pc.add_argument("--category"); pc.add_argument("--repeat", help='如 {"type":"yearly"} 或留空')
    pc.add_argument("--color"); add_common(pc)

    pl = sub.add_parser("ledger", help="新增记账 → workbench.json")
    pl.add_argument("--date", required=True, help="YYYY-MM-DD"); pl.add_argument("--category", required=True)
    pl.add_argument("--amount", required=True, type=float); add_common(pl)

    pe = sub.add_parser("exercise", help="新增运动记录 → workbench.json")
    pe.add_argument("--date", required=True); pe.add_argument("--type", required=True, help="运动类型")
    pe.add_argument("--duration", required=True, type=int, help="分钟")
    pe.add_argument("--calories", required=True, type=float); pe.add_argument("--distance", type=float)
    add_common(pe)

    pw = sub.add_parser("weight", help="新增体重记录 → workbench.json")
    pw.add_argument("--date", required=True); pw.add_argument("--kg", required=True, type=float)
    add_common(pw)

    ph = sub.add_parser("habit", help="新增习惯 → workbench.json")
    ph.add_argument("--name", required=True); ph.add_argument("--frequency", type=int)
    ph.add_argument("--color")

    pp = sub.add_parser("product", help="新增商品 → business.json")
    pp.add_argument("--name", required=True); pp.add_argument("--category")
    pp.add_argument("--unit"); pp.add_argument("--purchase", required=True, type=float)
    pp.add_argument("--selling", required=True, type=float)

    ppu = sub.add_parser("purchase", help="新增进货 → business.json")
    ppu.add_argument("--product", required=True, help="商品 id"); ppu.add_argument("--quantity", required=True, type=int)
    ppu.add_argument("--unit-price", required=True, type=float, dest="unit_price")
    ppu.add_argument("--date", required=True); add_common(ppu)

    pex = sub.add_parser("expense", help="新增支出 → business.json")
    pex.add_argument("--date", required=True); pex.add_argument("--category", required=True)
    pex.add_argument("--amount", required=True, type=float); add_common(pex)

    pdr = sub.add_parser("daily-record", help="新增/追加收摊记录 → business.json")
    pdr.add_argument("--date", required=True)
    pdr.add_argument("--items-json", required=True, dest="items_json",
                     help='JSON 数组，如 [{"productId":"bp_1","broughtOut":30,"remaining":5,"loss":1}]')
    add_common(pdr)

    pg = sub.add_parser("generic", help="通用：直接传 target 路径与 entry JSON（需 --file 指定文件）")
    pg.add_argument("--target", required=True, help="如 ledger.entries / business.products / notes.notes / prefs.user-sites")
    pg.add_argument("--json", required=True, help="entry 的 JSON 字符串")

    return p


def main():
    args = build_parser().parse_args()
    filepath = resolve_file(args)
    filename = os.path.basename(filepath)

    if not os.path.exists(filepath):
        print(f"错误：文件不存在 {filepath}")
        print(f"提示：请确认目录 {args.dir} 下已通过云同步生成 5 个拆分文件（nav/icons/workbench/business/student.json）")
        sys.exit(1)

    data = load(filepath)
    pw_before = {k: data.get(k) for k in PW_FIELDS} if has_pw_fields(filename) else {}
    bak = do_backup(filepath)
    module = HANDLERS[args.cmd](data, args)
    save(filepath, data)

    # 回验
    v = load(filepath)
    validate(v, filename)
    if has_pw_fields(filename):
        for k in PW_FIELDS:
            assert v.get(k) == pw_before[k], f"密码字段被改动: {k}"

    print(f"OK 备份={bak} 模块={module} 文件={filename}")


if __name__ == "__main__":
    main()
