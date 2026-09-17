# 家庭家谱管理 · 需求文档（草案 v0.1）

> 状态：需求草案 v0.2，范围与关键决策已全部确认。尚未进入设计/实现。
> 目标读者：产品（你）+ 实现（AI）。本文先讲清「家谱如何新增 / 删除 / 建立关系」，再给完整功能需求。

---

## 1. 背景与目标

当前个人工作台已覆盖待办 / 便签 / 日记 / 健康 / 记账等，但缺少「家庭关系」维度。家庭成员的生卒、辈分、亲属关系散落在各处，没有一个统一入口。

**目标**：在个人工作台新增「家庭家谱」面板，支持：

- 录入家庭成员（基本信息）
- 建立亲属关系（父母 / 子女 / 配偶）
- 查看家谱树（以某人为根展开）
- 搜索、编辑、删除

**本期非目标（留作扩展）**：照片 / 头像上传、家庭大事件时间轴、纪念日、遗传病史、GEDCOM 标准导入导出、多人协同编辑。本期仅做：成员 + 关系 + 树视图 + 搜索 + 云同步（加密）。

---

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| 成员 Person | 家族中的一个具体的人 |
| 亲子边 | 父 / 母 → 子 的单向关系 |
| 配偶边 | 互为配偶（支持多段婚姻） |
| 派生关系 | 子女、兄弟姐妹、祖孙、叔舅姑姨、侄甥等，由亲子 / 配偶边计算得出，**不单独存储** |

---

## 3. 核心数据模型（重点）

采用「成员为中心 + 最小边」模型：只存两类最小关系边，其余全部运行时派生。这样新增 / 删除 / 解除关系都只是数组的增删，不会因关系冗余而互相矛盾。

### 3.1 成员 Person

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string(uuid) | 是 | 主键 |
| `name` | string | 是 | 姓名 |
| `gender` | `'male' \| 'female' \| 'unknown'` | 否 | 性别，影响「父 / 母」的展示语义 |
| `birthDate` | string? (`YYYY-MM-DD`) | 否 | 出生日期 |
| `deathDate` | string? | 否 | 逝世日期，在世则为空 |
| `birthPlace` | string? | 否 | 出生地 |
| `note` | string? | 否 | 备注 |
| `order` | number | 否 | 同辈排序权重 |
| `createdAt` / `updatedAt` | number | 是 | 时间戳 |

### 3.2 关系（只存两类最小边）

每位成员上挂两个数组：

- `parents: string[]` —— 存父母 id（通常 0~2；继 / 养父母可 >2，模型天然支持）
- `spouses: string[]` —— 存配偶 id（双向；支持多段婚姻）

**不单独建 relationship 表**。派生关系全部由这两个数组反推：

```
children(x)  = { p | p.parents 含 x }                       // 子女
siblings(x)  = { p | p≠x 且 p.parents 与 x.parents 有交集 } // 兄弟姐妹（同父异母/同母异父=共享一方）
grandparents(x) = union(parents(x).flatMap(parents))         // 祖父母/外祖父母
grandchildren(x)= union(children(x).flatMap(children))       // 孙子女
```

---

## 4. 功能需求

### 4.1 成员管理（新增 / 编辑 / 删除）
- **新增成员**：可独立新增（只填基本信息），也可在某节点上「加子女 / 加配偶 / 加父母」联动新增并自动建关系（见 5.1）。
- **编辑**：改基本信息。
- **删除**：见 5.2。

### 4.2 关系管理（建立 / 解除）
- **建立亲子**：在子节点 `parents` 加入父母 id（展示层统称「父母」，**本期不区分亲生 / 继 / 养**）。
- **建立配偶**：双向互相加入 `spouses`（**本期 UI 仅支持一对一配偶**，不处理多配偶 / 再婚特殊交互；数据层保留数组以便将来扩展）。
- **解除关系**：仅移除对应边，不删人（见 5.2）。

