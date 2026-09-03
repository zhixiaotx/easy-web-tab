# 学生工作台 PRD（Student Workbench）

> 版本：v1.0
> 日期：2026-08-30
> 项目：easy-web-tab 子产品
> 适用学段：幼儿园（3-6 岁）、小学（6-12 岁）、初中（12-15 岁）

---

## 一、产品概述

### 1.1 产品定位
面向 K12 学生（含幼儿园）的**个人学习与成长管理工作台**，在浏览器新标签页形态下，帮助学生养成良好习惯、管理作业与学习计划、追踪成长轨迹。

### 1.2 产品目标
- **低龄段（幼儿园）**：以「游戏化任务 + 家长协同」为主，培养基础生活习惯
- **中龄段（小学）**：以「作业管理 + 习惯打卡」为主，建立学习自主性
- **高龄段（初中）**：以「学科管理 + 复习计划 + 错题本」为主，支持应试与长期规划

### 1.3 与现有 easy-web-tab 的关系
- **复用**：Vue 3 + Pinia + TypeScript + IndexedDB + 一屏布局 + 云同步 + 分页/面板架构
- **新增**：独立路由 `/student`，学段切换器，学生专用菜单与面板
- **隔离**：与成人工作台 `/workbench`、销售记账 `/business` 数据隔离（独立 IDB store 命名空间 `student_*`）

### 1.4 非目标
- 不做在线题库与直播课（聚焦自我管理，不替代学习内容）
- 不做班级/教师端（单人单设备场景，无社交）
- 不做移动端原生 App（保持 SPA 形态，移动端浏览器适配即可）

---

## 二、用户画像与需求分析

### 2.1 用户画像

| 学段 | 年龄 | 识字水平 | 使用场景 | 核心诉求 |
|------|------|----------|----------|----------|
| 幼儿园 | 3-6 | 少量识字/拼音 | 家长陪同下使用 | 习惯养成、奖励机制、亲子互动 |
| 小学低年级 | 6-8 | 拼音+少量字 | 半自主使用 | 作业提醒、阅读打卡、习惯养成 |
| 小学高年级 | 9-12 | 流畅阅读 | 自主使用 | 作业管理、学习计划、课程表 |
| 初中 | 12-15 | 完全自主 | 完全自主使用 | 学科管理、复习规划、错题本、考试倒计时 |

### 2.2 共性需求
1. **习惯养成**：每日打卡、连续天数、勋章奖励
2. **任务管理**：今日待办、作业清单、完成追踪
3. **时间管理**：番茄钟专注、倒计时提醒
4. **成长记录**：日记、阅读记录、运动记录
5. **可视化反馈**：进度条、徽章墙、数据统计

### 2.3 学段差异化需求

#### 幼儿园段（K）
- **强图标化**：大图标、彩色 emoji、最少文字
- **家长模式**：家长可设定任务、查看报告、发放奖励
- **游戏化**：星星/勋章/成长树、声音反馈（可选）
- **简单任务**：刷牙、收拾玩具、阅读绘本、早睡早起
- **无学科概念**：无作业、无课程表

#### 小学段（P）
- **作业管理**：语文/数学/英语三科作业清单
- **课程表**：周一到周五课程
- **阅读打卡**：书名、页数、时长、家长签字
- **习惯养成**：写作业、复习、运动、家务、阅读
- **奖励积分**：家长设定奖励，完成任务获得积分兑换

#### 初中段（J）
- **多学科**：语数英 + 政史地 + 物化生（最多 9 科）
- **复习计划**：周/月计划、艾宾浩斯遗忘曲线提醒
- **错题本**：拍照/文字录入、分类、复习标记
- **考试倒计时**：期中、期末、月考、中考
- **学习日记**：每日学习总结、知识点复盘

---

## 三、学段差异化策略

### 3.1 学段切换机制
- **入口**：首次进入 `/student` 时选择学段，存储在 IDB `student_settings.stage`
- **切换**：设置弹窗内可切换学段（切换需二次确认，会重置菜单可见性但保留数据）
- **影响范围**：
  - 左侧菜单项的显示/隐藏（学段过滤）
  - 面板内默认分类（如小学作业 3 科 vs 初中 9 科）
  - 卡片视觉风格（幼儿园更鲜艳，初中更简洁）
  - 字体大小（幼儿园 18px，小学 16px，初中 14px）

