<script setup lang="ts">
// 学生工作台主视图（路由 /student）
// 布局复刻 WorkbenchView：左菜单 + 右内容条件渲染
// M1 基础框架：仅 home 面板实施 StudentHome；其他 13 面板用 StudentPanelPlaceholder 占位（M2-M4 替换）
// 学段首次进入未初始化时强制弹框选择学段（StageOnboarding 内嵌）

import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useStudentRewardsStore } from '@/stores/studentRewards'
import { useStudentHabitsStore } from '@/stores/studentHabits'
import { useStudentHomeworkStore } from '@/stores/studentHomework'
import { useStudentReadingStore } from '@/stores/studentReading'
import { useStudentDiaryStore } from '@/stores/studentDiary'
import { useStudentHealthStore } from '@/stores/studentHealth'
import { useStudentGradesStore } from '@/stores/studentGrades'
import { useAppSettingsStore } from '@/stores/settings'
import StudentHealth from '@/components/student/StudentHealth.vue'
import StudentGrades from '@/components/student/StudentGrades.vue'
import StudentHome from '@/components/student/StudentHome.vue'
import StudentHabits from '@/components/student/StudentHabits.vue'
import StudentHomework from '@/components/student/StudentHomework.vue'
import StudentTimetable from '@/components/student/StudentTimetable.vue'
import StudentReading from '@/components/student/StudentReading.vue'
import StudentExam from '@/components/student/StudentExam.vue'
import StudentEducation from '@/components/student/StudentEducation.vue'
import StudentDiary from '@/components/student/StudentDiary.vue'
import StudentPlan from '@/components/student/StudentPlan.vue'
import StudentReview from '@/components/student/StudentReview.vue'
import StudentMistakes from '@/components/student/StudentMistakes.vue'
import StudentPomodoro from '@/components/student/StudentPomodoro.vue'
import StudentAchievements from '@/components/student/StudentAchievements.vue'
import StudentReward from '@/components/student/StudentReward.vue'
import StudentParent from '@/components/student/StudentParent.vue'
import StudentParentPinDialog from '@/components/student/StudentParentPinDialog.vue'
import StudentPanelPlaceholder from '@/components/student/StudentPanelPlaceholder.vue'
import StudentOnboarding from '@/components/student/StudentOnboarding.vue'
import AppSettingsDialog from '@/components/AppSettingsDialog.vue'
import PageSwitcher from '@/components/PageSwitcher.vue'
import Icon from '@/components/Icon.vue'
import { useCloudSync } from '@/composables/useCloudSync'
import type { SyncStatus } from '@/composables/useCloudSync'

const studentStore = useStudentSettingsStore()
const settingsStore = useAppSettingsStore()
const rewardsStore = useStudentRewardsStore()
const habitsStore = useStudentHabitsStore()
const homeworkStore = useStudentHomeworkStore()
const readingStore = useStudentReadingStore()
const diaryStore = useStudentDiaryStore()
const healthStore = useStudentHealthStore()
const gradesStore = useStudentGradesStore()
const showSettingsDialog = ref(false)

// 学生菜单键白名单（与 STUDENT_MENU_KEYS 对齐；home 恒居首位）
// 15 项（含 health 健康管理）；菜单显示顺序与开关由 studentSettings.menuItems 控制
type StudentSectionKey =
  | 'home' | 'habits' | 'homework' | 'timetable' | 'plan'
  | 'review' | 'mistakes' | 'reading' | 'exam' | 'grades' | 'education' | 'diary'
  | 'pomodoro' | 'achievements' | 'rewards' | 'parent' | 'health'

const SECTION_KEYS: readonly StudentSectionKey[] = [
  'home', 'habits', 'homework', 'timetable', 'plan',
  'review', 'mistakes', 'reading', 'exam', 'grades', 'education', 'diary',
  'pomodoro', 'achievements', 'rewards', 'parent', 'health'
]

const SECTION_SET: ReadonlySet<StudentSectionKey> = new Set(SECTION_KEYS)

const activeSection = ref<StudentSectionKey>('home')
const onboardingVisible = ref(false)
const sidebarCollapsed = ref(false)

