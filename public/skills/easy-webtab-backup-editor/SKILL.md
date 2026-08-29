---
name: "easy-webtab-backup-editor"
description: "当用户要\"记录/新增/添加\"数据到 easy-web-tab 备份时触发。支持：添加网站、记待办、写便签、加倒计时、记一笔消费/收入、记录运动/体重、添加习惯、新增商品/进货/收摊/支出记录。禁止：删除已有数据。数据文件位于 C:\\Users\\YangLiJuan\\Nutstore\\1\\easy-web-tab\\backup.json"
---

# easy-web-tab 备份数据编辑器

**触发**：用户说"帮我新增 xxx 网站 / 加一条待办 / 记一笔消费 / 新增进货 / 记一笔支出"等，向备份数据中**新增**条目。

**禁止修改/删除**：本技能**只做新增**，不允许修改或删除已有条目。用户说"改一下 xxx 的标题/金额/日期"或"删掉这条记录"时，直接回复"本技能仅支持新增数据，不支持修改或删除操作"，不执行。

**禁止闲聊**：用户只是问"怎么用云同步/怎么导出"→ 直接回答，不编辑 JSON。

---

## 一、默认路径

```
默认文件：C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\backup.json
```

查找顺序：`backup.json`  → 问用户。

**格式判定**：读前 40 行 → 顶层有 `version: 9` 且有 `todos`/`notes` → **格式 A 工作台备份**；顶层有 `type: "business-backup"` → **格式 B 销售记账独立备份**。

---

## 二、格式 A：backup.json 结构（格式 A = 工作台 v9）

```json5
{
  "version": 9,
  "exportedAt": "2026-08-23T12:00:00.000Z",
  "todos": [],              // 待办数组
  "notes": { "categories": [], "notes": [] },  // 便签对象（不是数组！）
  "diary": { "entries": [] },                  // 日记对象（不是数组！）
  "countdowns": [],        // 倒计时数组
  "passwords": "",         // 加密串——禁止手改
  "health": {              // 健康数据
    "height": 175,
    "plans": { "exercise": {}, "diet": {}, "sleep": {} },
    "records": { "exercise": [], "diet": [], "sleep": [], "weight": [] }
  },
  "ledger": { "categories": [], "entries": [] },  // 记账
  "settings": {},
  "pomodoro": {},
  "habits": { "habits": [], "records": [] },      // 习惯打卡
  "business": {             // 销售记账（内嵌于工作台备份）
    "productCategories": [], "expenseCategories": [],
    "products": [], "purchases": [], "dailyRecords": [],
    "expenses": [], "settings": {}
  },
  "passwordsSalt": "",         // 禁止手改
  "passwordVerification": "",  // 禁止手改
  "clientId": "",
  "pushedAt": 0,
  "prefs": {                  // 导航网址/分类/偏好（值全部是 JSON 字符串！）
    "user-sites": "[{\"name\":\"xxx\",\"url\":\"https://...\"}]",
    "user-categories": "[...]",
    "user-search-engines": "[...]",
    "user-todo-categories": "[...]"
  }
}
```

**三个坑点**：
1. `prefs` 的值是 **JSON 字符串**，不是对象。改时必须 `JSON.parse` → 改 → `JSON.stringify`。
2. `notes`/`diary` 是**对象**不是数组。`notes.notes` 才是便签数组，`diary.entries` 才是日记数组。
3. `passwords`/`passwordsSalt`/`passwordVerification` 三个**禁止手改**。

---

## 三、新增数据模板

### 1. 新增网站 → `prefs["user-sites"]`（Site[]）