### 3.2 学段-功能矩阵

| 功能模块 | 幼儿园 | 小学低 | 小学高 | 初中 | 说明 |
|----------|--------|--------|--------|------|------|
| 习惯打卡 | ✅ 核心 | ✅ 核心 | ✅ | ⚪ 可选 | 幼小为重点 |
| 作业管理 | ❌ | ✅ 核心 | ✅ 核心 | ✅ | 小学起步 |
| 课程表 | ❌ | ✅ | ✅ | ✅ | 小学起步 |
| 学习计划 | ❌ | ⚪ 简化 | ✅ | ✅ 核心 | 初中重点 |
| 复习计划 | ❌ | ❌ | ⚪ | ✅ 核心 | 初中独有 |
| 错题本 | ❌ | ❌ | ⚪ | ✅ 核心 | 初中独有 |
| 阅读记录 | ✅ 亲子 | ✅ | ✅ | ✅ | 全学段 |
| 考试倒计时 | ❌ | ⚪ | ✅ | ✅ 核心 | 初中重点 |
| 番茄钟 | ❌ | ⚪ | ✅ | ✅ | 小学高起步 |
| 学习日记 | ⚪ 涂鸦 | ✅ 拼音 | ✅ | ✅ | 全学段 |
| 成就勋章 | ✅ 核心 | ✅ 核心 | ✅ | ⚪ | 低龄重点 |
| 奖励积分 | ✅ 核心 | ✅ | ⚪ | ❌ | 低龄重点 |
| 家长协同 | ✅ 核心 | ✅ | ⚪ | ❌ | 低龄重点 |

> ✅ 核心 = 默认显示且推荐；✅ = 默认显示；⚪ 可选 = 默认隐藏可开启；❌ = 不支持

---

## 四、功能模块设计

### 4.1 学生首页（StudentHome）
- **问候条**：早上好/下午好/晚上好 + 学生昵称 + 今日待办数
- **三屏轮播**（复用 WorkbenchHome 轮播机制）：
  1. **行动台**：今日任务卡片（待办/作业/复习）+ 快捷按钮
  2. **数据概览**：习惯连续天数、本周完成率、待复习错题数、距下次考试天数
  3. **工具栏**：番茄钟、课程表、勋章墙入口
- **学段徽标**：右上角显示当前学段（K/P/J）

### 4.2 习惯打卡（StudentHabits）
- **数据结构**：复用 `WorkbenchHabits` 模型（`habits[]` + `records[]`）
- **学段默认习惯**：
  - K：刷牙、洗脸、收拾玩具、阅读绘本、早睡、运动、家务
  - P：写作业、复习、阅读、运动、家务、早睡早起
  - J：自主学习、复习错题、运动、阅读、早睡
- **可视化**：日历热力图（GitHub 风格）、连续天数进度环、勋章墙
- **分类**：生活习惯 / 学习习惯 / 运动习惯

### 4.3 作业管理（StudentHomework）
- **学段**：小学 + 初中
- **数据结构**：
  ```typescript
  interface StudentHomework {
    id: string                      // 前缀 hw_
    subject: string                // 学科（小学 3 科，初中 9 科，自定义扩展）
    title: string                   // 作业题目
    content?: string               // 详细描述
    dueDate: string                // 截止日期 YYYY-MM-DD
    status: 'pending' | 'doing' | 'done' | 'overdue'
    priority: 'low' | 'normal' | 'high'
    remindAt?: string              // 提醒时间
    createdAt: number
    updatedAt: number
  }
  ```
- **功能**：
  - 按学科筛选 tabs（全部 + 各学科）
  - 按状态分组（待办 / 进行中 / 已完成 / 已逾期）
  - 提交状态追踪（已完成自动归类）
  - 一屏分页（复用 usePanelPaging）