// ============ 家长模式：会话态 PIN 守卫 ============
/** 家长 PIN 弹框可见性（含 setup/verify 两种模式，由 StudentParentPinDialog 内部按 hasParentPin 切换） */
const parentPinDialogVisible = ref(false)
/** 家长模式是否已解锁（会话态；页面失活/关闭自动失效） */
const parentModeUnlocked = ref(false)
/** 会话解锁后，过期时间戳（ms，Date.now()）；默认 5 分钟未操作 → 自动重锁 */
const PARENT_SESSION_TIMEOUT_MS = 5 * 60 * 1000
let parentExpireAt = 0
let parentActivityTimer: number | null = null
let parentLockTick: number | null = null

/** 家长模式剩余解锁时间秒（用于横条展示，≤0 显示锁定） */
const parentUnlockRemainingSec = ref<number>(0)

function extendParentSession() {
  if (!parentModeUnlocked.value) return
  parentExpireAt = Date.now() + PARENT_SESSION_TIMEOUT_MS
}
function lockParentMode() {
  parentModeUnlocked.value = false
  parentExpireAt = 0
  parentUnlockRemainingSec.value = 0
  if (parentLockTick !== null) { clearInterval(parentLockTick); parentLockTick = null }
  if (parentActivityTimer !== null) { clearTimeout(parentActivityTimer); parentActivityTimer = null }
}
function startParentLockTick() {
  if (parentLockTick !== null) return
  parentLockTick = window.setInterval(() => {
    if (!parentModeUnlocked.value) return
    const remainMs = parentExpireAt - Date.now()
    parentUnlockRemainingSec.value = remainMs > 0 ? Math.ceil(remainMs / 1000) : 0
    if (remainMs <= 0) lockParentMode()
  }, 1000) as unknown as number
}
/** 用户活动（点击/按键）时刷新会话有效期 */
function onParentUserActivity() {
  if (!parentModeUnlocked.value) return
  extendParentSession()
}

/**
 * 打开家长 PIN 弹窗：
 * - 若已解锁：不弹窗（调用方可先判断）
 * - 否则打开 StudentParentPinDialog（内部按 hasParentPin 切换 setup/verify 模式）
 */
function openParentPinDialog() {
  if (parentModeUnlocked.value) return
  parentPinDialogVisible.value = true
}

/**
 * PIN 弹窗回调：无论 setup 成功 或 verify 成功，都表示家长身份已确认
 * → 开启 5 分钟会话；手动锁定/超时/关闭标签页 即失效
 */
function onParentPinAuthenticated() {
  parentModeUnlocked.value = true
  parentPinDialogVisible.value = false
  extendParentSession()
  startParentLockTick()
}
/** 家长模式下横条「锁定」按钮：立即失效 */
function handleLockParentMode() {
  if (!parentModeUnlocked.value) return
  if (!confirm('确定立即锁定家长模式？（需要再次输入 PIN 解锁）')) return
  lockParentMode()
}