```json5
{
  "name": "淘宝",
  "url": "https://www.taobao.com",
  "category": "other",       // 分类 id，必须存在于 user-categories
  "tags": ["购物"],           // 字符串数组
  "description": "",
  "icon": "",                // 留空走 Google Favicon
  "sort": 99,                // 数字，越大越靠后
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

> 操作：`JSON.parse(prefs["user-sites"])` → push → `JSON.stringify`。同时确认 `prefs["user-categories"]` 里对应分类 id 存在。

### 2. 新增待办 → `todos[]`（WorkbenchTodo）

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

### 3. 新增便签 → `notes.notes[]`（WorkbenchNote）

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

### 4. 新增倒计时 → `countdowns[]`（Countdown）

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

### 5. 新增记账 → `ledger.entries[]`（LedgerEntry）

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

### 6. 新增运动记录 → `health.records.exercise[]`（ExerciseRecord）

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

### 7. 新增体重记录 → `health.records.weight[]`（WeightRecord）

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

### 8. 新增习惯 → `habits.habits[]`（Habit）

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

### 9. 新增商品 → `business.products[]`（BusinessProduct）

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

### 10. 新增进货 → `business.purchases[]`（BusinessPurchase）

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

### 11. 新增收摊记录 → `business.dailyRecords[]`（BusinessDailyRecord）

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
> 1. 在 `business.dailyRecords`（或格式 B 的 `data.dailyRecords`）中查找 `date` 相同的记录。
> 2. **存在**：在已有记录的 `items` 数组末尾追加新商品行，`totalRevenue` 重算（Σ 所有 items 的 sold × 对应商品 sellingPrice），`updatedAt` 刷新为当前时间。
> 3. **不存在**：push 新的完整记录（模板如上）。
> 4. `items` 中的 `productId` 必须能在 `business.products` 中找到。`totalRevenue` 需按 `sold × sellingPrice` 真实计算。

### 12. 新增支出记录 → `business.expenses[]`（BusinessExpense）

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
> 1. 在 `business.expenses`（或格式 B 的 `data.expenses`）中查找 `date` 相同的记录。
> 2. **存在**：直接 push 新条目到 `expenses` 数组（同一天可有多条支出，无需合并到同一条）。
> 3. **不存在**：直接 push 新条目（模板如上）。
> 4. `categoryId` 必须在 `business.expenseCategories` 中存在。

---

## 四、格式 B：销售记账独立备份

当目标文件是销售记账独立备份（顶层 `type: "business-backup"`）时，数据在 `data.` 下而非顶层 `business.`：

```json5
{
  "type": "business-backup",
  "version": 1,
  "exportedAt": "2026-08-23T12:00:00.000Z",
  "data": {
    "productCategories": [], "expenseCategories": [],
    "products": [], "purchases": [], "dailyRecords": [],
    "expenses": [], "settings": {}
    // 新增商品 → data.products[]，模板同上面第 9 条
    // 新增进货 → data.purchases[]，模板同上面第 10 条
    // 新增收摊 → data.dailyRecords[]，模板同上面第 11 条
    // 新增支出 → data.expenses[]，模板同上面第 12 条
  }
}
```

**内置商品分类（5 种子可删）**：`product-snack`(小吃)、`product-drink`(饮品)、`product-fruit`(水果)、`product-daily`(日用品)、`product-clothing`(服饰)

**内置支出分类（5 不可删）**：`expense-stall`(摊位费)、`expense-gas`(燃气费)、`expense-seasoning`(调料包装)、`expense-transport`(交通费)、`expense-other`(其他)

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

---

## 六、安全流程

1. **备份原文件**：写前复制为 `backup-YYYYMMDD-HHMMSS.json`
2. **校验合法**：Read 完整内容 → JSON.parse 通过
3. **写入**：按上面模板 push 新条目，ID 查重
4. **回验**：写入后再 Read，确认 `version===9`、`todos` 是数组、`notes`/`diary` 是对象、`prefs` 各值能 JSON.parse
5. **密码字段不变**：passwordsSalt/passwordVerification 逐字符比对，不能动

---

## 七、模块判定优先级

收到用户输入后，按以下顺序判定数据归属模块：

| 优先级 | 关键词信号 | 模块 |
|---|---|---|
| 1 | "网站"/"网址"/"导航" | prefs["user-sites"] |
| 2 | "待办"/"任务"/"todo" | todos |
| 3 | "便签"/"笔记"/"页签" | notes.notes |
| 4 | "倒计时"/"定时"/"提醒"+日期时间 | countdowns |
| 5 | "记账"/"消费"/"支出"/"收入"+金额 | ledger.entries |
| 6 | "运动"/"锻炼"+时长/卡路里 | health.records.exercise |
| 7 | "体重"+kg | health.records.weight |
| 8 | "习惯"/"打卡" | habits.habits |
| 9 | "商品"/"产品" | business.products |
| 10 | "进货"/"采购"+商品+数量 | business.purchases |
| 11 | "收摊"/"营业额"+日期 | business.dailyRecords |
| 12 | "支出"+"充电"/"摊位费"/"交通费"等+金额+日期 | business.expenses |

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
已记录完成：<备份记录名>，数据写入 <模块名> 模块。
```