### 4.3 家谱视图
- **树 / 图谱视图**：以某成员为展开中心（点击任意节点即可以其为根展开）；**支持标记「主根」**——用户可指定一个成员（如「我」）为主根，作为家谱树默认展开中心，存于面板设置 `rootId`（未标记时退化为以所有「无父母」成员为根）。
- **支持「森林」**：以标记的主根（或所有「无父母」成员）为根节点列出；现实中存在多个无共同祖先的家族分支时，分别展示，不能假设只有一棵树。
- **折叠 / 展开**分支；点击节点看详情、编辑、加关系。
- **列表视图**：表格（姓名、性别、生卒、关系数、备注）+ 搜索 + 分页。
- 视图切换、分页器、弹框按钮顺序、删除二次确认均**复用现有工作台惯例**（见第 6 节）。

### 4.4 搜索与筛选
- 按姓名、性别（男 / 女 / 未知）、在世 / 已故、备注关键字搜索。

### 4.5 导入导出 / 云同步
- 并入**个人工作台信封 `workbench.json`**（云同步已拆为 nav/icons/workbench/business/student 五份信封；个人工作台、销售记账台、学生工作台即三类「workspace」阶层，各占一份信封）。家谱是工作台的一个面板，数据随 `workbench.json` 整包同步，**不新增独立信封**。
- 实现上需扩展 `useIdb.ts` 的 `exportWorkbench` / `importWorkbenchData` / `mergeWorkbench` / `reloadWorkbenchStores`：导出时纳入家谱 store、导入时落库、合并时按 id 字段级并集、拉取后 reload。
- 可选增强：本面板单独 JSON 导出 / 导入；远期支持 GEDCOM（家谱国际标准格式）。

---

## 5. 关键逻辑分析（重点：新增 / 删除 / 建立关系）

### 5.1 新增

**新增成员**
1. 生成 uuid，组装 Person 对象写入 IDB。
2. 若由「在某节点上加关系」触发，则在写人的同时建立关系（见下）。

**新增关系（建立）**
- 设为父母：`child.parents.push(parentId)`。
- 设为配偶：`a.spouses.push(b.id); b.spouses.push(a.id)`（双向）。
- **幂等**：若边已存在则跳过，避免重复边导致派生关系算重。

```
function addParent(child, parentId):
  if parentId not in child.parents: child.parents.push(parentId)

function addSpouse(a, b):
  if b.id not in a.spouses: a.spouses.push(b.id)
  if a.id not in b.spouses: b.spouses.push(a.id)
```

### 5.2 删除（最容易出坑，需谨慎）

**删除成员 X**
1. **清理悬空引用（必须）**：遍历所有成员，从各自的 `parents` / `spouses` 中移除 `X.id`。否则会出现「幽灵父母 / 幽灵配偶」——界面显示某人有个不存在的亲属。
2. **X 的子女保留为孤儿**：家谱删一个人 ≠ 删其后代。子女变为「父母信息缺失」（孤儿），其 `parents` 中已无 X。**本期不做级联删除后代**（不提供该选项），避免误删一大片；用户如需移除某支，可逐个删除。
3. 删除走 `el-messagebox` 二次确认，明示「将删除 1 人」。

**解除关系（不删人）**
- 解除亲子：从子节点 `parents` 移除该父 / 母 id。
- 解除配偶：双向互相移除。
- 同样要清理**对方的反向引用**（配偶是双向的，只删一边会留半边幽灵）。

```
function deleteMember(X):
  for each member m:
    m.parents  = m.parents.filter(id => id !== X.id)
    m.spouses  = m.spouses.filter(id => id !== X.id)
  idbDelete('family_members', X.id)

function unlinkParent(child, parentId):
  child.parents = child.parents.filter(id => id !== parentId)

function unlinkSpouse(a, b):
  a.spouses = a.spouses.filter(id => id !== b.id)
  b.spouses = b.spouses.filter(id => id !== a.id)
```

> 删除一律走二次确认；级联删后代为高危操作，需额外确认且明示「将删除 N 人」。

### 5.3 建立关系的校验（防错）