// 会话期活动监听：任意点击/按键刷新解锁有效期
onMounted(() => {
  document.addEventListener('click', onParentUserActivity, { passive: true })
  document.addEventListener('keydown', onParentUserActivity, { passive: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onParentUserActivity)
  document.removeEventListener('keydown', onParentUserActivity)
  lockParentMode()
})

// 是否存在家长 PIN（用于横条展示「未设置 / 已设置」提示）
const parentHasPin = computed(() => studentStore.hasParentPin())
const parentLockInfoText = computed(() => {
  if (parentModeUnlocked.value) {
    const s = parentUnlockRemainingSec.value
    if (s <= 0) return '已解锁'
    if (s >= 60) return `已解锁 · 剩余 ${Math.ceil(s / 60)} 分钟`
    return `已解锁 · 剩余 ${s} 秒`
  }
  return parentHasPin.value ? '已设置家长 PIN' : '未设置家长 PIN'
})

// 学生菜单渲染项（按 store 计算的可见项）
const menuItems = computed(() => studentStore.menuItems)

// 当前激活区是否可见（被关时回退首项）
function isSectionEnabled(key: StudentSectionKey): boolean {
  return key === 'home' || studentStore.isMenuEnabled(key)
}

// 跳转白名单 + 开关双守卫
function navigateTo(section: StudentSectionKey) {
  if (!SECTION_SET.has(section)) return
  if (section !== 'home' && !isSectionEnabled(section)) return
  activeSection.value = section
}

// 学段徽标信息
const stageBadge = computed(() => studentStore.stageBadgeInfo)
const stageLabel = computed(() => studentStore.stageLabelName)

// ===== 右上角云同步按钮（与工作台复用同一套开关：cloudSyncEnabled 时在设置按钮左边显示） =====
const cloudSync = useCloudSync()
const syncBusy = ref(false)
const cloudEnabled = computed(() => !!settingsStore.cloudSyncEnabled)
const syncStatusClass = computed(
  (): Record<string, boolean> => ({
    'st-sync-btn-pending': cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing',
    'st-sync-btn-conflict': cloudSync.status.value === 'conflict',
    'st-sync-btn-error': cloudSync.status.value === 'error'
  })
)
function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}` }
function formatDate(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
const syncLabel = computed((): string => {
  switch (cloudSync.status.value as SyncStatus) {
    case 'pulling': return '拉取中…'
    case 'pushing': return '推送中…'
    case 'conflict': return '处理冲突'
    case 'error': return '同步失败'
    default: return '云同步'
  }
})
const syncTip = computed((): string => {
  const t = cloudSync.lastSyncAt.value
  if (!t) return '未同步过；点击立即同步'
  const d = new Date(t)
  return `上次同步：${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}；点击立即同步`
})
async function handleSyncNowClick(): Promise<void> {
  if (syncBusy.value) return
  syncBusy.value = true
  await cloudSync.syncNow()
  syncBusy.value = false
}

// onMounted：加载学生设置；若未初始化（stageSeeded !== stage）弹学段引导
// 修复历史数据：加载 rewards+habits+homework+reading 后，存量回溯补分（sourceId 幂等）
onMounted(async () => {
  await studentStore.loadSettings()
  // 首次进入或学段未播种 → 弹学段引导
  const s = studentStore.settings
  if (s.stageSeeded !== studentStore.stage) {
    onboardingVisible.value = true
  }
  // 当前激活区被关 → 回退首个可见项
  if (activeSection.value !== 'home' && !isSectionEnabled(activeSection.value)) {
    activeSection.value = 'home'
  }
  // 存量回溯加分：顺序串行，避免并发 IDB 事务互相覆盖
  try {
    await rewardsStore.loadRewards()
    await habitsStore.loadHabits()
    await homeworkStore.loadHomework()
    await readingStore.loadReading()
    await diaryStore.loadDiary()
    await healthStore.loadHealth()
    await gradesStore.loadGrades()
    await rewardsStore.backfillFromAll({
      habits: habitsStore.habits,
      habitRecords: habitsStore.records,
      homeworks: homeworkStore.entries,
      readings: readingStore.entries
    })
  } catch (e) {
    console.warn('[StudentView] backfill earn failed', e)
  }
})

// 监听菜单变化：当前激活区被关时回退首项（home）
watch(
  () => menuItems.value.map(i => i.key).join('|'),
  () => {
    if (activeSection.value !== 'home' && !isSectionEnabled(activeSection.value)) {
      activeSection.value = 'home'
    }
  }
)

// 学段引导完成回调：标记学段已播种，下次进入不再弹框
async function onOnboardingComplete() {
  await studentStore.markStageSeeded(studentStore.stage)
  onboardingVisible.value = false
}
</script>

<template>
  <div class="st-shell">
    <header class="st-header">
      <div class="st-header-left">
        <PageSwitcher current="student" />
        <span
          class="st-stage-badge"
          :style="{ backgroundColor: stageBadge.color }"
          :title="`当前学段：${stageLabel}`"
        >{{ stageBadge.label }}</span>
      </div>
      <div class="st-header-right">
        <!-- 家长模式横条：在任意 section 都可快捷解锁/设置 PIN -->
        <div
          class="st-parent-bar"
          :class="{ unlocked: parentModeUnlocked, 'no-pin': !parentHasPin }"
          title="家长协同：点击解锁家长模式（可在家长协同面板加分、发放勋章、管理任务与奖励）"
        >
          <span class="st-parent-bar-icon">🔐</span>
          <span class="st-parent-bar-text">{{ parentLockInfoText }}</span>
          <template v-if="parentModeUnlocked">
            <button
              type="button"
              class="st-parent-bar-btn"
              @click.stop="handleLockParentMode"
              title="锁定家长模式"
            >锁定</button>
          </template>
          <template v-else>
            <button
              type="button"
              class="st-parent-bar-btn primary"
              @click.stop="openParentPinDialog"
              :title="parentHasPin ? '输入 PIN 解锁家长模式' : '先设置家长 PIN（4-8 位数字）'"
            >{{ parentHasPin ? '解锁' : '设置 PIN' }}</button>
          </template>
        </div>
        <button
          v-if="cloudEnabled"
          class="st-btn st-sync-btn"
          :class="syncStatusClass"
          :title="syncTip"
          data-testid="st-sync-now"
          :disabled="syncBusy || cloudSync.status.value === 'pulling' || cloudSync.status.value === 'pushing'"
          @click="handleSyncNowClick"
        ><Icon name="cloud" :size="14" /> {{ syncLabel }}</button>
        <button class="st-btn" @click="showSettingsDialog = true" title="设置">
          <Icon name="cog" />
        </button>
      </div>
    </header>

    <div class="st-body">
      <nav class="st-menu" :class="{ collapsed: sidebarCollapsed }">
        <button
          class="st-sidebar-toggle"
          @click="sidebarCollapsed = !sidebarCollapsed"
          :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
        >
          <span class="st-menu-icon">
            <Icon :name="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" />
          </span>
          <span class="st-menu-label">{{ sidebarCollapsed ? '展开' : '收起' }}</span>
        </button>
        <div class="st-menu-list">
          <button
            v-for="item in menuItems"
            :key="item.key"
            class="st-menu-item"
            :class="{ active: activeSection === item.key }"
            :title="item.label"
            :aria-label="item.label"
            @click="navigateTo(item.key as StudentSectionKey)"
          >
            <span class="st-menu-icon"><Icon :name="item.icon" /></span>
            <span class="st-menu-label">{{ item.label }}</span>
          </button>
        </div>
      </nav>

      <main class="st-content">
        <StudentHome v-if="activeSection === 'home'" @navigate="(s: string) => navigateTo(s as StudentSectionKey)" />
        <StudentHabits v-else-if="activeSection === 'habits'" />
        <StudentHomework v-else-if="activeSection === 'homework'" />
        <StudentTimetable v-else-if="activeSection === 'timetable'" />
        <StudentReading v-else-if="activeSection === 'reading'" />
        <StudentExam v-else-if="activeSection === 'exam'" />
        <StudentEducation v-else-if="activeSection === 'education'" />
        <StudentDiary v-else-if="activeSection === 'diary'" />
        <StudentPlan v-else-if="activeSection === 'plan'" />
        <StudentReview v-else-if="activeSection === 'review'" />
        <StudentMistakes v-else-if="activeSection === 'mistakes'" />
        <StudentPomodoro v-else-if="activeSection === 'pomodoro'" />
        <StudentAchievements v-else-if="activeSection === 'achievements'" />
        <StudentReward v-else-if="activeSection === 'rewards'" />
        <StudentParent
          v-else-if="activeSection === 'parent'"
          :parent-mode="parentModeUnlocked"
          @open-pin="openParentPinDialog"
        />
        <StudentHealth v-else-if="activeSection === 'health'" />
        <StudentGrades v-else-if="activeSection === 'grades'" />
        <StudentPanelPlaceholder
          v-else
          :section="activeSection"
          :section-label="menuItems.find(i => i.key === activeSection)?.label ?? ''"
        />
      </main>
    </div>

    <StudentOnboarding
      v-if="onboardingVisible"
      @complete="onOnboardingComplete"
      @close="onboardingVisible = false"
    />

    <!-- 家长 PIN 弹窗（按 hasParentPin 自动切换 setup/verify） -->
    <StudentParentPinDialog
      v-if="parentPinDialogVisible"
      :visible="parentPinDialogVisible"
      :mode="parentHasPin ? 'verify' : 'setup'"
      @cancel="parentPinDialogVisible = false"
      @verified="onParentPinAuthenticated"
      @setup-complete="onParentPinAuthenticated"
      @update:visible="(v) => { if (!v) parentPinDialogVisible = false }"
    />

    <AppSettingsDialog
      v-if="showSettingsDialog"
      source="student"
      @close="showSettingsDialog = false"
    />
  </div>
</template>

<style scoped>
.st-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--color-bg, #f5f5f5);
  color: var(--color-text, #1f2937);
}

.st-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: var(--color-surface, #ffffff);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  min-height: 48px;
}

.st-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.st-header-left h1 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.st-stage-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.st-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.st-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}
.st-btn:hover {
  background: var(--color-hover, #f3f4f6);
}

/* ============ 家长模式横条 ============ */
.st-parent-bar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface-2, #fafafa);
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  transition: all 0.15s;
  user-select: none;
}
.st-parent-bar.unlocked {
  border-color: var(--color-primary, #10b981);
  background: rgba(16, 185, 129, 0.10);
  color: #065f46;
}
.st-parent-bar.no-pin {
  border-style: dashed;
  color: #b45309;
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.35);
}
.st-parent-bar-icon { font-size: 14px; line-height: 1; }
.st-parent-bar-text { font-weight: 500; }
.st-parent-bar-btn {
  border: 0;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #d1d5db);
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
}
.st-parent-bar-btn:hover {
  background: var(--color-hover, #f3f4f6);
  color: var(--color-text, #1f2937);
}
.st-parent-bar-btn.primary {
  background: var(--color-primary, #10b981);
  border-color: transparent;
  color: #fff;
}
.st-parent-bar-btn.primary:hover {
  filter: brightness(1.06);
  transform: translateY(-0.5px);
}
.st-parent-bar.unlocked .st-parent-bar-btn { color: #b91c1c; border-color: rgba(185, 28, 28, 0.35); background: #fff; }
.st-parent-bar.unlocked .st-parent-bar-btn:hover { background: rgba(185, 28, 28, 0.08); }

/* ===== 右上角云同步按钮（头部设置按钮左侧）状态视觉 ===== */
.st-sync-btn {
  gap: 4px;
  position: relative;
}
.st-sync-btn:disabled { cursor: not-allowed; opacity: 0.7; }
.st-sync-btn-pending {
  color: #2563eb;
  animation: st-sync-pulse 1.4s ease-in-out infinite;
}
.st-sync-btn-conflict { color: #b45309; }
.st-sync-btn-error { color: #b91c1c; }
@keyframes st-sync-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

.st-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.st-menu {
  width: 180px;
  border-right: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface, #ffffff);
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  min-height: 0;
  transition: width 0.2s;
}
.st-menu.collapsed {
  width: 56px;
}
.st-menu.collapsed .st-menu-label {
  display: none;
}

/* 菜单项列表：可独立纵向滚动，避免菜单项超出后被裁切 */
.st-menu-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border, #e5e7eb) transparent;
  padding-bottom: 8px;
}
.st-menu-list::-webkit-scrollbar {
  width: 6px;
}
.st-menu-list::-webkit-scrollbar-thumb {
  background: var(--color-border, #e5e7eb);
  border-radius: 3px;
}

.st-sidebar-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: transparent;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  width: 100%;
  font-size: 14px;
  transition: background-color 0.15s, color 0.15s;
}
.st-sidebar-toggle:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-primary, #3b82f6);
}
.st-menu.collapsed .st-sidebar-toggle {
  justify-content: center;
  padding: 10px 0;
}

.st-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}
.st-menu-item:hover {
  background: var(--color-hover, #f3f4f6);
}
.st-menu-item.active {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  border-left: 3px solid var(--color-primary, #3b82f6);
  padding-left: 11px;
}

.st-menu-icon {
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.st-menu-label {
  font-size: 13px;
}

.st-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 16px;
}

@media (min-width: 769px) {
  .st-content {
    overflow: hidden;
  }
  .st-content > * {
    flex: 1;
    min-height: 0;
  }
}

@media (max-width: 768px) {
  .st-menu {
    width: 100%;
    height: auto;
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    padding: 4px;
  }
  .st-sidebar-toggle {
    display: none;
  }
  .st-menu-list {
    flex: 0 0 auto;
    min-height: 0;
    overflow-y: visible;
    overflow-x: visible;
    flex-direction: row;
    padding-bottom: 0;
  }
  .st-menu-item {
    flex-direction: column;
    padding: 6px 10px;
    gap: 2px;
  }
  .st-menu-label {
    font-size: 11px;
  }
}
</style>
