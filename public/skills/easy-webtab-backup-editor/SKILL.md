---
name: "easy-webtab-backup-editor"
description: "当用户要\"记录/新增/添加\"数据到 easy-web-tab 备份时触发。支持：添加网站、记待办、写便签、加倒计时、记一笔消费/收入、记录运动/体重、添加习惯、新增商品/进货/收摊/支出记录。禁止：删除已有数据。数据目录位于 C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\（5 个独立 JSON 文件：nav.json / icons.json / workbench.json / business.json / student.json）"
---

# easy-web-tab 备份数据编辑器

**触发**：用户说"帮我新增 xxx 网站 / 加一条待办 / 记一笔消费 / 新增进货 / 记一笔支出"等，向备份数据中**新增**条目。

**禁止修改/删除**：本技能**只做新增**，不允许修改或删除已有条目。用户说"改一下 xxx 的标题/金额/日期"或"删掉这条记录"时，直接回复"本技能仅支持新增数据，不支持修改或删除操作"，不执行。

**禁止闲聊**：用户只是问"怎么用云同步/怎么导出"→ 直接回答，不编辑 JSON。

---

## 一、默认目录与文件路由

```
默认目录：C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\
```

云同步已拆分为 **5 个独立 JSON 文件**，各文件独立同步、独立冲突处理：

| 文件名 | 内容 | 对应模块 |
|---|---|---|
| `nav.json` | 网站导航、分类、搜索引擎、主题、背景、倒计时/待办分类注册表（prefs） | 新增网站 |
| `icons.json` | 自定义图标（Base64 dataUrl 数组） | 本技能不提供新增命令（走前端上传） |
| `workbench.json` | 待办、便签、日记、倒计时、记账、健康、习惯、番茄钟、设置、密码 | 新增待办/便签/倒计时/记账/运动/体重/习惯 |
| `business.json` | 销售记账（商品/进货/收摊/支出） | 新增商品/进货/收摊/支出 |
| `student.json` | 学生工作台 15 模块（作业/错题/阅读/复习/计划/奖励等） | 仅 generic 兜底，本批次不提供专用命令 |

**文件自动路由**：脚本根据子命令自动选择目标文件，无需手动指定。

**旧 backup.json 不再使用**：若目录下只有 `backup.json` 而无上述 5 个文件，提示"旧单文件备份，请先在应用中触发一次云同步（推送）生成 5 个拆分文件后再用本技能"。

---

## 二、五文件数据结构

### 格式 C1：nav.json（导航信封）

```json5
{
  "version": 1,
  "exportedAt": "2026-08-23T12:00:00.000Z",
  "prefs": {                    // 13 个键，值全部是 JSON 字符串！
    "user-sites": "[{\"name\":\"淘宝\",\"url\":\"https://...\"}]",   // Site[]
    "user-categories": "[...]",                // Category[]
    "user-deleted-legacy-ids": "[...]",
    "user-search-engines": "[...]",            // SearchEngine[]
    "built-in-engine-overrides": "...",
    "built-in-engine-default": "...",
    "user-theme": "...",                      // 字符串
    "user-background": "...",
    "user-countdown-categories": "[...]",     // 倒计时自定义分类
    "user-countdown-tab-categories": "[...]",
    "user-countdown-sort": "...",
    "user-todo-categories": "[...]",          // 待办自定义分类
    "user-todo-tab-categories": "[...]"
  }
}
```

**关键**：`prefs` 的值是 **JSON 字符串**，不是对象。改时必须 `JSON.parse` → 改 → `JSON.stringify`。

### 格式 C2：icons.json（自定义图标信封）

```json5
{
  "version": 1,
  "exportedAt": "2026-08-23T12:00:00.000Z",
  "icons": [
    {
      "id": "custom_icon_xxx",
      "name": "我的图标",
      "label": "我的图标",
      "dataUrl": "data:image/png;base64,iVBOR...",   // Base64
      "category": "其他",
      "createdAt": "2026-08-23T12:00:00.000Z"
    }
  ]
}
```

> 本技能不提供 icons.json 新增命令（图标上传走前端 IconManager 更直观）。

### 格式 C3：workbench.json（工作台信封）

