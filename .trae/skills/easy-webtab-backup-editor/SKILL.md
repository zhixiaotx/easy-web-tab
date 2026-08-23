---
name: "easy-webtab-backup-editor"
description: "直接读写/修改 easy-web-tab 项目的备份 JSON（导航 Markdown、工作台 v9、销售记账 v1、图标导出）。默认从坚果云同步目录 C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\ 读取 backup.json。用户说"添加xxx网站/待办/商品/记账记录"等批量操作时调用本技能按规范改写 JSON，并提示用户后续在 Web 端导入/同步。"
---

# easy-web-tab 备份 JSON 编辑器（backup.json Editor）

**触发时机**（本技能必须被调用的场景）：
- 用户**明确提到**：修改备份文件、backup.json、工作台备份、销售记账备份、导航备份、图标备份、离线批量加网站/待办/商品、改完同步/导入、坚果云里的备份等；
- 用户用自然语言说："帮我添加 xxx 网站 / 帮我批量插入这些待办 / 把这些商品录入到备份里 / 改一下这个分类下的网站"等**对数据集合做写入操作、希望落盘后由 web 端导入**；
- 用户提供了"一个现成的 backup.json /工作台备份-xx.json / 销售记账备份-xx.json / 导航导出 .md 文件"的路径，要求做 CRUD；
- 用户**没给具体路径但提到备份**时，优先使用下面「默认路径解析」规则自动定位文件，不要上来就问用户"路径在哪"。

**禁止场景**（不要硬套本技能）：
- 用户只是问 "怎么导出/怎么同步/云同步怎么用" → 直接回答，不要编辑 JSON。
- 用户明确说要"在 UI 上改/直接生效" → 应该去改 store、组件、IDB，而不是备份 JSON。

---

## 零、默认路径解析（用户没给路径时按此顺序自动查找，不要先问用户）

### 0.1 坚果云同步根目录（固定，已按用户本机环境固化）

```
默认根目录：C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\
```

**查找优先级**（按顺序尝试，命中即停）：

| 优先级 | 目标文件 | 对应格式 | 说明 |
|---|---|---|---|
| 1 | `C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\backup.json` | 格式 A 工作台 v9 | **主文件**，日常云同步写入的就是这个（backup.json 文件名是项目 Web 端云同步 `syncWorkbenchBackup` 硬编码的落盘名，也是坚果云「1」同步文件夹里 easy-web-tab 子目录的标准名） |
| 2 | `C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\backup - 副本.json` | 格式 A 工作台 v9 | 用户手动备份副本，仅在优先级 1 不存在时才用，**修改后要提醒用户主文件不存在，改的是副本** |
| 3 | `C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\销售记账备份-*.json` | 格式 B 销售记账 v1 | 用 Glob 匹配，取最新修改时间的一个 |
| 4 | 用户提到的其他路径 / `下载` / `桌面` 里的备份文件 | 按特征识别 | 以上都没命中才问用户 |

### 0.2 四种备份的默认文件名（用于"用户没给文件名，但说要改销售记账备份"等场景）

| 备份类型 | Web 端导出默认文件名 | 坚果云同步默认名（本技能默认路径解析） |
|---|---|---|
| 格式 A 工作台 v9 | `工作台备份-YYYY-MM-DD.json` | **`backup.json`**（Web 端云同步 push 时硬编码此名） |
| 格式 B 销售记账 v1 | `销售记账备份-YYYY-MM-DD.json` | 无云同步硬编码名，Glob `销售记账备份-*.json` 取最新 |
| 格式 C 导航 Markdown | `myself-sites.md` / 用户下载重命名 | 不在坚果云同步路径（导航数据已内嵌工作台 backup.json → prefs） |
| 格式 D 图标导出 | `custom-icons.json` | 不纳入同步（用户明确要求排除图标） |

### 0.3 判定流程（严格执行）

```
用户说"给 backup.json 加 xxx" 但没给路径
  → 先 LS C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\
    → 存在 backup.json ⇒ 用它（格式 A）
    → 不存在但有 backup - 副本.json ⇒ 用它 + 提示用户
    → 都没有 ⇒ 再 Glob 销售记账备份-*.json
    → 都没命中 ⇒ 才问用户具体路径
```

