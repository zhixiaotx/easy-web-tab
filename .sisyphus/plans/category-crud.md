# 分类管理功能 - 工作计划

## TL;DR

> **快速摘要**: 将分类从硬编码常量改为 Pinia store 持久化存储，支持添加/删除自定义分类，预定义分类受保护不可删除。
> 
> **交付物**: 
> - 新建 `src/stores/categories.ts` 分类 store
> - 新建 `CategoryManager.vue` 分类管理面板
> - 新建 `SettingsButton.vue` 悬浮设置按钮
> - 修改 4 个现有组件使用 store
> 
> **预估工作量**: 中等 (8-10 个任务)
> **并行执行**: YES - 3 个 wave
> **关键路径**: Task 1 → Task 3 → Task 5 → Task 9

---

## Context

### 原始需求
用户要求添加分类的增删功能：添加自定义分类、删除自定义分类。

### 访谈摘要
**关键讨论**:
- 管理入口: 悬浮按钮 (右上角设置图标)
- 导入导出: 需要支持自定义分类导出到 Markdown
- 预定义分类: 全部 15 个受保护，删除时网站迁移到"其他"

**研究结论**:
- 当前 `CATEGORIES` 是硬编码常量，被 3 个组件直接引用
- 需要创建独立的 `useCategoriesStore` 分离内置和自定义分类
- localStorage 持久化自定义分类
- 删除时自动迁移网站到"其他"分类

### Metis Review
**识别的问题** (已处理):
- 问题 1: 直接删除分类会导致网站孤立 → 已决定迁移到"其他"分类
- 问题 2: 组件直接 import CATEGORIES 常量 → 改为从 store 读取
- 问题 3: 导入/导出需要包含自定义分类 → 已加入导出逻辑

---

## Work Objectives

### 核心目标
实现分类的动态管理：添加、删除自定义分类，预定义分类受保护。

### 具体交付物
1. `src/stores/categories.ts` - 新建 Pinia store
2. `src/components/CategoryManager.vue` - 分类管理面板
3. `src/components/SettingsButton.vue` - 悬浮设置按钮
4. 修改 `src/components/CategoryTabs.vue`
5. 修改 `src/components/SiteModal.vue`
6. 修改 `src/stores/sites.ts`
7. 修改 `src/views/HomeView.vue`
8. 修改导出/导入逻辑

### 完成定义
- [ ] 可以添加新的自定义分类
- [ ] 可以删除自定义分类（网站自动迁移到"其他"）
- [ ] 预定义分类不可删除（删除按钮禁用）
- [ ] 分类在导入/导出 Markdown 时保留
- [ ] 页面刷新后自定义分类仍然存在

### Must Have
- 自定义分类持久化到 localStorage
- 预定义分类不可删除
- 删除分类时网站迁移到"其他"

### Must NOT Have
- 不允许删除预定义分类
- 不修改现有的网站数据格式
- 不破坏现有的搜索/过滤功能

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: None (UI 功能验证)
- **QA Policy**: Agent-executed QA scenarios for each task

### QA Policy
每个任务包含 Agent-Executed QA Scenarios，验证实际行为而非断言。

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 可并行):
├── Task 1: 创建 types/index.ts 改造
├── Task 2: 创建 stores/categories.ts
├── Task 3: 修改 CategoryTabs.vue 使用 store
└── Task 4: 修改 SiteModal.vue 使用 store

Wave 2 (Core Features - 可并行):
├── Task 5: 修改 sites.ts store
├── Task 6: 创建 CategoryManager.vue
├── Task 7: 创建 SettingsButton.vue
└── Task 8: 修改 HomeView.vue

Wave 3 (Integration - 需顺序):
├── Task 9: 修改导出/导入逻辑
└── Task 10: 更新初始数据 sites.md

