# 家庭家谱管理 — 实现方案

> 基于 `family-genealogy-requirements.md` v0.2 定稿需求产出。本文档是「方案」，确认后再写码。
> 关键约束（来自用户决策）：不区分亲生/继/养父母；UI 仅一对一配偶（模型允许多但 UI 限制）；删除**不**级联删后代（子女保留为孤儿）；**不需要**加密，随 `workbench.json` 明文同步；需支持标记**主根**；并入「个人工作台」信封（workbench 阶层），**不**新建独立云信封。

## 一、改动总览（新建 + 修改清单）

### 新建文件
| 文件 | 职责 |
|---|---|
| `src/composables/genealogyCore.ts` | 纯函数：类型 re-export 的工厂 `emptyGenealogyData()`、派生关系（children/siblings/ancestors/descendants）、环检测 `wouldCreateCycle()`、合并 `mergeFamily()` |
| `src/stores/genealogy.ts` | Pinia store `useGenealogyStore`：`load/save`、增删改成员、设父母/配偶、设主根、派生 getter、删除时清理引用 |
| `src/components/workbench/WorkbenchGenealogy.vue` | 家谱面板：成员列表/卡片双视图 + 树视图（tab 切换）、新增成员弹框、建立关系弹框、设主根弹框、删除二次确认 |

### 修改文件（按链路）
| 文件 | 改动点 |
|---|---|
| `src/composables/workbenchMenuCore.ts` | `WORKBENCH_MENU_KEYS` 加 `'genealogy'`；`MENU_DEFAULT_LABELS` 加 `genealogy:'家庭家谱'`；`MENU_ICONS` 加 `genealogy:'genealogy'`；更新注释「恒 N 项」 |
| `src/components/Icon.vue` | `ICON_PATHS` 加 `genealogy: '<sitemap MDI path>'`（菜单图标是内联表，与 public/icons 生成脚本无关） |
| `src/views/WorkbenchView.vue` | `SECTION_KEYS` 加 `'genealogy'`；`import WorkbenchGenealogy`；`v-else-if="activeSection === 'genealogy'"`；`onMounted` Promise.all 加 `genealogyStore.load()` |
| `src/types/index.ts` | 新增 `FamilyMember` / `GenealogyData` 接口；`WorkbenchData` 加 `family: GenealogyData`；`WorkbenchSyncData` 加 `family: GenealogyData` |
| `src/composables/useIdb.ts` | 见下方「7 处」 |
| `src/composables/useCloudSync.ts` | `mergeWorkbench` 加 `family: mergeFamily(...)`；`reloadWorkbenchStores` 加 genealogy store 的 `load()` 动态导入 |
| `src/stores/settings.ts` | **不改**——主根存家谱数据内（`GenealogyData.rootId`），面板显隐复用既有 `workbenchMenuVisibility['genealogy']` 开关 |

### 关于需求文档 §10 的两处落地微调（意图一致，实现更优）
1. **主根 `rootId`**：存入 `GenealogyData`（即面板持久化数据 `IDB store 'family'`）而非 `AppSettingsData`。等价意图，且避免给设置表加耦合字段。
2. **面板显隐开关**：复用工作台既有的「单菜单项可见性」机制（`setWorkbenchMenuEnabled('genealogy')` ↔ `workbenchMenuVisibility`），**不**新增 `genealogyPageVisible`。每个工作台面板（todos/notes/…）都用同一套，保持一致。

## 二、数据模型（`src/types/index.ts`）

```ts
// ==================== 家庭家谱（并入 workbench 阶层，不加密、明文同步） ====================
export interface FamilyMember {
  id: string            // 'fm_' 前缀，uuid
  name: string          // 必填，≤50
  gender?: 'male' | 'female' | '' | null   // 可选，UI 提供「男/女/不详」
  birthDate?: string    // 'YYYY-MM-DD' 可选
  deathDate?: string    // 可选（在世可空）
  phone?: string        // 可选
  note?: string         // 可选备注
  parents: string[]     // 父/母 id（不区分亲生/继/养）
  spouses: string[]     // 配偶 id（UI 仅一对一，模型允许多）
  createdAt: string
  updatedAt: string
}

export interface GenealogyData {
  members: FamilyMember[]
  rootId: string | null  // 主根（标记家族起点；可空 → 未标记时树视图显示森林/提示选主根）
}

// 并入两封信封：
export interface WorkbenchData { /* …现有字段… */ family: GenealogyData }
export interface WorkbenchSyncData { /* …现有字段… */ family: GenealogyData }
```
- **最小边模型**：只有 `parents` + `spouses` 两条边，子女/兄弟姐妹/祖孙全部派生，不建独立关系表。
- 名称校验：空 / 超长 → 保存按钮 disabled + toast 提示（对齐其他面板）。

## 三、`useIdb.ts` 的 7 处改动（均为硬编码，非遍历）

1. `IDB_CORE_STORES` 数组加 `'family'`（升级时 `onupgradeneeded` 的幂等 `contains` 守卫会自动建店）。
2. `idbExportAll()`：`Promise.all` 解构加 `idbGet<GenealogyData>('family')`，返回对象加 `family: family ?? emptyGenealogyData()`。
3. `idbImportAll()`：写入循环前的兜底守卫加一行 `data = { ...data, family: data.family ?? emptyGenealogyData() }`（与 diary/business 同级；循环遍历 `IDB_CORE_STORES` 会自动写 `family` 店）。
4. `exportWorkbench()`（workbench.json 信封）：输出对象加 `family: full.family`。
5. `importWorkbenchData()`：构造 `workbenchData` 时加 `family: remote.family ?? emptyGenealogyData()`。
6. `mergeWorkbench()`（`useCloudSync.ts` 内）：返回对象加 `family: mergeFamily(local.family, remote.family)`（本地优先按 id 合并，见 §五）。
7. `DB_VERSION` 由 `14` 升 `15`（触发建 `family` 店；旧库升级不清数据）。