---

## 一、先识别：用户说的 backup.json 是哪一种？四种备份格式

easy-web-tab 一共有 **4 个完全独立的导出入口**，对应 **4 种** 文件格式/信封。动手前先让用户提供文件路径或贴开头 5~10 行；或用 `Read` 工具读取文件前 40 行后**基于特征键判断**：

### 格式 A：工作台备份 JSON（用户最常见的「backup.json」）
- **下载入口**：工作台头部「导出」按钮，文件名默认 `工作台备份-YYYY-MM-DD.json`
- **识别特征**：顶层有 `version: 9`（当前版本；以后 10+ 也属于本类）、且顶层有 `todos/notes/diary/countdowns/passwords/health/ledger/settings/business` 这些键
- **数据层归属**：`src/types/index.ts` → `WorkbenchData`；导入走 `src/composables/useIdb.ts` 的 `idbImportAll`（写入 IndexedDB v6 全部 store）
- **"添加 xxx 网站"到底能不能写进这个文件？——可以，但不是直接写到数组里的 todos/sites**：
  工作台备份里没有一级 `sites` 数组（网址属于导航 localStorage），它的 `prefs` 字段里**包含** `user-sites` / `user-categories` / `user-search-engines` 等导航数据（JSON 字符串嵌套在 prefs 字典里）。
  所以用户说"给 backup.json 加 xxx 网站"时，**真正要改的是 `prefs["user-sites"]`（解析为 Site[] 后 push 再序列化回去）**。

### 格式 B：销售记账独立 JSON
- **下载入口**：销售记账页面头部右侧「📤 导出」，文件名默认 `销售记账备份-YYYY-MM-DD.json`
- **识别特征**：顶层 `type === 'business-backup' && version === 1`，且顶层有 `data.products / data.purchases / ...` 七字段
- **数据层归属**：`src/views/BusinessView.vue` 导出逻辑 + `src/stores/workbenchBusiness.ts` 的 `importData`
- **写入规则**：所有新增/修改一律在 `payload.data.<xxx>` 下进行（不要去改工作台备份的顶层 `business` 字段，虽然字段同形，但销售记账独立备份**只认 `data.` 包裹**，不认得顶层字段）。

### 格式 C：导航导出 Markdown（mysites.md / 导航导出.md）
- **下载入口**：管理页顶部「⚙️ 设置」→「📤 导出」按钮（触发 `sitesStore.exportToMarkdown()`）；文件为 **Markdown**，不是 JSON
- **识别特征**：扩展名 `.md`；或文件开头有 YAML frontmatter + `- [xxx](url)` 语法
- **数据层归属**：`src/stores/sites.ts` `exportToMarkdown`；对应 `src/composables/useMarkdown.ts` 解析（导入走 `importFromMarkdown`）
- **写入规则**：不要按 JSON 路径操作；按 "frontmatter 区（Categories / Engines / Passwords / Countdowns）+ 每个分类的链接列表" 的 Markdown 结构追加。

### 格式 D：图标导出 JSON（IconManager 下载）
- **下载入口**：「🎨 图标管理」→「📤 导出」
- **归属**：`src/stores/icons.ts` + `src/components/IconManager.vue`
- 通常**不在本技能处理范围**（图标文件以 dataURL 存在，体积巨大；用户极少会说"给图标备份加一条"）。若用户明确要求，必须先问清需求，不要自作主张在 base64 字符串上硬拼。

**核心判断流程（严格执行）：**
```
拿到文件 → Read 前 40 行
  → 含 type: 'business-backup'       ⇒ 格式 B（销售记账独立）
  → 含 version 且 顶层 todos/notes  ⇒ 格式 A（工作台 v9）
  → 扩展名 .md + YAML + 链接列表     ⇒ 格式 C（导航 Markdown）
  → 其他                              ⇒ 先问用户，不要盲写。
```

---

## 二、格式 A：工作台备份 v9（WorkbenchData）详细结构与写入规范

### 2.1 一级字段一览（与 src/types/index.ts: WorkbenchData 对齐，少一个都不行）