Wave FINAL:
└── Task F1: 端到端功能测试
```

### Dependency Matrix
- **Task 1**: — — 2, 3, 4
- **Task 2**: 1 — 3, 4, 5
- **Task 3**: 2 — 6
- **Task 4**: 2 — 6
- **Task 5**: 2 — 9
- **Task 6**: 3, 4 — 8
- **Task 7**: — — 8
- **Task 8**: 6, 7 — 9
- **Task 9**: 5, 8 — 10
- **Task 10**: 9 — F1

---

## TODOs

- [ ] 1. 改造 types/index.ts - 添加 Category 接口和 DEFAULT_CATEGORIES

  **What to do**:
  - 将 `CATEGORIES` 重命名为 `DEFAULT_CATEGORIES`
  - 添加 `isBuiltIn: boolean` 属性 (默认 true)
  - 添加 `Category` 接口定义
  - 保留 `CategoryId` 类型

  **Must NOT do**:
  - 不删除现有的分类数据

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的类型定义修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `src/types/index.ts:19-35` - 当前 CATEGORIES 定义

  **Acceptance Criteria**:
  - [ ] DEFAULT_CATEGORIES 常量存在且包含所有 15 个分类
  - [ ] Category 接口定义完整
  - [ ] 每个分类有 isBuiltIn: true 属性

  **QA Scenarios**:
  ```
  Scenario: 类型定义正确
    Tool: Bash
    Steps:
      1. grep "DEFAULT_CATEGORIES" src/types/index.ts
      2. grep "isBuiltIn" src/types/index.ts
    Expected Result: 找到 DEFAULT_CATEGORIES 和 isBuiltIn 属性
    Evidence: command output
  ```

  **Commit**: YES
  - Message: `refactor(types): rename CATEGORIES to DEFAULT_CATEGORIES and add isBuiltIn`
  - Files: `src/types/index.ts`

---

- [ ] 2. 创建 stores/categories.ts - 新建分类 Pinia store

  **What to do**:
  - 创建 `useCategoriesStore` 函数
  - 定义 `customCategories` ref 从 localStorage 加载
  - 实现 `addCategory(name, icon)` 方法
  - 实现 `updateCategory(id, updates)` 方法
  - 实现 `deleteCategory(id)` 方法 - 返回迁移目标
  - 实现 `saveCustomCategories()` 持久化方法
  - 导出 `allCategories` computed (DEFAULT + custom)
  - 导出 `canDelete(id)` 检查方法

  **Must NOT do**:
  - 不处理网站迁移逻辑 (由 sites store 处理)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 核心 store 逻辑，需要仔细设计
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: Task 1

  **References**:
  - `src/stores/sites.ts` - 参考现有的 store 结构和持久化模式
  - `src/types/index.ts` - 新的 Category 接口

  **Acceptance Criteria**:
  - [ ] useCategoriesStore 函数正确导出
  - [ ] addCategory 添加自定义分类到 customCategories
  - [ ] deleteCategory 返回 'other' 作为迁移目标
  - [ ] allCategories 包含 DEFAULT_CATEGORIES + customCategories
  - [ ] canDelete('news') 返回 false，canDelete('custom1') 返回 true

  **QA Scenarios**:
  ```
  Scenario: 添加自定义分类
    Tool: Bash
    Steps:
      1. 在浏览器控制台执行 store.addCategory('测试', '🧪')
      2. 检查 localStorage['user-categories']
      3. 刷新页面再检查
    Expected Result: 自定义分类持久化存在
    Evidence: .sisyphus/evidence/task-2-add.md

  Scenario: 预定义分类不可删除
    Tool: Bash
    Steps:
      1. 检查 canDelete('tech')
      2. 检查 canDelete('other')
    Expected Result: 都返回 false
    Evidence: .sisyphus/evidence/task-2-candelete.md
  ```

  **Commit**: YES
  - Message: `feat(store): add categories store with CRUD operations`
  - Files: `src/stores/categories.ts`

---

- [ ] 3. 修改 CategoryTabs.vue - 使用 categories store

  **What to do**:
  - 移除 `import { CATEGORIES } from '../types'`
  - 改为 `import { useCategoriesStore } from '../stores/categories'`
  - 替换 `categories` computed 从 store.allCategories 读取
  - 更新类型引用

  **Must NOT do**:
  - 不改变 UI 样式和布局

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 import 替换
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 6
  - **Blocked By**: Task 2

  **References**:
  - `src/components/CategoryTabs.vue:4,8` - 当前 import 和 computed
  - `src/stores/categories.ts` - 新的 store

  **Acceptance Criteria**:
  - [ ] 不再有 `import { CATEGORIES }`
  - [ ] 使用 `store.allCategories` 显示分类
  - [ ] UI 行为不变

  **QA Scenarios**:
  ```
  Scenario: 分类标签正确显示
    Tool: Playwright
    Steps:
      1. 打开 http://localhost:16719
      2. 截图分类标签栏
    Expected Result: 显示所有分类包括自定义分类
    Evidence: .sisyphus/evidence/task-3-tabs.png
  ```

  **Commit**: YES
  - Message: `refactor(CategoryTabs): use categories store instead of constant`
  - Files: `src/components/CategoryTabs.vue`

---

- [ ] 4. 修改 SiteModal.vue - 使用 categories store

  **What to do**:
  - 移除 `import { CATEGORIES } from '../types'`
  - 改为 `import { useCategoriesStore } from '../stores/categories'`
  - 替换 `<option v-for="cat in CATEGORIES">` 为 store.allCategories
  - 添加自定义分类到下拉选项

  **Must NOT do**:
  - 不改变表单其他字段

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 import 和模板替换
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 6
  - **Blocked By**: Task 2

  **References**:
  - `src/components/SiteModal.vue:4,183` - 当前 import 和模板
  - `src/stores/categories.ts` - 新的 store

  **Acceptance Criteria**:
  - [ ] 下拉框包含所有分类
  - [ ] 自定义分类可见

  **QA Scenarios**:
  ```
  Scenario: 分类下拉框包含自定义分类
    Tool: Playwright
    Steps:
      1. 添加一个自定义分类 "测试分类"
      2. 打开添加网站弹窗
      3. 打开分类下拉框
      4. 截图
    Expected Result: 下拉框包含 "测试分类"
    Evidence: .sisyphus/evidence/task-4-dropdown.png
  ```

  **Commit**: YES
  - Message: `refactor(SiteModal): use categories store for dropdown`
  - Files: `src/components/SiteModal.vue`

---

- [ ] 5. 修改 sites.ts store - 集成分类删除迁移

  **What to do**:
  - 导入 `useCategoriesStore`
  - 添加 `migrateSitesToCategory(fromId, toId)` 方法
  - 在 `deleteSite` 或新方法中处理分类迁移
  - 更新 `allCategories` 使用 categoriesStore

  **Must NOT do**:
  - 不删除现有的 site 操作逻辑

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: store 逻辑修改，需要理解数据流
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **References**:
  - `src/stores/sites.ts` - 当前 store 实现
  - `src/stores/categories.ts` - categories store

  **Acceptance Criteria**:
  - [ ] migrateSitesToCategory 方法存在
  - [ ] 调用后相关网站的 category 字段更新
  - [ ] 保存到 localStorage

  **QA Scenarios**:
  ```
  Scenario: 删除分类时网站迁移
    Tool: Bash (via Playwright console)
    Steps:
      1. 添加一个网站到 "tech" 分类
      2. 调用 store.migrateSitesToCategory('tech', 'other')
      3. 检查网站的 category 字段
    Expected Result: 网站的 category 变为 'other'
    Evidence: .sisyphus/evidence/task-5-migrate.md
  ```

  **Commit**: YES
  - Message: `feat(sites): add migrateSitesToCategory for category deletion`
  - Files: `src/stores/sites.ts`

---

- [ ] 6. 创建 CategoryManager.vue - 分类管理面板

  **What to do**:
  - 创建管理面板组件
  - 显示所有分类列表（预定义 + 自定义）
  - 预定义分类显示但禁用删除按钮
  - 自定义分类可编辑名称/图标，可删除
  - 添加表单：输入名称 + 选择图标
  - 删除时如果有网站，显示提示并自动迁移到"其他"

  **Must NOT do**:
  - 不在 DisplayView 显示管理入口

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 组件需要良好的用户体验
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 3, 4

  **References**:
  - `src/components/SiteModal.vue` - 参考弹窗样式
  - `src/stores/categories.ts` - store 方法

  **Acceptance Criteria**:
  - [ ] 显示所有分类
  - [ ] 预定义分类删除按钮禁用
  - [ ] 可以添加自定义分类
  - [ ] 可以删除自定义分类
  - [ ] 删除时网站迁移到"其他"

  **QA Scenarios**:
  ```
  Scenario: 添加自定义分类
    Tool: Playwright
    Steps:
      1. 点击设置按钮打开管理面板
      2. 输入 "测试分类" 和 "🧪"
      3. 点击添加
      4. 检查分类列表
    Expected Result: 列表中出现 "测试分类 🧪"
    Evidence: .sisyphus/evidence/task-6-add.png

  Scenario: 删除自定义分类
    Tool: Playwright
    Steps:
      1. 添加自定义分类 "测试"
      2. 添加一个网站到这个分类
      3. 删除 "测试" 分类
      4. 检查网站的分类
    Expected Result: 网站分类变为 "其他"
    Evidence: .sisyphus/evidence/task-6-delete.png
  ```

  **Commit**: YES
  - Message: `feat(components): add CategoryManager for CRUD operations`
  - Files: `src/components/CategoryManager.vue`

---

- [ ] 7. 创建 SettingsButton.vue - 悬浮设置按钮

  **What to do**:
  - 创建右上角悬浮按钮组件
  - 点击打开 CategoryManager 面板
  - 固定定位在页面右上角
  - 可折叠/展开面板

  **Must NOT do**:
  - 不在 DisplayView 显示

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的 UI 组件
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `src/components/CategoryManager.vue` - 要打开的面板

  **Acceptance Criteria**:
  - [ ] 按钮固定在右上角
  - [ ] 点击打开分类管理面板
  - [ ] 可以关闭面板

  **QA Scenarios**:
  ```
  Scenario: 设置按钮功能
    Tool: Playwright
    Steps:
      1. 打开 HomeView
      2. 找到右上角设置按钮
      3. 点击按钮
      4. 截图
    Expected Result: 显示分类管理面板
    Evidence: .sisyphus/evidence/task-7-button.png
  ```

  **Commit**: YES
  - Message: `feat(components): add SettingsButton for category management`
  - Files: `src/components/SettingsButton.vue`

---

- [ ] 8. 修改 HomeView.vue - 集成设置按钮

  **What to do**:
  - 导入 SettingsButton 组件
  - 在模板中添加组件
  - 确保只显示在 HomeView

  **Must NOT do**:
  - 不修改 DisplayView

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的组件引入
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 6, 7

  **References**:
  - `src/views/HomeView.vue` - 当前实现

  **Acceptance Criteria**:
  - [ ] SettingsButton 组件正确导入
  - [ ] 组件显示在 HomeView

  **QA Scenarios**:
  ```
  Scenario: HomeView 显示设置按钮
    Tool: Playwright
    Steps:
      1. 打开 http://localhost:16719/
      2. 截图右上角
    Expected Result: 显示设置按钮
    Evidence: .sisyphus/evidence/task-8-homeview.png
  ```

  **Commit**: YES
  - Message: `feat(HomeView): integrate SettingsButton component`
  - Files: `src/views/HomeView.vue`

---

- [ ] 9. 修改导出/导入逻辑 - 支持自定义分类

  **What to do**:
  - 修改 `exportToMarkdown` 添加 `customCategories` 导出
  - 修改 `importFromMarkdown` 支持导入自定义分类
  - 导出格式在 YAML frontmatter 顶部添加 `categories:` 字段

  **Must NOT do**:
  - 不破坏现有网站导出逻辑

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要理解导出格式和数据流
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 5, 8

  **References**:
  - `src/stores/sites.ts:198-228` - 当前导出逻辑
  - `src/stores/categories.ts` - 分类 store

  **Acceptance Criteria**:
  - [ ] 导出包含自定义分类信息
  - [ ] 导入恢复自定义分类
  - [ ] 导出文件可被正确导入

  **QA Scenarios**:
  ```
  Scenario: 导出包含自定义分类
    Tool: Playwright
    Steps:
      1. 添加自定义分类 "导出测试"
      2. 点击导出按钮
      3. 保存导出的 sites.md
      4. 读取文件内容
    Expected Result: 文件包含自定义分类信息
    Evidence: .sisyphus/evidence/task-9-export.md

  Scenario: 导入恢复自定义分类
    Tool: Playwright
    Steps:
      1. 清除 localStorage
      2. 导入包含自定义分类的 sites.md
      3. 检查自定义分类是否存在
    Expected Result: 自定义分类被恢复
    Evidence: .sisyphus/evidence/task-9-import.png
  ```

  **Commit**: YES
  - Message: `feat(import-export): support custom categories in markdown`
  - Files: `src/stores/sites.ts`

---

- [ ] 10. 更新初始数据 sites.md - 添加自定义分类支持说明

  **What to do**:
  - 在 sites.md 顶部添加 `categories:` 字段示例
  - 添加注释说明格式

  **Must NOT do**:
  - 不修改现有网站数据

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的文件更新
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task F1
  - **Blocked By**: Task 9

  **References**:
  - `public/data/sites.md` - 当前内容

  **Acceptance Criteria**:
  - [ ] 文件顶部有 categories 示例

  **Commit**: YES
  - Message: `docs(sites.md): add custom categories format example`
  - Files: `public/data/sites.md`

  **Commit**: YES
  - Message: `feat(sites.md): add custom categories export format`
  - Files: `public/data/sites.md`

---

## Final Verification Wave

- [ ] F1. **端到端功能测试** — `unspecified-high`

  **Test Scenarios**:
  1. 添加自定义分类 → 验证显示
  2. 删除自定义分类 → 验证网站迁移
  3. 预定义分类不可删除 → 验证按钮禁用
  4. 导出包含自定义分类 → 验证文件内容
  5. 导入恢复自定义分类 → 验证列表
  6. 页面刷新后自定义分类保留 → 验证 localStorage

  **Output**: 
  - Scenarios [N/N pass]
  - Integration [N/N]
  - VERDICT: APPROVE/REJECT

---

## Commit Strategy

- Task 1: `refactor(types): rename CATEGORIES to DEFAULT_CATEGORIES`
- Task 2: `feat(store): add categories store with CRUD`
- Task 3: `refactor(CategoryTabs): use categories store`
- Task 4: `refactor(SiteModal): use categories store`
- Task 5: `feat(sites): add migrateSitesToCategory`
- Task 6: `feat(CategoryManager): add CRUD panel`
- Task 7: `feat(SettingsButton): add floating button`
- Task 8: `feat(HomeView): integrate SettingsButton`
- Task 9: `feat(import-export): support custom categories`
- Task 10: `docs(sites.md): add categories format`

---

## Success Criteria

### Verification Commands
```bash
npm run build  # Expected: success
```

### Final Checklist
- [ ] 所有自定义分类功能正常工作
- [ ] 预定义分类不可删除
- [ ] 导入/导出支持自定义分类
- [ ] 页面刷新后数据保留
- [ ] 分类管理入口可见可用