- **学科注册表**：学段切换时自动播种默认学科，用户可自定义增删

### 4.4 课程表（StudentTimetable）
- **学段**：小学 + 初中
- **数据结构**：
  ```typescript
  interface StudentTimetable {
    version: number
    weeks: number                  // 每周节数（小学 6 节/天，初中 8-10 节/天）
    schedule: {
      [dayOfWeek: number]: {      // 1=周一 ... 7=周日
        [period: number]: TimetableSlot
      }
    }
  }
  interface TimetableSlot {
    subject: string
    teacher?: string
    classroom?: string
    startHHMM: string             // "08:00"
    endHHMM: string
  }
  ```
- **视图**：
  - 周视图：表格形式，行=节次，列=周一到周日
  - 日视图：今日课程高亮，下一节提醒
- **编辑**：弹框编辑单节课，支持批量复制

### 4.5 学习计划（StudentPlan）
- **学段**：小学高 + 初中
- **类型**：周计划 / 月计划 / 学期计划
- **数据结构**：
  ```typescript
  interface StudentPlan {
    id: string                    // 前缀 pl_
    type: 'weekly' | 'monthly' | 'term'
    startDate: string
    endDate: string
    goals: PlanGoal[]             // 目标列表
    review?: string               // 周期复盘
    createdAt: number
    updatedAt: number
  }
  interface PlanGoal {
    id: string
    subject?: string              // 学科目标
    content: string
    target?: string               // 量化目标（如"完成 5 套卷子"）
    progress: number              // 0-100
    done: boolean
  }
  ```
- **视图**：计划列表 + 目标进度条 + 复盘编辑

### 4.6 复习计划（StudentReview）
- **学段**：初中独有
- **算法**：艾宾浩斯遗忘曲线（1 天 / 2 天 / 4 天 / 7 天 / 15 天 / 30 天）
- **数据结构**：
  ```typescript
  interface ReviewItem {
    id: string                    // 前缀 rv_
    subject: string
    knowledgePoint: string        // 知识点
    source?: string               // 来源（教材章节/错题/试卷）
    learnDate: string             // 初学日期
    nextReviewDate: string        // 下次复习日期
    reviewCount: number           // 已复习次数
    stage: number                 // 遗忘曲线阶段 1-6
    mastered: boolean             // 已掌握
    createdAt: number
    updatedAt: number
  }
  ```
- **功能**：
  - 今日待复习列表（按学科分组）
  - 复习完成打卡（自动推进到下一阶段）
  - 已掌握标记（停止提醒）
  - 复习日历视图

### 4.7 错题本（StudentMistakes）
- **学段**：初中独有，小学高可选
- **数据结构**：
  ```typescript
  interface MistakeEntry {
    id: string                    // 前缀 mk_
    subject: string
    question: string              // 题干（文字/Markdown）
    imageUrl?: string             // 拍照（IDB 存图，导出 URL）
    wrongAnswer?: string
    correctAnswer: string
    analysis?: string             // 错因分析
    tags: string[]                // 知识点标签
    reviewCount: number
    lastReviewDate?: string
    status: 'new' | 'reviewing' | 'mastered'
    createdAt: number
    updatedAt: number
  }
  ```
- **功能**：
  - 按学科 + 标签筛选
  - 拍照上传（IndexedDB 存原图，导出 base64）
  - 复习状态追踪（与复习计划联动）
  - Markdown 题干编辑

### 4.8 阅读记录（StudentReading）
- **学段**：全学段
- **数据结构**：
  ```typescript
  interface ReadingEntry {
    id: string                    // 前缀 rd_
    bookTitle: string
    author?: string
    pages: number                 // 当次阅读页数
    totalPages?: number           // 全书页数
    durationMin: number           // 阅读时长（分钟）
    readDate: string              // YYYY-MM-DD
    note?: string                 // 感悟/摘抄（Markdown）
    parentSign?: boolean          // 家长签字（小学低段）
    createdAt: number
    updatedAt: number
  }
  ```
- **视图**：阅读列表 + 累计页数/时长统计 + 阅读时长折线图