```json5
{
  "version": 9,             // 固定写 9；导入时 <1 || >9 直接拒绝（安全门）
  "exportedAt": "2026-08-23T12:00:00.000Z",  // ISO 字符串，不改也可，写入时通常保留原值或刷新到"现在"
  "todos": [],              // WorkbenchTodo[] —— 见 2.2
  "notes": {                // NoteData（注意是对象，不是数组！）
    "categories": [],       // NoteCategory[]
    "notes": []             // WorkbenchNote[]
  },
  "diary": {                // DiaryData（对象，不是数组！）
    "entries": []           // WorkbenchDiary[]
  },
  "countdowns": [],         // Countdown[]
  "passwords": "",          // 加密 blob 字符串，**永远不要手改/清空/伪造**；要跳过密码导入就设 ""
  "health": {               // HealthData
    "height": 175,          // 可选 number
    "plans": { "exercise": {}, "diet": {}, "sleep": {} },
    "records": {
      "exercise": [],
      "diet": [],
      "sleep": [],
      "weight": []
    }
  },
  "ledger": {               // LedgerData
    "categories": [],       // LedgerCategory[]（内置 8 组不可删）
    "entries": []           // LedgerEntry[]
  },
  "settings": {             // AppSettingsData（见 AGENTS.md）
    "dialogSizes": {},
    "buttonOpacity": 1,
    "bgOpacity": 1
    // ... 其他可选字段（云同步配置、工作台菜单、提醒邮箱 等）
  },
  "pomodoro": {},           // v5 新增，番茄钟数据；目前 unknown 占位，原样保留即可
  "habits": {},             // v5 新增，习惯打卡数据；原样保留
  "business": {             // v7 新增；嵌套 BusinessData（与销售记账独立备份 data.* 结构相同）
    "productCategories": [], "expenseCategories": [],
    "products": [], "purchases": [], "dailyRecords": [],
    "expenses": [], "settings": {}
  },
  // v8 身份字段：成对出现才有效，手改会导致密码库无法解锁——**禁止手改**
  "passwordsSalt": "6f...",          // PBKDF2 盐 hex
  "passwordsVerification": "U2F...", // 主密码验证密文
  // v9 同步字段（云同步/多设备用，手改备份时保持、或按需删除即可）
  "clientId": "xxx-uuid-v4",
  "pushedAt": 1754642400000,         // 数字 ms 时间戳
  "prefs": {
    // v9 里的「导航网址/分类/搜索引擎/主题/偏好」都在这里
    "user-sites":       "[{\"name\":\"xxx\",\"url\":\"https://...\"}, ...]",  // JSON 字符串嵌套！必须 parse/stringify
    "user-categories":  "[{\"id\":\"video\",\"name\":\"视频音乐\",...}]",     // JSON 字符串
    "user-search-engines": "[...]",
    "built-in-engine-overrides": "{\"baidu\":\"https://...\"}",
    "built-in-engine-default": "\"baidu\"",
    "user-theme":        "\"dark\"",       // JSON 字符串（'dark'/'light'）
    "user-background":   "\"bg10.jpg\"",   // JSON 字符串
    "user-countdown-categories":  "[...]",
    "user-countdown-tab-categories": "[...]",
    "user-countdown-sort": "{\"mode\":\"next\"}",
    "user-todo-categories": "[...]",
    "user-todo-tab-categories": "[...]"
    // 注意：prefs 下**不包含** password-salt-v2 / password-verification-v2 / user-custom-icons
    // 加密身份与图标不归入备份（见 useIdb.ts WORKBENCH_PREFS_KEYS）。
  }
}
```

**超级关键的"容易踩坑点"（手改 backup 最多的 bug 来源）：**
1. `notes` / `diary` 是**对象**，不是数组。`notes.notes` 才是真正的便签数组；`diary.entries` 才是日记条目数组。AGENTS.md 的 DIARY KEY GOTCHAS 明确写过：IDB store 'diary' 存的是 `{ entries }` 对象，你把 diary 改成数组就会导致「保存后刷新日记全部丢失」。
2. `prefs.*` 的 value **全部是 JSON 字符串**（不是对象/数组）。比如 `prefs["user-sites"]` 是 `"[{...},{...}]"`，不是 `[{...},{...}]`。改的时候必须：
   ```
   JSON.parse(prefs["user-sites"]) → push(site) → JSON.stringify(...)
   ```