```json5
{
  "version": 1,
  "exportedAt": "2026-08-23T12:00:00.000Z",
  "todos": [],              // 待办数组
  "notes": { "categories": [], "notes": [] },  // 便签对象（不是数组！）
  "diary": { "entries": [] },                  // 日记对象（不是数组！）
  "countdowns": [],         // 倒计时数组
  "passwords": "",          // 加密串——禁止手改
  "health": {               // 健康数据
    "height": 175,
    "plans": { "exercise": {}, "diet": {}, "sleep": {} },
    "records": { "exercise": [], "diet": [], "sleep": [], "weight": [] }
  },
  "ledger": { "categories": [], "entries": [] },   // 记账
  "settings": {},           // 工作台设置（不含 cloudSync* 5 字段）
  "pomodoro": {},
  "habits": { "habits": [], "records": [] },        // 习惯打卡
  "passwordsSalt": "",      // 禁止手改
  "passwordVerification": "", // 禁止手改
  "prefs": {}                // prefs 副本（与 nav.json 同源，非主数据源）
}
```

**注意**：workbench.json **不含 business 字段**（销售记账独立走 business.json）。`prefs` 是 nav.json 的副本，新增网站时**只改 nav.json**，不在此处重复操作。

### 格式 C4：business.json（销售记账信封）

```json5
{
  "version": 1,
  "exportedAt": "2026-08-23T12:00:00.000Z",
  "business": {             // 注意：business 是包裹层键
    "productCategories": [],
    "expenseCategories": [],
    "products": [],
    "purchases": [],
    "dailyRecords": [],
    "expenses": [],
    "settings": {}
  }
}
```

### 格式 C5：student.json（学生工作台信封）

```json5
{
  "version": 1,
  "exportedAt": "2026-08-23T12:00:00.000Z",
  "studentSettings": {},
  "studentHabits": {},
  "studentPomodoro": {},
  "studentDiary": { "entries": [] },
  "studentCountdowns": [],
  "homework": [],
  "timetable": [],
  "plans": [],
  "review": [],
  "mistakes": [],
  "reading": [],
  "achievements": {},
  "rewards": {},
  "parentTasks": [],
  "studentImages": []
}
```

> 本批次不提供 student.json 专用子命令。如需新增学生数据，使用 `generic --file <student.json路径> --target <字段名>` 兜底。

---

## 三、新增数据模板

### 1. 新增网站 → nav.json 的 `prefs["user-sites"]`（Site[]）