### 4.9 考试倒计时（StudentExam）
- **学段**：小学高 + 初中
- **复用**：基于现有 `countdowns` 模型，自定义分类「exam」
- **学段默认**：
  - 小学：期中、期末
  - 初中：月考、期中、期末、中考（初三）
- **字段扩展**：
  ```typescript
  interface StudentExam {
    // 继承 Countdown
    subject?: string              // 考试科目（全科/单科）
    scope?: string                // 考试范围
    targetScore?: number          // 目标分数
  }
  ```

### 4.10 学习日记（StudentDiary）
- **复用**：现有 `diary` 模型（每日一篇）
- **学段差异化**：
  - K：涂鸦/语音/拼音输入（家长代记）
  - P：拼音 + 短句
  - J：完整 Markdown
- **模板**：今日学习内容、掌握的知识点、需要改进的地方、明日计划

### 4.11 番茄钟（StudentPomodoro）
- **复用**：现有 `pomodoro` 模型
- **学段默认时长**：
  - 小学高：25 分钟学习 + 5 分钟休息
  - 初中：50 分钟学习 + 10 分钟休息
- **扩展**：关联学科、关联作业/复习计划

### 4.12 成就勋章墙（StudentAchievements）
- **学段**：幼儿园 + 小学重点
- **数据结构**：
  ```typescript
  interface Achievement {
    id: string                    // 前缀 ach_
    name: string
    icon: string                  // emoji
    description: string
    category: 'habit' | 'study' | 'reading' | 'special'
    unlockCondition: {
      type: 'streak' | 'count' | 'goal'
      target: number
    }
    unlocked: boolean
    unlockedAt?: number
  }
  ```
- **勋章示例**：
  - 连续打卡 7/30/100 天
  - 阅读累计 10/50/100 本书
  - 番茄钟累计 50/200/500 个
  - 作业完成率 95%+
- **可视化**：勋章墙网格，已解锁高亮，未解锁灰色 + 进度条

### 4.13 奖励积分（StudentRewards）
- **学段**：幼儿园 + 小学重点
- **数据结构**：
  ```typescript
  interface RewardAccount {
    totalPoints: number           // 当前积分
    history: RewardTransaction[]
    rewards: RewardItem[]         // 可兑换奖励
  }
  interface RewardTransaction {
    id: string                    // 前缀 rw_
    type: 'earn' | 'spend'
    points: number
    reason: string                // 完成习惯/作业/家长奖励
    relatedId?: string            // 关联的习惯/作业 id
    date: string
    createdAt: number
  }
  interface RewardItem {
    id: string                    // 前缀 rwi_
    name: string                  // "看 30 分钟动画"
    cost: number                  // 兑换所需积分
    stock?: number                // 库存（可选）
    enabled: boolean
  }
  ```
- **功能**：
  - 完成习惯/作业自动加分（规则配置）
  - 家长手动奖励
  - 积分兑换奖励（扣分）
  - 兑换历史

### 4.14 家长协同（StudentParent）
- **学段**：幼儿园 + 小学低重点
- **模式**：家长入口（独立 PIN 解锁）
- **能力**：
  - 设置每日任务清单
  - 查看孩子完成情况报告
  - 手动加分/发放勋章
  - 配置奖励项
  - 阅读签字
- **数据隔离**：家长配置与孩子数据同 store，但通过 `parentConfig` 字段区分

### 4.15 功能详述（独立文档）

本章为高层概述，14 个模块的完整功能描述（业务逻辑 / 交互逻辑 / 规则约束 / 权限逻辑 / 边界异常 5 维度）+ ASCII 原型线框图（精确按钮位置）见配套文档：

**[PRD-学生工作台-功能详述.md](./PRD-学生工作台-功能详述.md)**

该文档结构：
1. **功能概述表**：14 模块一表速览
2. **模块详情**：每模块 5 维度详细描述 + ASCII 原型线框图 + 按钮位置清单
3. **共性交互约定**：顶部布局 / 筛选 tabs / 卡片底部按钮 / 分页条 / 弹框 / 学段可见性图标
4. **按钮位置速查表**：14 模块 × 4 位置维度（主新增 / 卡片主操作 / 卡片次操作 / 分页条）

