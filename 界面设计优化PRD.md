

# 界面设计优化 PRD —— easy-web-tab（网页导航 / 个人工作台）

> 文档角色：界面交互设计（UI/UX）优化方案  
> 适用版本：当前 SPA（Vue 3 + Vite + Pinia + Element Plus，已全局注册 `zh-cn`）  
> 目标读者：产品 / 前端实现 / 测试验收  
> 配套现状：已存在 `src/style.css`（Design Token 亮色）、`src/styles/dark.css`（暗色覆盖）、`src/styles/background.css`（背景体系）

---

## 1. 背景与设计目标

### 1.1 现状诊断（基于代码调研）

| 维度      | 现状                                                                                 | 问题                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **配色**  | `style.css:6` `:root` 定义亮色 token；`dark.css` 用 `html.dark` 覆盖                       | 仅有单一主色值，无 50–900 色阶；亮/暗主色渐变不一致（`#3b82f6→#8b5cf6` vs `rgba(59,130,246,.85)→rgba(139,92,246,.85)`）；无中性灰色阶集中管理；语义色（success/warning/error）未成对给出 hover/soft 态 |
| **字体**  | `style.css:63` `--font-family` 为纯系统栈，含中文场景但无中文专用回退                                 | 无「PingFang SC / 微软雅黑 / 思源黑体」回退；所有字号为固定 `px`，无 `clamp()` 流式缩放；正文 `line-height:1.6` 一刀切，卡片标题偏松                                                             |
| **响应式** | 51 个组件散落 `@media (max-width:768px/640px)` 修补式断点；`WorkbenchView.vue` 仅 2 处 768px 断点 | 属「桌面优先 + 局部补丁」，无统一断点常量、无移动优先栅格、无统一容器 `max-width`；移动端导航（工作台侧栏/顶栏）无统一降级方案；缺 `320px` 最小屏与 `992px` 平板断点系统处理                                                  |
| **无障碍** | `style.css:148` 已有 `:focus-visible` 描边；`prefers-reduced-motion` 支持                 | 正文对比度基本达标，但缺少系统化的对比度核验、ARIA 标注规范、键盘导航顺序约定                                                                                                                |
| **动效**  | 仅有 `--anim-*` / `--ease-*` token，无统一微交互参数                                          | 按钮/卡片 hover、弹窗进出场缺乏统一时长与曲线，组件各自为政                                                                                                                        |

### 1.2 设计目标

1. **移动优先（Mobile-First）**：以 320px 最小屏为设计基线，断点渐进增强；统一栅格、容器与导航模式。
2. **统一配色与字体系统**：建立语义色阶 + 中性灰阶 + 统一主色渐变；中英文字体栈 + 流体字号刻度。
3. **可访问性达标 WCAG 2.2 AA**：正文对比度 ≥ 4.5:1、UI 组件 ≥ 3:1；键盘可达、焦点可见、语义化优先。
4. **以 Design Token 驱动**：所有视觉决策落到 `style.css` 变量，组件只消费 token，杜绝散落硬编码色值/魔法数字。
5. **轻量零外部依赖**：字体优先系统栈（本地应用不引入 Web 字体网络请求），保证离线可用。

---

## 2. 设计原则

- **移动优先**：默认单列，空间允许再扩展为多列；先保证窄屏体验，再向上增强。
- **Token 优先**：组件内禁止裸色值（如 `color:#3b82f6`）与魔法间距，统一引用 `var(--*)`。
- **对比度不妥协**：禁用「仅以颜色传达状态」，配合图标/文字辅助。
- **动效克制**：仅动画 `transform` / `opacity`（GPU 加速），时长 0.2–0.3s，尊重 `prefers-reduced-motion`。
- **语义化先于 ARIA**：用原生 `<button>/<nav>/<main>/<dialog>` 而非 ARIA 兜底。

---

## 3. 配色方案

### 3.1 主色与品牌（统一渐变，亮暗一致）

主色保持蓝（信任、工具属性），暗色下改用不透明蓝紫渐变以对齐亮色观感：