3. `version` 必须是整数 9；不要写成 `"9"` 字符串，也不要手动降到 8（导入范围守卫会拒绝）。
4. `passwords / passwordsSalt / passwordVerification` 三个**禁止手动编辑**。如果用户不关心密码库，可以把 `passwords: ""`、`passwordsSalt/passwordVerification` 整个键都删掉（导入时会按"未内嵌身份"路径跳过密码导入）。**不要保留 Salt 再自己伪造 passwords 空串或别的值**，会导致设备身份被错误接管进而整个密码库锁死。

### 2.2 常用子类型（新增条目时字段模板）

#### 添加一个「网站」→ 写 prefs["user-sites"]
```json5
// 类型：Site[]，来源 src/types/index.ts
{
  "name": "哔哩哔哩",
  "url": "https://www.bilibili.com",
  "description": "",        // 可选，留空 "" 也行
  "category": "video",      // 对应 Category.id（内置 video/other + 自定义 id）
  "tags": ["娱乐"],         // 字符串数组；空数组填 []
  "icon": "",               // 可选；留空 ""（页面会自动走 Google Favicon）
  "sort": 10,               // 数字，越小越靠前；新增建议 = 已有最大 sort + 1
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

#### 添加一个「待办」→ 写 todos[]（WorkbenchTodo）
```json5
{
  "id": "td_20260823_120000",  // 唯一；前缀 td_ 不是强制，但统一更易识别
  "title": "写周报",
  "description": "",           // 可选
  "priority": "medium",        // low | medium | high
  "dueDate": "2026-08-25",     // 可选 YYYY-MM-DD
  "completed": false,
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z",
  "color": "#3b82f6",          // 可选；8 预设之一见 TODO_COLOR_PRESETS
  "categoryId": "cat_work"     // 可选；undefined/"" = 未分类
}
```

#### 添加一条「倒计时」→ countdowns[]（Countdown）
```json5
{
  "id": "cd_20260823_120000",
  "name": "中秋放假",
  "endDateTime": "2026-09-17T00:00",   // 本地时间 YYYY-MM-DDTHH:mm，不带时区
  "repeat": null,                      // 一次性；按年重复 → {"type":"yearly"}
  "category": "life",                  // work / life / study / exercise / diet / sleep + 自定义字符串
  "createdAt": "2026-08-23T12:00:00.000Z",
  "updatedAt": "2026-08-23T12:00:00.000Z",
  "showOnDisplay": true,
  "color": "#22c55e"
}
```

#### 「便签」/「日记」/「记账」/「健康记录」/「习惯」/「番茄钟」等
一律以 `src/types/index.ts` 中对应 interface 为**唯一字段真源**，不要凭记忆猜字段名。
- 便签新增时：**normal 类型绝对不要写 `entries` 字段**（normalizeNoteData 会强制剥离，虽然不报错但污染 JSON）。
- 日记新增时：`date` 为本地 `YYYY-MM-DD`，不能重复；`id` 规范前缀 `dy_`。
- 记账：`categoryId` 必须能在 `ledger.categories[*].id` 中找到（内置 salary/mortgage/carloan/breakfast/lunch/dinner/commute/daily 共 8 个）。

---

## 三、格式 B：销售记账独立 JSON（business-backup v1）详细结构与写入规范

### 3.1 信封
```json5
{
  "type": "business-backup",  // 固定，改了导入会拒绝
  "version": 1,               // 固定，改了会拒绝
  "exportedAt": "2026-08-23T12:00:00.000Z",
  "data": {                   // 所有数据都必须在 data 下（这是独立备份 vs 工作台 backup.business 的最大区别点）
    "productCategories": [],  // BusinessProductCategory[]；内置 5 种子（小吃/饮品/水果/日用/服装）可删
    "expenseCategories": [],  // BusinessExpenseCategory[]；内置 5（摊位费/燃气费/调料包装/交通费/其他）不可删
    "products": [],           // BusinessProduct[]（商品）
    "purchases": [],          // BusinessPurchase[]（进货）
    "dailyRecords": [],       // BusinessDailyRecord[]（收摊日记录；date 唯一 upsert）
    "expenses": [],           // BusinessExpense[]（支出记录）
    "settings": {             // BusinessSettings
      "stallName": "老王的烤冷面",
      "lowStockThreshold": 20
    }
  }
}
```

### 3.2 新增常见条目模板
- 商品 product：`bp_` 前缀；`categoryId` 缺省 = 未分类；`active: true`（在售）
- 进货 purchase：`bpr_` 前缀；`productId` 必填（要对应 products[*].id）；`total = quantity × unitPrice`（必须真实乘，不要手写 0 让 UI 补——备份导入不走表单计算）
- 收摊 dailyRecord：`bd_` 前缀；`date` `YYYY-MM-DD` 必须唯一（upsert 语义，两条同 date 会只存一条）；`items[*].productId` 全量校验
- 支出 expense：`be_` 前缀；`categoryId` 必填（内置 5 个）

所有 interface 以 `src/types/index.ts` 中 `BusinessProduct / BusinessPurchase / BusinessDailyRecord / BusinessExpense / BusinessExpenseCategory / BusinessProductCategory` 为真源。

---

## 四、格式 C：导航导出 Markdown（.md）写入规范

**结构固定 4 段（按 useMarkdown.ts 解析规则）：**

```markdown
---
title: 我的导航
lastUpdated: 2026-08-23
categories: |-
  - id: video
    name: 视频音乐
    icon: 🎬
    isBuiltIn: true
    sort: 1