> 工程团队实施前请先阅读详述文档作为验收基准。

---

## 五、数据模型设计

### 5.1 IDB Store 规划

新增 IDB store（DB `easy-web-tab` 升级到 v7）：

| Store 名 | 类型 | 数据 | 说明 |
|----------|------|------|------|
| `student_settings` | 核心 | 学生设置（学段、昵称、学号等） | 单对象 |
| `student_homework` | 核心 | 作业数组 | `hw_` 前缀 |
| `student_timetable` | 核心 | 课程表对象 | 单对象 |
| `student_plans` | 核心 | 学习计划数组 | `pl_` 前缀 |
| `student_review` | 核心 | 复习项数组 | `rv_` 前缀 |
| `student_mistakes` | 核心 | 错题数组 | `mk_` 前缀 |
| `student_reading` | 核心 | 阅读记录数组 | `rd_` 前缀 |
| `student_achievements` | 核心 | 成就 + 解锁记录 | 单对象 |
| `student_rewards` | 核心 | 奖励积分账户 | 单对象 |

复用现有 store（共享）：
- `habits`（习惯打卡，新增学段默认值）
- `diary`（学习日记）
- `pomodoro`（番茄钟）
- `countdowns`（考试倒计时，通过 category 区分）

### 5.2 备份导出格式（StudentBackup v1）

```json5
{
  "type": "student-backup",
  "version": 1,
  "exportedAt": "2026-08-30T12:00:00.000Z",
  "clientId": "...",
  "pushedAt": "...",
  "stage": "P",                    // K | P | J
  "studentSettings": {...},
  "homework": [...],
  "timetable": {...},
  "plans": [...],
  "review": [...],
  "mistakes": [...],
  "reading": [...],
  "achievements": {...},
  "rewards": {...},
  "habits": {...},                 // 共享
  "diary": {...},                  // 共享
  "pomodoro": {...},               // 共享
  "countdowns": [...],             // 共享（exam 分类）
  "prefs": {...}                   // localStorage 偏好
}
```

### 5.3 与成人工作台的关系
- 独立菜单组、独立路由、独立 IDB 命名空间
- 云同步独立信封（`student-backup`），与 `workbench-backup` 互不干扰
- 共用同一 WebDAV 凭据与同步代理

---

## 六、技术实现方案

### 6.1 路由与视图层
```
src/
├── views/
│   └── StudentView.vue            # 新增：学生工作台主视图（复用 WorkbenchView 布局）
├── components/
│   └── student/                   # 新增：学生工作台 SFC 目录
│       ├── StudentHome.vue
│       ├── StudentHabits.vue
│       ├── StudentHomework.vue
│       ├── StudentTimetable.vue
│       ├── StudentPlan.vue
│       ├── StudentReview.vue
│       ├── StudentMistakes.vue
│       ├── StudentReading.vue
│       ├── StudentExam.vue        # 基于 countdowns 的 exam 分类视图
│       ├── StudentDiary.vue       # 复用 diary
│       ├── StudentPomodoro.vue    # 复用 pomodoro
│       ├── StudentAchievements.vue
│       ├── StudentRewards.vue
│       └── StudentParent.vue
├── stores/
│   ├── studentHomework.ts
│   ├── studentTimetable.ts
│   ├── studentPlans.ts
│   ├── studentReview.ts
│   ├── studentMistakes.ts
│   ├── studentReading.ts
│   ├── studentAchievements.ts
│   └── studentRewards.ts
├── composables/
│   ├── studentHomeworkCore.ts
│   ├── studentTimetableCore.ts
│   ├── studentPlanCore.ts
│   ├── studentReviewCore.ts       # 艾宾浩斯算法
│   ├── studentMistakesCore.ts
│   ├── studentReadingCore.ts
│   ├── studentAchievementsCore.ts # 成就解锁规则
│   ├── studentRewardsCore.ts
│   └── studentStageCore.ts        # 学段切换/默认值播种
└── types/
    └── student.ts                 # 学生工作台全部接口（或并入 index.ts）
```

