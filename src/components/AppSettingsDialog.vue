<script setup lang="ts">
import { reactive, ref, onMounted, onUnmounted } from 'vue'
import {
  useAppSettingsStore,
  DIALOG_LABELS,
  DIALOG_DEFAULTS,
  NAV_DIALOG_IDS,
  WB_DIALOG_IDS
} from '@/stores/settings'
import type { DialogId } from '@/stores/settings'
import type { WorkbenchMenuItem } from '@/composables/workbenchMenuCore'

// 弹窗 id 列表：从导出的契约表派生（与 store 内部 DIALOG_IDS 顺序一致），
// 作为 drafts/syncAll 的全量来源；渲染分组用下方导出的 NAV/WB 数组
const DIALOG_IDS = Object.keys(DIALOG_DEFAULTS) as DialogId[]

// 当前激活的设置分组 tab（导航设置 / 工作台设置）
const activeTab = ref<'nav' | 'wb'>('nav')

const emit = defineEmits<{
  close: []
}>()

const store = useAppSettingsStore()

// ========================================
// 草稿状态：以字符串保存，允许输入框为空/未提交；
// 输入时实时提交给 store（即时预览），失焦时从 store 的 clamp 值重新同步
// ========================================
function createDrafts(): Record<DialogId, { width: string; height: string }> {
  const drafts = {} as Record<DialogId, { width: string; height: string }>
  for (const id of DIALOG_IDS) {
    drafts[id] = {
      width: String(store.dialogSizes[id].width),
      height: String(store.dialogSizes[id].height)
    }
  }
  return drafts
}

const drafts = reactive(createDrafts())

// 将某一行的草稿从 store（clamp 后）值重新同步
function syncRow(id: DialogId) {
  drafts[id].width = String(store.dialogSizes[id].width)
  drafts[id].height = String(store.dialogSizes[id].height)
}

// 全部行重新同步（store 外部变更如全局重置后调用）
function syncAll() {
  for (const id of DIALOG_IDS) {
    syncRow(id)
  }
}

// 宽度输入：草稿跟随输入框，合法数字才提交给 store（clamp 由 store 负责）
function onWidthInput(id: DialogId, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  drafts[id].width = raw
  const n = Number(raw)
  if (raw === '' || !Number.isFinite(n)) return
  store.setDialogSize(id, n, store.dialogSizes[id].height)
}

// 高度输入
function onHeightInput(id: DialogId, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  drafts[id].height = raw
  const n = Number(raw)
  if (raw === '' || !Number.isFinite(n)) return
  store.setDialogSize(id, store.dialogSizes[id].width, n)
}

// 失焦：草稿回退到 store 的 clamp 值
function onWidthBlur(id: DialogId) {
  drafts[id].width = String(store.dialogSizes[id].width)
}

function onHeightBlur(id: DialogId) {
  drafts[id].height = String(store.dialogSizes[id].height)
}

// 单行恢复默认
function resetRow(id: DialogId) {
  store.setDialogSize(id, DIALOG_DEFAULTS[id].width, DIALOG_DEFAULTS[id].height)
  syncRow(id)
}

// 全局恢复默认
function resetAll() {
  store.resetDefaults()
  syncAll()
}

// ========================================
// 工作台菜单（仅工作台设置 tab 展示）：排序 + 改名 + 区块恢复默认
// ========================================

// 改名输入直接绑定 store 状态（无草稿机制，Metis F11）：
// 输入框 :value = menuEditing[key] ?? item.label —— menuEditing 仅暂存「正在输入」的文本，
// 提交/还原后立即删除对应条目，值回落到 store 派生 label（store.workbenchMenuItems computed 重算）。
// 因此全局 resetAll 重置 store 后 computed 重新派生、menuEditing 为空 → 输入框自动展示新默认值，
// 不会残留旧值（响应式重渲染，无需为区块做任何同步）。
const menuEditing = reactive<Record<string, string>>({})

// 上移/下移：disabled 由模板按 home/边界判定；store 结果兜底（locked/boundary/not-found 直接忽略，无 toast——与「可用+toast」惯例有意偏离）
function onMoveMenu(key: string, dir: 'up' | 'down'): void {
  store.moveWorkbenchMenuItem(key, dir)
}

// 上移按钮禁用：home 恒禁用（store 返回 locked）；index ≤ 1（index 0 恒为 home，index 1 为首个可移动项）达上边界
function isMenuUpDisabled(item: WorkbenchMenuItem, index: number): boolean {
  return item.key === 'home' || index <= 1
}