searchEngines: |-
  - id: baidu
    name: 百度
    url: https://www.baidu.com/s?wd=
    isBuiltIn: true
---

## 🎬 视频音乐

- [哔哩哔哩](https://www.bilibili.com)
  - description: 追番
  - tags: 娱乐,视频
  - icon: bilibili.svg
```

写入规则：
1. 追加网站 → 先在 frontmatter `categories` YAML 块里找到对应分类；如果用户要的分类不存在，**先向 categories 列表追加新分类**，再在正文对应 `## <图标> <分类名>` 下添加一条 Markdown 链接 `- [name](url)`；
2. 属性行（description/tags/icon）用 2 空格缩进 + `- tags: ...` 格式；
3. 用户说"批量加这些网站"而没给分类时 → 默认落到 `other` / `其他` 分类（必须在 categories 中保证 other 存在，若没有就先加）。
4. 导入时是按 URL 去重的（`importFromMarkdown` 里 `validSites.filter + 本地 merge`），所以重复 URL 不会污染数据，但**不要主动制造重复条目**；写 JSON backup 时同理：URL 重复要先问用户是否覆盖。

---

## 五、通用工作流（对任何备份格式都要执行）

### Step 0：路径解析（用户没给具体路径时必须先做）
**不要上来就问"文件在哪"**，按「零、默认路径解析」执行：
```
1. LS C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\
2. 若有 backup.json → 目标文件 = 它（格式 A 工作台 v9），记录来源为「坚果云同步主文件」
3. 若无但有 backup - 副本.json → 目标文件 = 它，记录来源为「坚果云同步副本」（后面 Step 5 要提示用户）
4. 若无但有 销售记账备份-*.json → Glob 拿最新一个（格式 B）
5. 以上都没有 → 才问用户给具体路径
```
**关键点**：如果目标文件路径 = 坚果云默认目录，则后续 Step 5 的「下一步生效方式」要走「云同步专用流程」而不是通用导入流程。

### Step 1：确认文件 & 保存原文件副本（**必须做**）
在写任何修改之前，先把原文件**复制一份**为 `<原文件名>.bak.YYYYMMDD-HHMMSS`（或加后缀 `.orig`），避免改错后用户无法回滚。
```
例：backup.json → backup.json.bak.20260823-173000
例：销售记账备份-2026-08-23.json → 销售记账备份-2026-08-23.json.bak.20260823-173000
```

### Step 2：校验 JSON 合法性
如果是 JSON 文件：
```
Read 完整内容 → 能 JSON.parse 通过 → 进入修改。
如果解析失败：先向用户报告哪一行报错，不要硬修。
```

如果是 Markdown：先用 `## <分类名>` 分段结构肉眼扫一遍，找不到 `---` frontmatter 就要先问用户，不要直接 append。

### Step 3：按格式 A/B/C 对应规范写入，字段默认值遵循：
- **所有新增 ID 必须全局唯一**：格式 `前缀_YYYYMMDD_HHmmss_XXXX`（例 `td_20260823_173000_a1b2`、`bp_20260823_173000_c3d4`、`ld_20260823_173000`、`bd_20260823_173000`、`dy_20260823`），末尾 4 位随机 hex 防同秒内冲突，不要用裸数字 `1/2/3`（导入会与存量冲突）。
- **时间戳**：`createdAt / updatedAt / exportedAt` 一律用 `new Date().toISOString()` 格式（ISO 8601，带 `Z` UTC）。
- **date 字段**（日记/收摊/记账/待办 dueDate）：一律本地 `YYYY-MM-DD`（不要 UTC 偏移后的日期）。
- **数字字段**（数量/金额/库存/阈值）：都是 number，不要传字符串。金额一律以「元」为单位精确到 2 位或整数即可；无需字符串化。
- **布尔字段**（`completed/pinned/active/isBuiltIn/showOnDisplay/showInTabs/emailReminder` 等）：写 JSON 原生 `true/false`，不要写成 "true" 字符串。
- **undefined / 可选字段缺失**：直接省略键（比 `null` 更干净；但 AGENTS.md 明确 "undefined = 未分类" 的 categoryId 类字段，可以写 `null` 或省略都可，导入会经 normalize 层归一为 undefined）。
- **真实 backup.json 已核实的字段存在性（来自 C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\backup.json 2026-08-23 快照）**：
  - 顶层**一定有**：version=9、exportedAt、todos[]、notes{categories,notes}、diary{entries}、countdowns[]、passwords(加密串)、health{height,plans,records}、ledger{categories,entries}、settings{含 cloudSyncEnabled=true 云同步配置、workbenchMenu 工作台菜单、reminderEmail 提醒邮箱等}、pomodoro{}、habits{habits,records}、business{七字段}、passwordsSalt、passwordVerification、prefs{user-sites 等}
  - 顶层**可能缺失**：clientId、pushedAt（老备份未走云同步 push 时没有，导入/修改时可补可不补，不影响）
  - 写入时：**不要自作主张删除 passwordsSalt/passwordVerification/passwords 三个键**（用户明确要求删才动）；clientId/pushedAt 如果原本缺失、就不要补，保持原状。

### Step 4：保存 & 回验
保存 JSON 后，**再 Read 一遍并做至少以下验证**（验证项按文件格式来）：
- 格式 A：
  1. `version === 9`（整数，不是字符串）
  2. `Array.isArray(todos) === true`、`Array.isArray(countdowns) === true`
  3. `typeof notes === 'object' && !Array.isArray(notes)`、`typeof diary === 'object' && !Array.isArray(diary)`（diary 不是数组、notes 不是数组——这是最高频的手改 bug）
  4. `typeof prefs === 'object' && !Array.isArray(prefs)`（若有）
  5. `prefs['user-sites']` 存在则 `JSON.parse(prefs['user-sites'])` 必须能通过（没 parse 错）
  6. 如果原始有 `passwordsSalt / passwordsVerification`，修改后**这两个键的值不能变**（逐字符比对，哪怕手改了一个字符都会导致密码库锁死）
- 格式 B：
  1. `type === 'business-backup' && version === 1`
  2. `data && typeof data === 'object' && !Array.isArray(data)`
  3. `Array.isArray(data.products) && Array.isArray(data.purchases) && Array.isArray(data.dailyRecords)`
- 格式 C：
  1. 开头 `---`，倒数第二个块 `---`
  2. 每个 `##` 标题下至少有一个链接，或 categories 列表不为空

### Step 5：**必须**向用户说明下一步怎么让数据进 Web 端
**这是本技能的收尾——不要帮用户"假设他知道"，一定要写清楚。分两种场景：**

#### 场景 A：目标文件在坚果云默认同步目录 `C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\backup.json`（最常见）

```
✅ 备份已写入坚果云同步目录：C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\backup.json
（如使用了 backup - 副本.json：⚠️ 本次修改的是副本文件，后续需要手动覆盖主文件或改名后再同步。）

📋 接下来在 Web 端生效的两种方式（推荐方式 A）：

方式 A（推荐，利用云同步冲突机制）：
  1. 确保坚果云客户端已运行，等待本地文件同步到云端（通常几秒到 1 分钟，坚果云托盘图标 → 「同步完成」）；
  2. 在浏览器打开工作台页面 → 右上角头像/⚙️ → 云同步 → 点「立即同步」；
  3. 此时会检测到「远端文件比本地新、且本地有 dirty」= 冲突，弹出冲突解决框；
  4. 选择 **「远端覆盖本地」** → 确认后，你刚才改的 backup.json 内容就会完整写入当前设备的 IndexedDB，页面自动刷新。
  5. 其他设备：同样打开页面 → 切后台再切回来（或手动点立即同步）→ 也会拉取新数据。

方式 B（不走云同步、本地直接导入）：
  不通过坚果云，直接在工作台页面头部点「导入」→ 选择 C:\Users\YangLiJuan\Nutstore\1\easy-web-tab\backup.json → 确认覆盖 → 数据立即落地，且会被标记为 dirty，下次同步时会把你的修改再推送回坚果云。

（如果改的是销售记账独立备份：入口是「销售记账」页面右侧「📥 导入」按钮，不要跑到工作台去导入。）
```

#### 场景 B：目标文件不在坚果云同步目录（如下载文件夹、用户自定义路径）

```
✅ 备份 JSON 已写入。接下来在 Web 端生效：

方式（通用导入）：
  格式 A 工作台备份 → 工作台页面头部「导入」→ 选本文件 → 确认覆盖。
  格式 B 销售记账备份 → 销售记账页面右侧「📥 导入」→ 选本文件。
  格式 C 导航 Markdown  → 管理页 ⚙️ →「📥 导入」→ 选本文件。
  导入完成后，数据会被标记为 dirty；如已开启云同步，下次「立即同步」或切换标签页时会自动推送到坚果云，其他设备再拉取即可。
```

---

## 六、常见自然语言指令 → 修改目标映射表（速查）

| 用户说法 | 对应目标位置（按格式 A 工作台 backup） |
|---|---|
| "添加 xxx 网站 / 加几个网站到导航里" | `prefs["user-sites"]` → parse → push → stringify；同时确认 `prefs["user-categories"]` 里对应分类存在，不存在就先加 |
| "改一下某个网站的分类/排序/描述" | `prefs["user-sites"]` parse 后按 URL 定位条目，改对应字段再序列化 |
| "添加待办 / 批量加待办" | 顶层 `todos[]` push 新 WorkbenchTodo |
| "把这个待办标为已完成" | `todos.find(t => t.title === 'xxx').completed = true`；同时改 `updatedAt` |
| "添加倒计时 / 加节日提醒" | 顶层 `countdowns[]` push Countdown |
| "记一笔 8 月 24 日发工资 / 早餐/通勤" | `ledger.entries[]` push LedgerEntry（categoryId 对应内置 8 个） |
| "写一篇今天的日记" | `diary.entries` push WorkbenchDiary（date 本地今天；若同 date 已存在就 upsert = 覆盖旧 content，id 保持） |
| "添加便签 / 时光轴" | `notes.notes[]` push WorkbenchNote（type=timeline 才允许带 entries 数组） |
| "加一组运动计划 + 今天跑了 5 公里" | `health.plans.exercise` + `health.records.exercise[]` push ExerciseRecord |
| "批量加商品 / 进货 / 记今天出摊营业额" | 若是**销售记账独立备份**：`data.products / data.purchases / data.dailyRecords[*].items`；若是工作台备份：`business.products / business.purchases / business.dailyRecords` |
| "把密码库相关的字段清空，只改其他数据" | 删掉 `passwordsSalt` 和 `passwordVerification`，把 `passwords` 设成 ""；并在结果提示里说明"密码导入已被跳过" |
| "把云同步配置关掉 / 改 WebDAV 账号" | `settings.cloudSyncEnabled` / `cloudSyncUrl` / `cloudSyncUsername` / `cloudSyncPassword`（注意这是 IDB 里的 settings，会在 `idbImportAll` 里被覆写，这意味着导入会替换本机当前的云同步配置）|

---

## 七、修改前的"安全检查清单"（每次调用本技能都执行）

在真正写 Edit/Write 工具之前：

1. ✅ 已 `Read` 整个目标文件内容，不是"改一部分不知道剩下的"
2. ✅ 已识别是格式 A / B / C 哪一种（按一级特征键）
3. ✅ 已备份原文件（加 `.bak` 后缀副本）
4. ✅ 新增条目的 id 与现有 id 不冲突（用 grep 或 unique 检查过）
5. ✅ 没有手改 `passwords / passwordsSalt / passwordVerification`（除非用户明确说要删密码字段）
6. ✅ 写入后再次 Read 并 JSON.parse 通过
7. ✅ 告诉了用户下一步怎么在 Web 端导入（两种方式择其一，入口要对应格式）

---

## 八、交叉参考（真源文件，遇到字段存疑就查）

- WorkbenchData / BusinessData / Site / Countdown / WorkbenchTodo / NoteData / DiaryData / HealthData / LedgerData：`src/types/index.ts`
- 工作台备份导入/归一化守卫（version 范围、diary/notes 对象形状、prefs 回写）：`src/composables/useIdb.ts`（`idbImportAll`）
- 工作台备份导出打包（prefs 白名单、v9 信封）：`src/composables/useIdb.ts`（`idbExportAll`、`WORKBENCH_PREFS_KEYS`）
- 工作台 UI 导入逻辑：`src/views/WorkbenchView.vue` 的 `handleExport / handleImportFile`
- 销售记账备份 UI 导入：`src/views/BusinessView.vue` 的 `handleBusinessExport / handleBusinessImportFile`
- 导航 Markdown 解析/导入：`src/stores/sites.ts` `importFromMarkdown` + `src/composables/useMarkdown.ts`
- 销售记账纯逻辑（商品引用禁删/内置分类补回/库存计算）：`src/composables/businessCore.ts`（`normalizeBusinessData` 等）

---

## 九、输出规则（成功记录后，覆盖 Step 5 的输出要求）

**当技能执行成功（备份已写入并回验通过）后，输出内容只保留以下一句，不要输出其他任何内容：**

```
已记录完成：<备份记录名>，数据写入 <模块名> 模块。
```

其中：
- 「备份记录名」= Step 1 生成的原文件副本文件名，即 `<原文件名>.bak.YYYYMMDD-HHMMSS` 形态（例：`backup.json.bak.20260823-173000`）。
- 「模块名」= 数据实际写入的模块名称，如 `diary`（日记模块）、`notes`（便签模块）、`todos`（待办模块）、`ledger`（记账模块）、`health`（健康模块）、`countdowns`（倒计时模块）、`prefs["user-sites"]`（导航网站）等，按本次实际写入的位置填写。

**禁止在成功输出中包含以下内容**（这些是本规则要刻意省略的）：
- 验证细节（如 `version === 9`、`JSON.parse 通过` 等回验过程）
- 操作步骤（如修改了哪个字段、push 了几条）
- Web 端生效方式 / 导入指引（即 Step 5 场景 A / 场景 B 的整段说明——**本规则覆盖 Step 5，成功时不再输出**）
- 其他冗余的提示或解释

**说明**：
- 本规则仅在「执行成功」时生效；若执行失败、遇阻需要用户决策、或文件不合法需用户确认，则不受本规则限制，应如实报告问题并请求用户输入。
- Step 5 中关于「必须向用户说明下一步怎么让数据进 Web 端」的要求，在成功场景下被本规则覆盖；但 Step 5 的判定逻辑（目标文件是否在坚果云默认目录）仍需执行，仅是不再向用户输出该说明。