```css
/* 统一主色：亮暗共用同一组 */
--color-primary-50:  #eff6ff;
--color-primary-100: #dbeafe;
--color-primary-200: #bfdbfe;
--color-primary-300: #93c5fd;
--color-primary-400: #60a5fa;
--color-primary-500: #3b82f6; /* 主色 */
--color-primary-600: #2563eb; /* hover */
--color-primary-700: #1d4ed8;
--color-primary-800: #1e40af;
--color-primary-900: #1e3a8a;

/* 亮暗统一渐变（不再分两套） */
--gradient-primary: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
html.dark {
  --gradient-primary: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
}
```

### 3.2 语义色（成对给出 hover / soft 背景）

```css
/* 成功 / 警告 / 错误 均给出 base / hover / soft（浅底）三态 */
--color-success:    #10b981;  --color-success-hover: #059669;  --color-success-soft: #d1fae5;
--color-warning:    #f59e0b;  --color-warning-hover: #d97706;  --color-warning-soft: #fef3c7;
--color-error:      #ef4444;  --color-error-hover:   #dc2626;  --color-error-soft:   #fee2e2;
--color-info:       #3b82f6;  --color-info-hover:    #2563eb;  --color-info-soft:    #dbeafe;
```

### 3.3 中性灰阶（Slate，集中管理文字/边框/背景）

替换现有散落的 `#f8fafc / #e2e8f0 / #64748b` 等，统一为 slate 阶：

```css
--color-slate-50:  #f8fafc;  --color-slate-100: #f1f5f9;  --color-slate-200: #e2e8f0;
--color-slate-300: #cbd5e1;  --color-slate-400: #94a3b8;  --color-slate-500: #64748b;
--color-slate-600: #475569;  --color-slate-700: #334155;  --color-slate-800: #1e293b;
--color-slate-900: #0f172a;
```

亮色映射：`--color-bg:#f8fafc(slate-50)`、`--color-bg-card:#fff`、`--color-text:#1e293b(slate-800)`、`--color-text-secondary:#475569(slate-600)`、`--color-border:#e2e8f0(slate-200)`。  
暗色映射：`--color-bg:#0f172a(slate-900)`、`--color-bg-card:#1e293b(slate-800)`、`--color-text:#f8fafc(slate-50)`、`--color-border:#334155(slate-700)`。

### 3.4 对比度核验（WCAG 2.2 AA）

| 组合      | 色值                     | 对比度     | 结论                       |
| ------- | ---------------------- | ------- | ------------------------ |
| 正文（亮）   | `#1e293b` on `#f8fafc` | ~13.9:1 | ✅                        |
| 次要文字（亮） | `#475569` on `#f8fafc` | ~7.5:1  | ✅                        |
| 主按钮文字   | `#fff` on `#3b82f6`    | ~4.6:1  | ✅（临界，hover 用 #2563eb 更稳） |
| 正文（暗）   | `#f8fafc` on `#0f172a` | ~15.8:1 | ✅                        |
| 次要文字（暗） | `#94a3b8` on `#0f172a` | ~6.4:1  | ✅                        |

> 实施要点：任何新增文字色组合需对照上表，正文 ≥ 4.5:1、UI 组件/图标 ≥ 3:1。

---

## 4. 字体方案

### 4.1 中英文字体栈（系统优先，零网络依赖）

```css
--font-family:
  -apple-system, BlinkMacSystemFont,
  "Segoe UI", Roboto,
  "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans SC",
  "Helvetica Neue", Arial, sans-serif;
--font-family-mono:
  ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
```

> 中文回退顺序：macOS 苹方 → Windows 微软雅黑 → 跨平台思源/Noto；保证中文在任意系统都有清晰无衬线呈现。

### 4.2 流体字号刻度（Mobile-First，用 clamp 缩放标题）

正文保持可读，**移动端不小于 15px**（14px 手机偏小说不清）。标题用 `clamp()` 在 320→1200 间平滑伸缩：

