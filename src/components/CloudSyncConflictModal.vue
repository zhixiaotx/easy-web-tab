<script setup lang="ts">
import { computed } from 'vue'
import { useCloudSync } from '@/composables/useCloudSync'
import type { WorkbenchData } from '@/types'

const cloudSync = useCloudSync()

const localTs = computed(() => cloudSync.conflictData.value?.local?.exportedAt ?? '')
const remoteTs = computed(() => cloudSync.conflictData.value?.remote?.pushedAt ?? 0)
const remoteClientId = computed(() => cloudSync.conflictData.value?.remote?.clientId ?? '未知设备')

function formatTime(isoOrTs: string | number): string {
  if (!isoOrTs) return '未记录'
  const d = typeof isoOrTs === 'number' ? new Date(isoOrTs) : new Date(isoOrTs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 递归排序 key 后 JSON 序列化——消除 key 顺序差异 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']'
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}'
}

/** 差异摘要：逐 store 比较稳定序列化后字符串是否一致 */
const diffSummary = computed<{ name: string; local: number; remote: number }[]>(() => {
  const data = cloudSync.conflictData.value
  if (!data) return []
  const keys: Array<{ k: keyof WorkbenchData; name: string }> = [
    { k: 'todos', name: '待办' },
    { k: 'notes', name: '便签' },
    { k: 'diary', name: '日记' },
    { k: 'countdowns', name: '倒计时' },
    { k: 'passwords', name: '密码' },
    { k: 'health', name: '健康' },
    { k: 'ledger', name: '记账' },
    { k: 'business', name: '销售记账' },
    { k: 'settings', name: '设置' },
    { k: 'pomodoro', name: '番茄钟' },
    { k: 'habits', name: '习惯' },
    { k: 'prefs', name: '偏好配置' }
  ]
  const out: { name: string; local: number; remote: number }[] = []
  for (const { k, name } of keys) {
    const lv = data.local[k]
    const rv = data.remote[k]
    try {
      const l = lv !== undefined ? stableStringify(lv).length : 0
      const r = rv !== undefined ? stableStringify(rv).length : 0
      if (l !== r) out.push({ name, local: l, remote: r })
    } catch {}
  }
  return out
})
</script>

<template>
  <Transition name="modal">
    <div class="conflict-overlay" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
      <div class="conflict-dialog">
        <header class="conflict-head">
          <h2 id="conflict-title" class="conflict-title">⚠️ 云同步冲突</h2>
        </header>

        <div class="conflict-body">
          <div class="conflict-compare">
            <div class="conflict-col">
              <div class="conflict-col-label">本地</div>
              <div class="conflict-col-value">{{ formatTime(localTs) }}</div>
              <div class="conflict-col-sub">本设备编辑</div>
            </div>
            <div class="conflict-vs">VS</div>
            <div class="conflict-col">
              <div class="conflict-col-label">云端</div>
              <div class="conflict-col-value">{{ formatTime(remoteTs) }}</div>
              <div class="conflict-col-sub">来自：{{ remoteClientId === '未知设备' ? remoteClientId : '其他设备' }}</div>
            </div>
          </div>

          <div v-if="diffSummary.length > 0" class="conflict-diff">
            <div class="conflict-diff-title">可能存在差异的模块</div>
            <table class="diff-table">
              <thead>
                <tr>
                  <th>模块</th>
                  <th>本地</th>
                  <th>云端</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in diffSummary" :key="d.name">
                  <td>{{ d.name }}</td>
                  <td>{{ d.local }}</td>
                  <td>{{ d.remote }}</td>
                </tr>
              </tbody>
            </table>
            <div class="diff-hint">数字为模块数据大小（字节），仅供参考差异存在性，不等于条目数量。</div>
          </div>
          <div v-else class="conflict-diff">
            <div class="conflict-diff-title">未检测到明显模块差异</div>
            <p class="diff-hint">双方核心业务数据一致，但时间戳或设备级配置存在差异，仍需选择处理方式。</p>
            <p class="diff-hint">常见原因：不同设备的 localStorage 偏好键不同、记账自动复制计划触发、设置归一化补默认值等。</p>
            <p class="diff-hint" style="color: #16a34a;">建议选择「合并双方数据」，按模块取并集保留双方新增项。</p>
          </div>

          <p class="merge-hint">🔀 合并：按模块逐条按 ID 去重，保留双方新增项；同条目取较新版本。密码库与本地设置保留当前设备。</p>
        </div>

        <footer class="conflict-foot">
          <button
            type="button"
            class="conflict-btn conflict-btn-danger"
            @click="cloudSync.resolveConflict('remote')"
          >☁️ 云端覆盖本地</button>
          <button
            type="button"
            class="conflict-btn conflict-btn-primary"
            @click="cloudSync.resolveConflict('local')"
          >💻 本地覆盖云端</button>
          <button
            type="button"
            class="conflict-btn conflict-btn-merge"
            @click="cloudSync.resolveConflict('merge')"
          >🔀 合并双方数据</button>
          <button
            type="button"
            class="conflict-btn conflict-btn-ghost"
            @click="cloudSync.resolveConflict('cancel')"
          >✖️ 取消</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.conflict-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.conflict-dialog {
  background: var(--color-bg);
  border-radius: 12px;
  width: 100%;
  max-width: 560px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  color: var(--color-text);
}
.conflict-head {
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
}
.conflict-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #E8463A;
}
.conflict-body {
  padding: 20px 24px;
}
.conflict-compare {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.conflict-col {
  flex: 1;
  background: var(--color-bg-muted);
  border-radius: 8px;
  padding: 12px 16px;
  text-align: center;
  border: 1px solid var(--color-border);
}
.conflict-col-label {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.conflict-col-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 2px;
}
.conflict-col-sub {
  font-size: 11px;
  color: var(--color-text-muted);
}
.conflict-vs {
  font-weight: 700;
  font-size: 14px;
  color: var(--color-primary);
}
.conflict-diff {
  background: var(--color-bg-muted);
  border-radius: 8px;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
}
.conflict-diff-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 8px;
}
.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  color: var(--color-text);
}
.diff-table th,
.diff-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}
.diff-table th {
  font-weight: 600;
  color: var(--color-text-muted);
}
.diff-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--color-text-muted);
}
.conflict-foot {
  padding: 12px 24px;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.conflict-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.conflict-btn:hover {
  transform: translateY(-1px);
}
.conflict-btn-primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.conflict-btn-danger {
  background: color-mix(in srgb, #E8463A 12%, var(--color-bg));
  color: #E8463A;
  border-color: color-mix(in srgb, #E8463A 40%, var(--color-border));
}
.conflict-btn-ghost {
  background: transparent;
  color: var(--color-text-muted);
}
.conflict-btn-merge {
  background: color-mix(in srgb, #22c55e 12%, var(--color-bg));
  color: #16a34a;
  border-color: color-mix(in srgb, #22c55e 40%, var(--color-border));
}
.merge-hint {
  margin: 12px 0 0;
  font-size: 11px;
  color: #16a34a;
  line-height: 1.5;
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .conflict-dialog,
.modal-leave-active .conflict-dialog {
  transition: transform 0.2s ease;
}
.modal-enter-from .conflict-dialog,
.modal-leave-to .conflict-dialog {
  transform: scale(0.96) translateY(8px);
}
</style>