- 备份记录名 = Step 1 备份的原文件副本名
- 模块名 = 实际写入位置（如 `todos`、`ledger`、`health.records.exercise`、`prefs["user-sites"]`、`business.purchases` 等）

**失败时**如实报告问题并请求用户输入。

---

## 九、使用脚本 `add_entry.py`（推荐，免手写代码）

本技能附带通用脚本 `add_entry.py`，已封装完整安全流程（自动备份原文件 → 校验格式 → 生成 ID/时间戳 → push 新条目 → 写回 → 回验，并断言密码字段不被改动）。**优先用脚本，不要再临时写代码。**

**位置**：`~/.workbuddy/skills/easy-webtab-backup-editor/add_entry.py`
**运行**：`python add_entry.py <子命令> [--file 路径] [字段...]`
- `--file` 省略时用默认路径 `C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\backup.json`；指定格式 B 独立备份时传入该文件路径即可（脚本自动识别 `type:"business-backup"`）。
- 金额/数量都是数字（`16.5`、`150`），不要加引号；日期用本地 `YYYY-MM-DD`。

**子命令速查**：

| 子命令 | 写入位置 | 必填参数 | 可选参数 |
|---|---|---|---|
| `site` | prefs["user-sites"] | `--name --url` | `--category --tags(逗号分隔) --description` |
| `todo` | todos | `--title` | `--description --priority(low/medium/high) --due(YYYY-MM-DD) --category --color --note` |
| `note` | notes.notes | `--title` | `--content --type(normal/timeline) --category --note` |
| `countdown` | countdowns | `--name --end(YYYY-MM-DDTHH:mm)` | `--category --repeat(JSON) --color --note` |
| `ledger` | ledger.entries | `--date --category --amount` | `--note` |
| `exercise` | health.records.exercise | `--date --type --duration(分) --calories` | `--distance(公里) --note` |
| `weight` | health.records.weight | `--date --kg` | `--note` |
| `habit` | habits.habits | `--name` | `--frequency(1-7) --color` |
| `product` | business.products | `--name --purchase --selling` | `--category --unit` |
| `purchase` | business.purchases | `--product(商品id) --quantity --unit-price --date` | `--note` |
| `expense` | business.expenses | `--date --category --amount` | `--note` |
| `daily-record` | business.dailyRecords | `--date --items-json(数组)` | `--note`（同日期自动追加并重算营业额） |
| `generic` | 任意（target 指定） | `--target(如 ledger.entries) --json(entry的JSON)` | — |

**示例（对应常见场景）**：
```bash
# 记账：昨日早餐 16.5，备注两杯豆浆一个馅饼6个包子
python add_entry.py ledger --date 2026-08-25 --category breakfast --amount 16.5 --note "两杯豆浆、一个馅饼、6个包子"

# 添加网站
python add_entry.py site --name 淘宝 --url https://www.taobao.com --tags "购物,日常"

# 新增商品 + 进货
python add_entry.py product --name 烤冷面 --purchase 3 --selling 8
python add_entry.py purchase --product bp_xxx --quantity 50 --unit-price 3 --date 2026-08-25

# 兜底：任意结构直接传 JSON（自动补 id/时间戳）
python add_entry.py generic --target notes.notes --json "{\"type\":\"normal\",\"title\":\"x\",\"content\":\"y\"}"
```

**注意**：`daily-record` 的 `--items-json` 中 `productId` 必须已存在于 `business.products`，营业额按 `(broughtOut-remaining-loss) × sellingPrice` 自动计算；同日期已存在收摊记录时自动追加而非新建。