// 下移按钮禁用：home 恒禁用；末行（index === items.length - 1）达下边界
function isMenuDownDisabled(item: WorkbenchMenuItem, index: number): boolean {
  return item.key === 'home' || index >= store.workbenchMenuItems.length - 1
}

// 改名提交（blur / Enter）：先按 code point 校验 ≤ 12（Metis N2：代理对不得绕过上限）；
// trim 后为空 → 还原上值（纯本地回退，不调 store）；store 拒绝（ok:false）→ 删除暂存即回落到旧值
function commitMenuName(key: string): void {
  const raw = menuEditing[key] ?? ''
  const name = raw.trim()
  if (!name || Array.from(name).length > 12) {
    delete menuEditing[key]
    return
  }
  store.renameWorkbenchMenuItem(key, name)
  delete menuEditing[key]
}

// Esc 还原：删除暂存，输入框回落到 store 当前值（不调 store）
function revertMenuName(key: string): void {
  delete menuEditing[key]
}

// ESC 键关闭弹框
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="manager-overlay" @click.self="emit('close')">
    <div class="manager">
      <div class="manager-header">
        <h2>⚙️ 设置</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="manager-body">
        <div class="settings-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'nav' }"
            :aria-selected="activeTab === 'nav'"
            @click="activeTab = 'nav'"
          >导航设置</button>
          <button
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: activeTab === 'wb' }"
            :aria-selected="activeTab === 'wb'"
            @click="activeTab = 'wb'"
          >工作台设置</button>
        </div>

        <p class="hint">调整各弹窗的默认尺寸，修改即时生效并自动保存。</p>

        <!-- 工作台菜单（仅工作台设置 tab）：排序 + 改名 + 区块恢复默认；主页恒置顶不可动 -->
        <div v-if="activeTab === 'wb'" class="wb-menu-config">
          <div class="wb-menu-head">
            <h3 class="wb-menu-title">工作台菜单</h3>
            <button type="button" class="row-reset" data-testid="wbmenu-reset" @click="store.resetWorkbenchMenu()">恢复默认</button>
          </div>
          <p class="wb-menu-hint">主页固定置顶，不可调整顺序；位于最前/最后时按钮禁用</p>

          <div class="wb-menu-list">
            <div
              v-for="(item, index) in store.workbenchMenuItems"
              :key="item.key"
              class="wb-menu-row"
              :data-testid="`wbmenu-row-${item.key}`"
            >
              <span class="wb-menu-icon">{{ item.icon }}</span>
              <input
                type="text"
                class="wb-menu-name-input"
                maxlength="12"
                :data-testid="`wbmenu-name-${item.key}`"
                :aria-label="`${item.label}名称`"
                :value="menuEditing[item.key] ?? item.label"
                @input="menuEditing[item.key] = ($event.target as HTMLInputElement).value"
                @blur="commitMenuName(item.key)"
                @keydown.enter="commitMenuName(item.key)"
                @keydown.esc.stop="revertMenuName(item.key)"
              />
              <div class="wb-menu-actions">
                <button
                  type="button"
                  class="wb-menu-btn"
                  :data-testid="`wbmenu-up-${item.key}`"
                  :disabled="isMenuUpDisabled(item, index)"
                  :aria-disabled="isMenuUpDisabled(item, index) ? 'true' : 'false'"
                  @click="onMoveMenu(item.key, 'up')"
                >上移</button>
                <button
                  type="button"
                  class="wb-menu-btn"
                  :data-testid="`wbmenu-down-${item.key}`"
                  :disabled="isMenuDownDisabled(item, index)"
                  :aria-disabled="isMenuDownDisabled(item, index) ? 'true' : 'false'"
                  @click="onMoveMenu(item.key, 'down')"
                >下移</button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-grid">
          <div class="grid-header">
            <span class="col-label">弹窗</span>
            <span>宽度 (px)</span>
            <span>高度 (vh)</span>
            <span class="col-action"></span>
          </div>

          <div v-for="id in activeTab === 'nav' ? NAV_DIALOG_IDS : WB_DIALOG_IDS" :key="id" class="settings-row">
            <span class="row-label">{{ DIALOG_LABELS[id] }}</span>

            <div class="field">
              <input
                type="number"
                min="400"
                max="1600"
                step="1"
                class="num-input"
                :aria-label="`${DIALOG_LABELS[id]}宽度`"
                :value="drafts[id].width"
                @input="onWidthInput(id, $event)"
                @blur="onWidthBlur(id)"
              />
              <span class="unit">px</span>
            </div>

            <div class="field">
              <input
                type="number"
                min="30"
                max="100"
                step="1"
                class="num-input"
                :aria-label="`${DIALOG_LABELS[id]}高度`"
                :value="drafts[id].height"
                @input="onHeightInput(id, $event)"
                @blur="onHeightBlur(id)"
              />
              <span class="unit">vh</span>
            </div>

            <button class="row-reset" @click="resetRow(id)">恢复默认</button>
          </div>
        </div>
      </div>

      <div class="manager-footer">
        <span class="footer-hint">修改即时生效</span>
        <div class="footer-actions">
          <button class="btn-reset-all" @click="resetAll">恢复默认</button>
          <button class="btn-cancel" @click="emit('close')">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manager-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.manager {
  background-color: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 720px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-modal);
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
  flex-shrink: 0;
}