```css
--font-size-xs:   12px;
--font-size-sm:   13px;
--font-size-base: clamp(15px, 1.1vw + 13px, 16px); /* 正文：移动15 / 桌面16 */
--font-size-lg:   16px;
--font-size-xl:   clamp(18px, 1.4vw + 15px, 20px);
--font-size-2xl:  clamp(20px, 1.8vw + 16px, 24px);  /* 区块标题 */
--font-size-3xl:  clamp(24px, 2.4vw + 18px, 30px);
--font-size-4xl:  clamp(28px, 3.2vw + 20px, 40px);  /* 页面大标题 */

/* 行高按场景区分 */
--line-height-tight:   1.3;  /* 标题 */
--line-height-base:    1.6;  /* 正文 */
--line-height-relaxed: 1.75; /* 长文/日记 */
```

### 4.3 字重与限制

复用现有 `--font-weight-*`（400/500/600/700）；**全站最多两种字体家族**（无衬线 + 等宽），避免混排凌乱。

---

## 5. 移动优先布局体系

### 5.1 统一断点常量（消除散落魔法值）

在 `style.css` 顶部注释约定，组件内统一引用以下断点（不再写裸 `768px`）：

```
xs  ≤ 359px  超小屏（老款手机）
sm  ≥ 360px  手机（基准）
md  ≥ 576px  大屏手机 / 折叠屏
lg  ≥ 768px  平板竖屏（当前主要补丁点）
xl  ≥ 992px  平板横屏 / 小笔记本
2xl ≥ 1200px 桌面（容器封顶）
```

实现方式：如需在组件内判断，建议用 JS 断点枚举 + CSS 媒体查询双轨；CSS 侧统一写成 `@media (max-width: 768px)` 等，并在 PR 模板中强制注释断点名。

### 5.2 统一容器与栅格

```css
.wb-container {
  width: 100%;
  max-width: 1200px;          /* 2xl 封顶，避免超宽屏拉太开 */
  margin-inline: auto;
  padding-inline: clamp(12px, 3vw, 24px); /* 移动窄、桌面宽 */
}
/* 免媒体查询响应网格：卡片/面板统一复用 */
.grid-auto {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
}
```

### 5.3 工作台导航：移动端降级为底部 Tab Bar

当前 `WorkbenchView` 侧栏/顶栏在窄屏无统一方案。移动优先做法：

- **≥ 992px（xl）**：左侧固定侧栏（图标+文字）或顶部分段导航。
- **< 992px**：侧栏收起为 **底部固定 Tab Bar**（图标 + 文字，最多 5 个主入口，其余进「更多」抽屉），`position: fixed; bottom:0`，内容区 `padding-bottom: 56px` 避让。
- 弹窗在移动端全屏化（`width:100%; height:100%; border-radius:0`），桌面端居中卡片。

```
┌─────────────┐    ┌──────────┐    ┌──────────────┐
│ 侧栏 │ 内容 │    │  内容    │    │ 内容         │
│      │      │    │          │    │             │
│ (xl) │      │    │ 底部Tab  │    │ 底部Tab(更多)│
└─────────────┘    └──────────┘    └──────────────┘
   桌面            平/手机          手机（全屏弹窗）
```

---

## 6. 组件与微交互规范

### 6.1 基础组件状态与 token

| 组件           | 状态                               | 规范                                                                                                            |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 按钮 `.btn`    | 默认/hover/active/disabled/loading | hover `translateY(-1px)`+阴影；active `scale(.97)`；时长 `--transition-base`；disabled 透明度 .5 且 `cursor:not-allowed` |
| 卡片 `.card`   | 默认/hover                         | hover 边框转主色 + `shadow-card-hover`；`transition: box-shadow .2s, border-color .2s`                              |
| 输入框 `.input` | 默认/focus/error                   | focus `border-color:primary` + `box-shadow:0 0 0 3px primary-soft`；error 边框转 `--color-error`                  |
| 弹窗 `.modal`  | 进出场                              | 遮罩淡入 `opacity .2s`；面板 `transform: translateY(8px)→0` + `opacity` .25s `--ease-out`                            |
| Toast        | 出现/消失                            | 右上滑入 `translateX(12px)→0`，自动 2.5s 消失，尊重 reduced-motion                                                        |

### 6.2 统一圆角与间距（已具备，强约束）