```json5
{
  "name": "淘宝",
  "url": "https://www.taobao.com",
  "category": "other",       // 分类 id，必须存在于 user-categories
  "tags": ["购物"],           // 字符串数组
  "description": "",          // 根据网站 url 访问，并总结网站内容
  "icon": "",                // 留空走 Google Favicon
  "sort": 99,                // 数字，越大越靠后
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

> 操作：`JSON.parse(prefs["user-sites"])` → push → `JSON.stringify`。同时确认 `prefs["user-categories"]` 里对应分类 id 存在。

### 2. 新增待办 → workbench.json 的 `todos[]`（WorkbenchTodo）

```json5
{
  "id": "td_20260823_120000_a1b2",
  "title": "写周报",
  "description": "",
  "priority": "medium",       // low | medium | high
  "dueDate": "2026-08-25",    // 可选，YYYY-MM-DD
  "completed": false,
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z",
  "color": "#3b82f6",        // 可选
  "categoryId": ""            // 可选，空=未分类
}
```

### 3. 新增便签 → workbench.json 的 `notes.notes[]`（WorkbenchNote）

```json5
{
  "id": "nt_20260823_120000_a1b2",
  "type": "normal",           // normal | timeline
  "title": "购物清单",
  "content": "牛奶、面包、鸡蛋",
  "categoryId": "",           // 空=未分类
  "pinned": false,
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z"
  // normal 类型不要写 entries 字段
}
```

### 4. 新增倒计时 → workbench.json 的 `countdowns[]`（Countdown）

```json5
{
  "id": "cd_20260823_120000_a1b2",
  "name": "中秋放假",
  "endDateTime": "2026-09-17T00:00",  // 本地时间 YYYY-MM-DDTHH:mm
  "repeat": null,                      // null=一次性，{type:"yearly"}=按年
  "category": "life",                  // work/life/study/exercise/diet/sleep + 自定义
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z",
  "showOnDisplay": true,
  "color": "#22c55e"
}
```

### 5. 新增记账 → workbench.json 的 `ledger.entries[]`（LedgerEntry）

```json5
{
  "id": "ld_20260823_120000_a1b2",
  "date": "2026-08-23",       // YYYY-MM-DD 本地日期
  "categoryId": "dinner",     // 必须在 ledger.categories 中存在
  "amount": 12,               // 数字，元
  "note": "晚餐",
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

**内置记账分类（8 个，不可删）**：

| id | 名称 | 类型 |
|---|---|---|
| salary | 工资 | income |
| mortgage | 房贷 | expense |
| carloan | 车贷 | expense |
| breakfast | 早餐 | expense |
| lunch | 午餐 | expense |
| dinner | 晚餐 | expense |
| commute | 通勤 | expense |
| daily | 日常 | expense |

### 6. 新增运动记录 → workbench.json 的 `health.records.exercise[]`（ExerciseRecord）

```json5
{
  "id": "ex_20260823_120000_a1b2",
  "module": "exercise",
  "date": "2026-08-23",
  "exerciseType": "跑步",    // 运动类型字符串
  "duration": 30,            // 分钟
  "calories": 200,           // 千卡
  "distanceKm": 5,           // 可选，公里
  "note": "晨跑",
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

### 7. 新增体重记录 → workbench.json 的 `health.records.weight[]`（WeightRecord）

```json5
{
  "id": "wt_20260823_120000_a1b2",
  "module": "weight",
  "date": "2026-08-23",
  "weightKg": 70.5,           // 数字，公斤
  "note": "",
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

### 8. 新增习惯 → workbench.json 的 `habits.habits[]`（Habit）

```json5
{
  "id": "hb_20260823_120000_a1b2",
  "name": "每天喝水",
  "frequency": 7,            // 每周目标次数 1-7
  "color": "#3b82f6",        // 可选，默认蓝
  "createdAt": "2026-08-23T12:00:00.000Z"
}
```

> 如需同时补打卡记录，写入 `habits.records[]`（HabitRecord）：`{ "id": "hr_...", "habitId": "hb_...", "date": "2026-08-23", "createdAt": "..." }`

### 9. 新增商品 → business.json 的 `business.products[]`（BusinessProduct）

```json5
{
  "id": "bp_20260823_120000_a1b2",
  "name": "烤冷面",
  "categoryId": "product-snack",  // 可选，对应 business.productCategories 中的 id
  "unit": "份",                   // 单位字符串
  "purchasePrice": 3,             // 进货单价
  "sellingPrice": 8,              // 售价
  "active": true,                 // 在售/停售
  "createdAt": "2026-08-23T12:00:00.000Z"
}
```

### 10. 新增加货 → business.json 的 `business.purchases[]`（BusinessPurchase）

```json5
{
  "id": "bpr_20260823_120000_a1b2",
  "productId": "bp_xxx",     // 必须对应 business.products 中的 id
  "quantity": 50,            // 数字
  "unitPrice": 3,            // 数字
  "total": 150,              // quantity × unitPrice，必须真实乘
  "date": "2026-08-23",
  "note": "",
  "createdAt": "2026-08-23T12:00:00.000Z"
}
```

### 11. 新增收摊记录 → business.json 的 `business.dailyRecords[]`（BusinessDailyRecord）

**新增逻辑：先查同日期记录是否存在，存在则 items 追加，不存在直接新增。**

```json5
{
  "id": "bd_20260823_120000_a1b2",
  "date": "2026-08-23",       // YYYY-MM-DD
  "items": [                  // 每个商品一条
    {
      "productId": "bp_xxx",  // 必须对应 products 中的 id
      "broughtOut": 30,      // 带出数量
      "remaining": 5,        // 剩余数量
      "loss": 1              // 损耗数量（sold = broughtOut - remaining - loss）
    }
  ],
  "totalRevenue": 375,        // 营业额 = Σ(broughtOut - remaining - loss) × sellingPrice
  "note": "",
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

> **操作步骤**：
> 1. 在 `business.dailyRecords` 中查找 `date` 相同的记录。
> 2. **存在**：在已有记录的 `items` 数组末尾追加新商品行，`totalRevenue` 重算（Σ 所有 items 的 sold × 对应商品 sellingPrice），`updatedAt` 刷新为当前时间。
> 3. **不存在**：push 新的完整记录（模板如上）。
> 4. `items` 中的 `productId` 必须能在 `business.products` 中找到。`totalRevenue` 需按 `sold × sellingPrice` 真实计算。

### 12. 新增支出记录 → business.json 的 `business.expenses[]`（BusinessExpense）

**新增逻辑：先查同日期记录是否存在，存在则追加新条目，不存在直接添加。**

```json5
{
  "id": "be_20260823_120000_a1b2",
  "date": "2026-08-23",       // YYYY-MM-DD
  "categoryId": "expense-gas", // 必须在 business.expenseCategories 中存在
  "amount": 100,              // 数字，元
  "note": "电动摩托车充电",    // 可选
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

> **操作步骤**：
> 1. 在 `business.expenses` 中查找 `date` 相同的记录。
> 2. **存在**：直接 push 新条目到 `expenses` 数组（同一天可有多条支出，无需合并到同一条）。
> 3. **不存在**：直接 push 新条目（模板如上）。
> 4. `categoryId` 必须在 `business.expenseCategories` 中存在。

---

## 四、内置分类速查

**内置记账分类（workbench.json ledger，8 个不可删）**：`salary`(工资/收入)、`mortgage`(房贷)、`carloan`(车贷)、`breakfast`(早餐)、`lunch`(午餐)、`dinner`(晚餐)、`commute`(通勤)、`daily`(日常)

**内置商品分类（business.json，5 种子可删）**：`product-snack`(小吃)、`product-drink`(饮品)、`product-fruit`(水果)、`product-daily`(日用品)、`product-clothing`(服饰)

**内置支出分类（business.json，5 不可删）**：`expense-stall`(摊位费)、`expense-gas`(燃气费)、`expense-seasoning`(调料包装)、`expense-transport`(交通费)、`expense-other`(其他)

---

## 五、通用规则

| 规则 | 说明 |
|---|---|
| ID 唯一 | 格式 `前缀_YYYYMMDD_HHmmss_XXXX`（末尾 4 位随机 hex），不要用裸数字 |
| 时间戳 | `createdAt`/`updatedAt`/`exportedAt` 用 ISO 8601 `2026-08-23T12:00:00.000Z` |
| 日期 | `date`/`dueDate`/`endDateTime` 用本地 `YYYY-MM-DD`（防 UTC 偏移） |
| 数字 | quantity/amount/total/calories/duration 等都是 number，不要写字符串 |
| 布尔 | completed/pinned/active/showOnDisplay 写 JSON 原生 true/false |
| 可选字段 | 缺失直接省略键，比 null 更干净 |
| 密码字段 | passwords/passwordsSalt/passwordVerification 禁止手改 |
| prefs 值 | 全是 JSON 字符串，改前 JSON.parse，改后 JSON.stringify |
| 文件路由 | site→nav.json；todo/note/countdown/ledger/exercise/weight/habit→workbench.json；product/purchase/expense/daily-record→business.json |

---

## 六、安全流程

1. **备份目标文件**：写前复制**被修改的那个文件**为 `<文件名>.bak.YYYYMMDD-HHMMSS`（如修改 nav.json → `nav.json.bak.20260823-120000`），不动其他 4 份
2. **校验合法**：Read 完整内容 → JSON.parse 通过
3. **写入**：按上面模板 push 新条目，ID 查重
4. **回验**：写入后再 Read，按各文件格式校验（nav.json 的 prefs 值能 JSON.parse；workbench.json 的 todos 是数组、notes/diary 是对象；business.json 的 business.products 是数组）
5. **密码字段不变**（仅 workbench.json）：passwordsSalt/passwordVerification 逐字符比对，不能动

---

## 七、模块判定优先级

收到用户输入后，按以下顺序判定数据归属模块与目标文件：

| 优先级 | 关键词信号 | 模块 | 目标文件 |
|---|---|---|---|
| 1 | "网站"/"网址"/"导航" | prefs["user-sites"] | nav.json |
| 2 | "待办"/"任务"/"todo" | todos | workbench.json |
| 3 | "便签"/"笔记"/"页签" | notes.notes | workbench.json |
| 4 | "倒计时"/"定时"/"提醒"+日期时间 | countdowns | workbench.json |
| 5 | "记账"/"消费"/"支出"/"收入"+金额 | ledger.entries | workbench.json |
| 6 | "运动"/"锻炼"+时长/卡路里 | health.records.exercise | workbench.json |
| 7 | "体重"+kg | health.records.weight | workbench.json |
| 8 | "习惯"/"打卡" | habits.habits | workbench.json |
| 9 | "商品"/"产品" | business.products | business.json |
| 10 | "进货"/"采购"+商品+数量 | business.purchases | business.json |
| 11 | "收摊"/"营业额"+日期 | business.dailyRecords | business.json |
| 12 | "支出"+"充电"/"摊位费"/"交通费"等+金额+日期 | business.expenses | business.json |

**无法判定时必须询问**：当用户输入无法匹配上表任何关键词，或语义模糊可归属多个模块时，**不要猜测**，直接列出可能的模块选项让用户确认。例如：

> "你说的内容可以归属多个模块，请确认：
> 1. 记账（消费/支出）
> 2. 运动记录
> 3. 待办事项
> 请回复数字选择。"

用户确认后才执行写入。

---

## 八、输出规则

**成功时只输出一句**：

```
已记录完成：<备份记录名>，数据写入 <模块名> 模块（<文件名>）。
```

- 备份记录名 = Step 1 备份的原文件副本名
- 模块名 = 实际写入位置（如 `todos`、`ledger`、`health.records.exercise`、`prefs["user-sites"]`、`business.purchases` 等）
- 文件名 = nav.json / workbench.json / business.json

**失败时**如实报告问题并请求用户输入。

---

## 九、使用脚本 `add_entry.py`（推荐，免手写代码）

本技能附带通用脚本 `add_entry.py`，已封装完整安全流程（自动路由文件 → 备份原文件 → 校验格式 → 生成 ID/时间戳 → push 新条目 → 写回 → 回验，并断言密码字段不被改动）。**优先用脚本，不要再临时写代码。**

**位置**：`~/.workbuddy/skills/easy-webtab-backup-editor/add_entry.py`
**运行**：`python add_entry.py <子命令> [--dir 目录路径] [字段...]`
- `--dir` 省略时用默认目录 `C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\`；脚本根据子命令自动路由到对应的 JSON 文件。
- 也可用 `--file` 直接指定任意文件路径（覆盖 `--dir` 的自动路由）。
- 金额/数量都是数字（`16.5`、`150`），不要加引号；日期用本地 `YYYY-MM-DD`。

**子命令速查**：

| 子命令 | 目标文件 | 写入位置 | 必填参数 | 可选参数 |
|---|---|---|---|---|
| `site` | nav.json | prefs["user-sites"] | `--name --url` | `--category --tags(逗号分隔) --description` |
| `todo` | workbench.json | todos | `--title` | `--description --priority(low/medium/high) --due(YYYY-MM-DD) --category --color --note` |
| `note` | workbench.json | notes.notes | `--title` | `--content --type(normal/timeline) --category --note` |
| `countdown` | workbench.json | countdowns | `--name --end(YYYY-MM-DDTHH:mm)` | `--category --repeat(JSON) --color --note` |
| `ledger` | workbench.json | ledger.entries | `--date --category --amount` | `--note` |
| `exercise` | workbench.json | health.records.exercise | `--date --type --duration(分) --calories` | `--distance(公里) --note` |
| `weight` | workbench.json | health.records.weight | `--date --kg` | `--note` |
| `habit` | workbench.json | habits.habits | `--name` | `--frequency(1-7) --color` |
| `product` | business.json | business.products | `--name --purchase --selling` | `--category --unit` |
| `purchase` | business.json | business.purchases | `--product(商品id) --quantity --unit-price --date` | `--note` |
| `expense` | business.json | business.expenses | `--date --category --amount` | `--note` |
| `daily-record` | business.json | business.dailyRecords | `--date --items-json(数组)` | `--note`（同日期自动追加并重算营业额） |
| `generic` | 需 `--file` 指定 | 任意（target 指定） | `--file <路径> --target(如 ledger.entries) --json(entry的JSON)` | — |

**示例（对应常见场景）**：
```bash
# 记账：昨日早餐 16.5，备注两杯豆浆一个馅饼6个包子
python add_entry.py ledger --date 2026-08-25 --category breakfast --amount 16.5 --note "两杯豆浆、一个馅饼、6个包子"

# 添加网站
python add_entry.py site --name 淘宝 --url https://www.taobao.com --tags "购物,日常"

# 新增商品 + 进货
python add_entry.py product --name 烤冷面 --purchase 3 --selling 8
python add_entry.py purchase --product bp_xxx --quantity 50 --unit-price 3 --date 2026-08-25

# 兜底：任意结构直接传 JSON（自动补 id/时间戳），需手动指定文件
python add_entry.py generic --file C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\student.json --target homework --json "{\"title\":\"数学练习\",\"status\":\"pending\"}"
```

**注意**：`daily-record` 的 `--items-json` 中 `productId` 必须已存在于 `business.products`，营业额按 `(broughtOut-remaining-loss) × sellingPrice` 自动计算；同日期已存在收摊记录时自动追加而非新建。