.manager-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--text-primary, var(--color-text));
}

.manager-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.hint {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  margin: 0 0 16px 0;
}

/* 顶部 tab 栏（视觉对齐 workbench 面板 tabs，如 WorkbenchHealth.vue 的 .hd-tab） */
.settings-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  background-color: var(--bg-card, var(--color-bg-card));
  color: var(--text-secondary, var(--color-text-secondary));
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.tab-btn:hover {
  background-color: var(--bg-secondary, var(--color-bg-hover));
  color: var(--accent-color, var(--color-primary));
}

.tab-btn.active {
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--accent-color, var(--color-primary));
  font-weight: 600;
}

:root.dark .tab-btn {
  background-color: var(--bg-secondary, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .tab-btn:hover {
  background-color: var(--hover-bg, #374151);
  color: var(--text-primary, #f9fafb);
}

:root.dark .tab-btn.active {
  background-color: #1e3a5f;
  color: #60a5fa;
}

/* 设置表格 */
.settings-grid {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  overflow: hidden;
}

.grid-header,
.settings-row {
  display: grid;
  grid-template-columns: minmax(100px, 1.4fr) minmax(120px, 1fr) minmax(110px, 1fr) 92px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.grid-header {
  background: var(--bg-secondary, var(--color-bg-hover));
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted, var(--color-text-muted));
}

.settings-row {
  border-top: 1px solid var(--border-color, var(--color-border));
}

.row-label {
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.num-input {
  width: 90px;
  padding: 6px 8px;
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.num-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

.unit {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  white-space: nowrap;
}

/* 重置类按钮共用样式 */
.row-reset,
.btn-reset-all {
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.row-reset {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.btn-reset-all {
  padding: 10px 16px;
  font-size: 14px;
  border-radius: var(--radius-md);
}

.row-reset:hover,
.btn-reset-all:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* 底部操作栏 */
.manager-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color, var(--color-border));
  flex-shrink: 0;
}

.footer-hint {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  padding: 10px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--hover-bg, var(--color-bg-active));
}

/* 工作台菜单配置区块（独立于 .settings-grid，不复用其列定义——R6） */
.wb-menu-config {
  margin-bottom: 20px;
  padding: 14px;
  background-color: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md);
}

.wb-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wb-menu-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.wb-menu-hint {
  margin: 6px 0 12px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.wb-menu-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-menu-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wb-menu-icon {
  flex-shrink: 0;
  width: 24px;
  font-size: 16px;
  text-align: center;
}

.wb-menu-name-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--text-primary, var(--color-text));
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.wb-menu-name-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

.wb-menu-actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

.wb-menu-btn {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast, 0.15s ease);
}

.wb-menu-btn:hover:not(:disabled) {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.wb-menu-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* 暗色模式：沿用文件现有 :root.dark 变量覆盖惯例，确保区块文字可读 */
:root.dark .wb-menu-config {
  background-color: var(--bg-secondary, #1f2937);
  border-color: var(--border-color, #374151);
}

:root.dark .wb-menu-title {
  color: var(--text-primary, #f9fafb);
}

:root.dark .wb-menu-hint {
  color: var(--text-muted, #9ca3af);
}

:root.dark .wb-menu-name-input {
  color: var(--text-primary, #f9fafb);
  background-color: var(--input-bg, #111827);
  border-color: var(--border-color, #374151);
}

:root.dark .wb-menu-btn {
  color: var(--text-secondary, #d1d5db);
  background-color: var(--bg-card, #1f2937);
  border-color: var(--border-color, #374151);
}

@media (max-width: 640px) {
  .manager {
    max-height: 90vh;
  }

  .grid-header {
    display: none;
  }

  .settings-row {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .row-label {
    grid-column: 1 / -1;
  }

  .row-reset {
    grid-column: 1 / -1;
    justify-self: end;
  }
}
</style>