> 类型侧配套：`WorkbenchData` / `WorkbenchSyncData` 各加 `family: GenealogyData` 字段（§二）。

## 四、`src/composables/genealogyCore.ts`（纯函数，可单测）

- `emptyGenealogyData(): GenealogyData` → `{ members: [], rootId: null }`
- `getChildren(members, id)` / `getParents` / `getSiblings` / `getAncestors` / `getDescendants`（按 `parents`/`spouses` 派生）
- `buildTree(members, rootId)`：以主根为根输出嵌套节点（无主根时返回森林）
- `wouldCreateCycle(members, childId, newParentId): boolean`：把 `newParentId` 设为 `childId` 的父，是否成环（沿 `childId` 的祖先上溯，若命中 `newParentId` 即环）
- `validateMemberName(name)`：trim + 长度
- `mergeFamily(local, remote): GenealogyData`：成员按 `id` 合并，`updatedAt` 较新者胜（本地优先：本地先入 map，远端仅补缺失 id）；`rootId` 取 `local.rootId ?? remote.rootId`

## 五、`src/stores/genealogy.ts`（Pinia）

- state：`members: FamilyMember[]`、`rootId: string | null`
- `load()`：`idbGet('family')` → 用 `emptyGenealogyData()` 兜底后写入 state（对齐其他 store 的防御性加载）
- `save()`：`idbPut('family', { members, rootId })` + `markDirty()`（触发云同步）
- `addMember(partial)`：生成 `fm_` id + 时间戳，push
- `updateMember(id, patch)`：更新 `updatedAt`
- `deleteMember(id)`：**仅删该成员**，并清理其他成员 `parents`/`spouses` 中对它的引用（子女变孤儿，符合决策④）；若 `rootId === id` 则置 `null`
- `setParent(childId, parentId)`：先 `wouldCreateCycle` 校验，通过则 `child.parents` 追加（去重）
- `setSpouse(aId, bId)`：`a.spouses`/`b.spouses` 互加（UI 限制一对一：设新配偶前清旧配偶）
- `setRoot(id)` / `clearRoot()`：写 `rootId`
- getter：`childrenOf(id)`、`siblingsOf(id)`、`ancestorsOf(id)`、`treeData`（经 core）

## 六、`WorkbenchGenealogy.vue`（UI，对齐既有面板惯例）

- **顶部工具条**（复用 `.ewt-table-toolbar.is-split`）：左「＋ 新增成员」，右 `ViewModeToggle`（列表/卡片，移动端 ≤768 强制卡片）。
- **视图切换**：用 `el-tabs` 或自定义 tab 在「成员」与「家谱树」间切换（树视图为新增形态，需求 §10 已确认需呈现）。
  - 成员视图：复用 `useViewMode()` + `records.css` + `RecordsCard`，`el-pagination`（每页 10，`.xxx-pager` 上色覆盖含 `html.dark`，对齐 `WorkbenchTodo`）。
  - 树视图：递归组件渲染 `buildTree` 结果，主根高亮，节点可「设为主根 / 加父母 / 加配偶 / 编辑 / 删除」。
- **弹框**（`.ewt-dialog-footer`，按钮顺序 取消 / 保存 / 删除，删除仅编辑态）：
  - 新增/编辑成员：name（必填）+ gender/birth/death/phone/note
  - 建立关系：选关系类型（父母 / 配偶）+ 选目标成员 + 环检测与自引用校验 + 失败 toast
  - 设主根：从成员下拉选（或树节点直接「设为主根」）
- **删除确认**：`ElMessageBox.confirm` 二次确认，文案「确定删除「{name}」吗？其子女将保留为孤儿（不影响其他成员）。」
- **空态**：无成员 → 「＋ 新增第一位家庭成员」；有成员无主根 → 提示「点击成员可设为主根」。

## 七、接入校验清单（交付前必跑）

1. `node scripts/generate-preset-icons.cjs && node node_modules/vue-tsc/bin/vue-tsc.js -b && node node_modules/vite/bin/vite.js build`（完整编译，确认无 TS/build 报错；堆 `--max-old-space-size=8192`）。
2. 运行态自测：新增成员 → 建立父母关系（验证树渲染）→ 尝试制造环（应被拒并 toast）→ 设主根 → 删除中间节点（子女变孤儿）→ 刷新页面数据留存 → 触发一次云同步确认 `workbench.json` 含 `family` 且往返一致。
3. 菜单显隐：设置弹窗关闭「家庭家谱」后菜单项消失、且 `WorkbenchView` 自动回退首个可见项（既有 `watch` 已处理）。

## 八、风险与注意

- `WORKBENCH_DATA_VERSION`（备份 v9）保持稳定即可，新增字段向后兼容（导入用 `emptyGenealogyData()` 兜底缺失字段）；**不**改 `WorkbenchSyncData.version`（信封 v1）与 `STUDENT_*` 信封（家谱不进 student）。
- 图标：菜单图标走 `Icon.vue` 内联表，勿误用 `public/icons` 生成脚本；`sitemap` MDI path 需目视确认渲染正常。
- `mergeFamily` 本地优先：多设备并发编辑家谱时以「本地优先 + 按 id 合并」简化，不解决同 id 同字段冲突（符合「小 diff 静默合并」总体策略）。