| 校验 | 规则 | 处理 |
| --- | --- | --- |
| 禁止自引用 | 不能把 X 设为 X 的父母 / 子女 / 配偶 | 直接拒绝 |
| 禁止环 | 若要建立 X 是 Y 的父母，须保证 Y 不是 X 的祖先 | 见 5.4，拒绝 |
| 配偶软校验 | 建议性别不同 | 仅警告，可忽略 |
| 重复边 | 边已存在 | 跳过（幂等） |

### 5.4 环检测算法（伪代码）

亲子边成环的条件是：新父是子节点的后代。

```
// 沿 parents 向上遍历 ancestor 的所有祖先，看是否含 candidate
function isAncestor(candidate, node):
  visited = {}
  queue = [node]
  while queue not empty:
    cur = queue.shift()
    if cur.id === candidate: return true
    for p in cur.parents:
      if p not in visited: visited.add(p); queue.push(getPerson(p))
  return false

// 建立 parent → child 前调用
function wouldCreateCycle(parentId, childId):
  return isAncestor(childId, getPerson(parentId))  // child 已是 parent 的祖先 → 成环
```

配偶边本身不成环（无向、非祖先关系），但可加伦理软校验：X 不能与其直系祖先 / 后代结婚（可选，默认仅警告）。

---

## 6. 与现有系统集成（实现时注意）

- **菜单**：`workbenchMenuCore.ts` 的 `WORKBENCH_MENU_KEYS` / `MENU_DEFAULT_LABELS` / `MENU_ICONS` 三联加 `'genealogy'`；`WorkbenchView.vue` 的 `SECTION_KEYS` + 对应 `<组件 v-else-if>`；`WorkbenchHome.vue` 的 `navTo('genealogy')`。增删菜单项须全链路一致。
- **存储**：新增 IDB store `family_members`（归个人工作台 namespace，随 `workbench.json` 同步）；`DB_VERSION` 由 14 升到 **15**，在 `onupgradeneeded`（幂等 `contains` 守卫）中 `createObjectStore('family_members')`。store 登记进 `IDB_*_STORES` 数组之一。
- **云同步（不加密，并入 `workbench.json`）**：家谱是**个人工作台（workspace 阶层）**的一个面板，数据归入工作台信封 `workbench.json`，随其整包同步落地坚果云等 WebDAV；**不新增独立信封**，也不做额外加密（用户确认不需要）。IDB 本地明文存储、`workbench.json` 明文上传。需在 `useIdb.ts` 把家谱 store 接入 `exportWorkbench` / `importWorkbenchData` / `mergeWorkbench` / `reloadWorkbenchStores`（导出 / 导入 / 字段级合并 / reload 四件套）。
  - 注意：`exportWorkbench` 是**逐字段硬编码**（非遍历常量），接入家谱须同步改 7 处：① 新增 IDB store `family_members` 并登记进 store 创建数组（CORE 或 AUX 其一）；② `WorkbenchSyncData` / `WorkbenchData` 类型加 `family` 字段；③ 新增 `emptyFamilyData()` 工厂；④ `exportWorkbench` 加 `family: full.family`；⑤ `importWorkbenchData` 加 `family: remote.family ?? emptyFamilyData()`；⑥ `mergeWorkbench` 按 id 字段级合并；⑦ `reloadWorkbenchStores` 加家谱 store 的 reload。
- **样式一致性**（项目硬约束）：
  - 列表 + 树双视图复用 `useViewMode()` + `ViewModeToggle` + `src/styles/records.css`（表头居中、操作列固定右侧、卡片栅格、工具条）。
  - 分页器统一 `el-pagination`（含分页上色覆盖），固定每页 `LIST_PAGE_SIZE=10`。
  - 弹框底部按钮顺序统一「取消 / 保存 / 删除」（删除仅编辑态显示），用 `.ewt-dialog-footer`。
  - 删除一律 `el-messagebox` 二次确认（本期无级联删后代，仅删单人并清理悬空引用）。

---