### 6.2 路由配置
```typescript
// src/router/index.ts
{
  path: '/student',
  name: 'student',
  component: () => import('@/views/StudentView.vue'),
}
```

### 6.3 菜单与学段过滤
- 新增 `studentMenuCore.ts`：14 项菜单（含学段可见性）
- 复用 `workbenchMenuCore` 的归一化/移动/改名机制
- 设置弹窗新增「学生工作台」tab，含学段切换器 + 菜单管理

### 6.4 学段切换核心逻辑
```typescript
// studentStageCore.ts
export type Stage = 'K' | 'P' | 'J'

export const STAGE_MENU_VISIBILITY: Record<Stage, Record<string, boolean>> = {
  K: { home: true, habits: true, reading: true, diary: true, achievements: true, rewards: true, parent: true, /* 其他 false */ },
  P: { home: true, habits: true, homework: true, timetable: true, reading: true, diary: true, pomodoro: false, achievements: true, rewards: true, parent: true, /* 其他 false */ },
  J: { home: true, habits: false, homework: true, timetable: true, plan: true, review: true, mistakes: true, reading: true, exam: true, diary: true, pomodoro: true, /* 其他 false */ },
}

export function seedStageDefaults(stage: Stage): Partial<StudentSettings> {
  // 返回该学段的默认学科、默认习惯、默认番茄钟时长等
}
```

### 6.5 一屏布局
- 复用 `usePanelPaging` + `panelPagingCore` + `PanelPager`
- 每个面板单独测量行高，写入 `.omo/evidence/student-onescreen/row-heights.json`
- 卡片网格：作业/错题/复习/阅读 = 5 列，课程表 = 7 列（按周）

### 6.6 云同步
- 复用 `useCloudSync`，新增 `student-backup` 信封
- 独立 `businessSignature`-style 签名函数：`studentSignature`
- 同一 WebDAV 凭据下新增 `student-backup.json` 文件

### 6.7 家长模式安全
- 家长入口设置 PIN（独立于密码库）
- PIN 通过 PBKDF2 + salt 存储在 `student_settings.parentPin`
- 家长配置项操作前校验 PIN

### 6.8 拍照与图片存储
- 错题本支持拍照上传
- 图片以 Blob 存 IndexedDB（独立 store `student_images`）
- 导出备份时 base64 编码（注意大文件分块）

### 6.9 主题与无障碍
- 新增 `student-dark.css`、`student-k.css`（幼儿园鲜艳风）、`student-j.css`（初中简洁风）
- 字号自适应（学段切换时切换 root font-size）
- 支持高对比度模式（家长可开启）

---

## 七、开发路径与里程碑

### M1：基础框架（首版）
- [ ] 类型定义 + studentStageCore
- [ ] StudentView 主视图 + 路由
- [ ] 菜单 system + 学段切换器
- [ ] 设置弹窗「学生工作台」tab
- [ ] 学生首页（问候 + 轮播骨架）

### M2：核心面板（小学优先）
- [ ] 作业管理（小学 3 科默认）
- [ ] 课程表（周视图 + 日视图）
- [ ] 阅读记录
- [ ] 习惯打卡（学段默认播种）
- [ ] 考试倒计时

### M3：初中增强
- [ ] 学习计划
- [ ] 复习计划（艾宾浩斯）
- [ ] 错题本（含拍照）
- [ ] 番茄钟学段适配

### M4：低龄游戏化
- [ ] 成就勋章墙
- [ ] 奖励积分系统
- [ ] 家长协同模式（PIN）
- [ ] 幼儿园图标化主题

### M5：云同步与导出
- [ ] student-backup v1 信封
- [ ] IDB v7 升级迁移
- [ ] 云同步冲突解决（复用现有机制）
- [ ] 备份技能扩展（easy-webtab-backup-editor 支持学生数据）

### M6：一屏布局与 QA
- [ ] 各面板行高测量
- [ ] Playwright QA 脚本（qa-student-onescreen.mjs）
- [ ] 学段切换回归测试

---

## 八、风险与对策