复用现有 `--radius-*`（4/8/12/16/9999）与 `--space-*`（4/8/12/16/20/24/32），**禁止组件内写裸 `padding:13px` 之类**。

### 6.3 动效参数（集中）

```css
--motion-hover-rise: translateY(-1px);
--motion-press: scale(0.97);
--motion-duration: 220ms;
--motion-ease: cubic-bezier(0.4, 0, 0.2, 1);
```

---

## 7. 无障碍检查清单（WCAG 2.2 AA）

- [ ] 正文对比度 ≥ 4.5:1、UI 组件/图标 ≥ 3:1（见 §3.4）
- [ ] 所有交互元素可键盘操作，`Tab` 顺序符合视觉顺序
- [ ] 焦点可见：统一 `:focus-visible` 描边（已具备，扩展至所有自定义控件）
- [ ] 语义化标签：导航用 `<nav>`、主区用 `<main>`、弹窗用 `<dialog>` 或 `role="dialog"` + `aria-modal`
- [ ] 图标按钮带 `aria-label` 或可视文字，禁用纯色状态
- [ ] 弹窗打开时焦点陷阱 + `Esc` 关闭 + 关闭后焦点归位
- [ ] 尊重 `prefers-reduced-motion`（已具备，全站统一）
- [ ] 表单错误以文字（`error-msg`）+ `aria-invalid` 双重提示，不只变红

---

## 8. Design Token 落地方案（改动清单）

> 仅改 `src/style.css` 与 `src/styles/dark.css`，**不破坏现有组件类名**（dark.css 已用大量 `html.dark .xxx` 覆盖，新增 token 后在原位置引用即可）。

1. **style.css `:root`**：补充 §3.1–3.3 色阶、§4.1–4.2 字体与流体字号、§5.2 容器/栅格、§6.3 动效参数。
2. **dark.css `html.dark`**：将主色/渐变/中性色引用统一指向新色阶变量；移除与亮色不一致的主色渐变硬编码。
3. **新增 `src/styles/mobile.css`**（可选，按视图拆分）：集中放底部 Tab Bar、全屏弹窗等移动端专属样式，由 `main.ts` 引入。
4. **组件改造（分阶段）**：移除散落 `768px/640px` 魔法值，统一断点注释；工作台导航接入底部 Tab Bar。

---

## 9. 实施路线图与优先级

| 阶段 | 内容                                       | 优先级 | 工作量         |
| -- | ---------------------------------------- | --- | ----------- |
| P0 | Token 体系补齐（§3 色阶 + §4 字体/流体字号 + §6.3 动效） | 高   | 小（纯 CSS 变量） |
| P0 | 对比度核验 + 焦点/ARIA 规范落地（§7）                 | 高   | 小           |
| P1 | 统一容器/栅格 + 断点常量约定（§5.1–5.2）               | 中   | 中           |
| P1 | 工作台导航移动端降级（底部 Tab Bar / 全屏弹窗）（§5.3）      | 中   | 中           |
| P2 | 组件微交互统一（按钮/卡片/弹窗 hover、Toast）（§6.1）      | 低   | 中           |
| P2 | 清理 51 处散落媒体查询，统一断点名                      | 低   | 大（跨文件）      |

> 建议按 P0→P1→P2 推进；P0 为零风险变量层改动，可先行；P2 的媒体查询清理建议随各模块日常迭代顺带完成，避免一次性大改。

---

## 10. 验收标准

1. 在 320 / 375 / 768 / 1200 / 1920px 五档视口下，主页与工作台均无横向滚动、无内容溢出、无重叠。
2. 切换亮/暗模式，主色渐变观感一致；任意新文字组合对比度达标（附核对表）。
3. 仅键盘可完成「打开设置→切到工作台→新增一条便签→保存」全链路，焦点可见且不丢失。
4. 所有字号/颜色/间距均来自 `style.css` token，组件内 `grep` 无裸 `#xxxxxx` 与主色硬编码（容许极少历史遗留并登记）。
5. 移动端工作台底部 Tab Bar 可切换全部主模块；弹窗全屏、可 `Esc` 关闭、焦点归位。

---

*—— 由界面交互设计专家产出，作为后续实现与验收基线。*