## 7. 非功能需求

- **性能**：成员规模通常 < 数百，前端内存计算派生关系足够；树渲染用折叠 + 必要时虚拟列表避免卡顿。
- **存储**：成员数据量小，整包存 IDB 无压力；并入 `workbench.json` 信封同步，不会显著增大体积。
- **隐私**：本期家谱随 `workbench.json` 明文同步（与其他工作台面板一致，不做加密）；如用户在意亲属信息上云，可后续再加加密，本期不做。

---

## 8. 已确认决策（评审记录）

| # | 问题 | 决策 |
| --- | --- | --- |
| 1 | 本期范围 | 只做「成员 + 关系 + 树视图 + 搜索 + 云同步」；**不做**照片/头像、时间轴、纪念日、遗传病史、GEDCOM、多人协同 |
| 2 | 关系粒度 | **不区分**亲生/继/养父母，UI 统称「父母」 |
| 3 | 多配偶/再婚 | **不支持**；UI 仅一对一配偶，不做多配偶/再婚特殊交互 |
| 4 | 删成员默认行为 | **不做级联删后代**；删除后子女保留为孤儿（`parents` 中移除该 id） |
| 5 | 数据敏感度 | **不需要加密**；家谱随 `workbench.json` 信封明文同步，与其他工作台面板一致 |
| 6 | 主根 | **需要标记主根**；允许用户指定一个成员（如「我」）为主根，作为家谱树默认展开中心（存面板设置 `rootId`） |

> 全部决策已确认，需求定稿。

---

## 9. 后续扩展（非本期）

- GEDCOM 导入导出（家谱国际标准）
- 家庭大事件时间轴（出生 / 婚嫁 / 逝世）
- 照片墙、遗传病史追踪
- 多人协同（跨设备冲突合并，需 CRDT / OT，本期整包同步不支持并发编辑）

---

## 10. 自检补充（需求补漏与修正）

> 2026-09-17 自检：与真实代码（`useCloudSync.ts` / `useIdb.ts` / `workbenchMenuCore.ts`）对账后补充。

### 10.1 补漏的需求
- **空状态**：无任何成员时显示空状态 +「添加第一个成员」引导（与项目既有空状态惯例一致）。
- **工作台菜单显隐开关**：家谱作为工作台面板，应在设置里提供显隐开关（参照 `workbenchPageVisible` / `businessPageVisible` / `studentPageVisible` 模式，新增 `genealogyPageVisible`），并在 `workbenchMenuCore.ts` 三联与 `WorkbenchView` / `WorkbenchHome` 链路中一并处理可见性。
- **建立关系的 UI 交互流程**：成员详情 / 编辑弹框提供「加父母 / 加配偶 / 加子女」入口，选择后从成员列表中点选目标成员完成建边；联动新增时先建 Person 再自动建边。
- **删除确认框文案**：二次确认须明示「将删除 1 人，其 N 个子女将失去父母信息（保留为孤儿）」，让用户知情。
- **关系校验被拒的 UI 反馈**：自引用 / 成环 / 重复边被拒时给出 toast 提示原因（而非静默无效）。
- **树视图呈现形态**：竖向按世代分层、配偶节点并排于同代、节点卡片显示姓名 / 性别图标 / 生卒；同辈默认排序规则需定（建议：有出生日期按出生日期，否则按录入顺序 `order`）。

### 10.2 主根存储位置（明确）
- 主根 `rootId` 存于**应用设置**（settings store，随 `workbench.json` 的 `settings` 字段同步）；不单独存信封 meta。需注意 `settings` 同步时会剥离 cloudSync 凭证 4 字段，但 `rootId` 不受影响，正常随设置同步。

### 10.3 已修正的不一致
- §8 决策表第 5 行原误写 `backup.json`，已改为 `workbench.json`（与 §4.5 / §6 / §7 一致）。
- §6 云同步接入说明由「四件套」细化为 7 处具体改动（因 `exportWorkbench` 为逐字段硬编码，非遍历常量）。