| 风险 | 等级 | 对策 |
|------|------|------|
| 学段切换误操作丢失菜单可见性 | 中 | 切换前二次确认 + 菜单可见性独立持久化（不随学段重置数据） |
| 错题拍照导致 IDB 体积膨胀 | 高 | 单图压缩到 200KB 内，超过 50 张提示导出归档 |
| 云同步学生数据与成人数据混淆 | 中 | 独立信封 `student-backup`，签名函数独立 |
| 家长 PIN 遗忘 | 中 | 提供「重置 PIN」入口（需主密码二次验证，类比密码库解锁） |
| 艾宾浩斯算法时区错误 | 中 | 复用 `dateKeyOf` 本地日期防 UTC 偏移 |
| 幼儿园 UI 适配工作量大 | 中 | 单独 `student-k.css`，不与成人 UI 共享样式 |
| 学段学科数量差异导致分页错乱 | 低 | 学科筛选 tabs 动态生成，分页基于实际数据 |

---

## 九、成功指标（KPI）

- **功能完成度**：14 个面板全部上线，3 个学段菜单正确
- **数据完整性**：备份导出/导入 round-trip 无丢失
- **性能**：首页加载 ≤2s，面板切换 ≤300ms
- **可用性**：幼儿园段 5 岁儿童在家长陪同下 5 分钟内完成一次打卡
- **云同步**：多设备数据冲突自动合并成功率 ≥95%

---

## 十、附录

### 10.1 学科默认清单
- **小学**：语文、数学、英语
- **初中**：语文、数学、英语、政治、历史、地理、生物、物理、化学
- **自定义**：用户可增删（如「信息技术」「体育」等）

### 10.2 艾宾浩斯复习周期表
| 阶段 | 间隔 | 说明 |
|------|------|------|
| 1 | 1 天 | 当晚复习 |
| 2 | 2 天 | 第三天复习 |
| 3 | 4 天 | 第七天复习 |
| 4 | 7 天 | 第二周复习 |
| 5 | 15 天 | 半月复习 |
| 6 | 30 天 | 月度复习 → 标记已掌握 |

### 10.3 默认勋章清单
| ID | 名称 | 图标 | 条件 |
|----|------|------|------|
| streak-7 | 一周坚持 | 🔥 | 连续打卡 7 天 |
| streak-30 | 月度坚持 | 🌟 | 连续打卡 30 天 |
| streak-100 | 百日坚持 | 🏆 | 连续打卡 100 天 |
| book-10 | 阅读新秀 | 📚 | 累计阅读 10 本 |
| book-50 | 阅读达人 | 📖 | 累计阅读 50 本 |
| book-100 | 阅读大师 | 🎓 | 累计阅读 100 本 |
| pomo-50 | 专注新手 | ⏰ | 累计 50 个番茄钟 |
| pomo-200 | 专注达人 | ⚡ | 累计 200 个番茄钟 |
| pomo-500 | 专注大师 | 💎 | 累计 500 个番茄钟 |
| hw-rate-95 | 作业标兵 | ✅ | 作业完成率 95%+ |

### 10.4 命名规范
- ID 前缀：`hw_`（作业）、`pl_`（计划）、`rv_`（复习）、`mk_`（错题）、`rd_`（阅读）、`ach_`（成就）、`rw_`（奖励交易）、`rwi_`（奖励项）
- IDB store 前缀：`student_*`
- 备份信封：`type: "student-backup"`
- 路由：`/student`

### 10.5 与现有规则的兼容
- TypeScript strict + noUnusedLocals
- `<script setup lang="ts">` only
- 路径别名 `@/`
- 纯逻辑放 composables/*Core.ts，组件禁止内联重算
- IDB 写入前 `toRaw()`
- 备份版本守卫：`<1 || >1` 拒绝
- WORKBENCH_DATA_VERSION 升级到 9（v9 起支持学生数据）

---

> **下一步**：PRD 评审通过后，按 M1-M6 里程碑实施。建议从 M1 基础框架 + M2 小学核心面板起步，先验证学段切换与菜单隔离机制。
