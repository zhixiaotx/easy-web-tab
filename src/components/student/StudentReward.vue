<script setup lang="ts">
// 学生工作台奖励积分面板（M3 批次2）
// 布局：标题工具条 + 统计卡 + 视图 tabs（奖励项/交易记录）+ 奖励网格/历史列表 + 分页条
// 数据：useStudentRewardsStore（独立 IDB store 'student_rewards'，单对象 {totalPoints, history, rewards}）
// 半自动积分：习惯/作业/阅读完成时由各 store 调用 store.earnFromHabit/Homework/Reading（sourceId 幂等）
// 家长手动加分：manualAddPoints；兑换：redeem（扣分+减库存+写 txn）；奖励项 CRUD：addReward/updateReward/deleteReward
// 行高 110px（M3 估值，待 row-heights.json 实测后校准）

import { computed, onMounted, ref } from 'vue'
import { useStudentRewardsStore } from '@/stores/studentRewards'
import { useToast } from '@/composables/useToast'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import Icon from '@/components/Icon.vue'
import type { StudentRewardItem, StudentRewardTxn } from '@/types'

const store = useStudentRewardsStore()
const toast = useToast()

// 视图切换：'rewards' 奖励项 / 'history' 交易记录
type ViewTab = 'rewards' | 'history'
const activeView = ref<ViewTab>('rewards')

// ===== 统计卡数据 =====
const stats = computed(() => store.stats())

// ===== 奖励项网格视图（行高 92px，row-heights.json rewards MAX 90 + 2） =====
const mainEl = ref<HTMLElement | null>(null)
const rewardListEl = ref<HTMLElement | null>(null)
const rewardPaging = usePanelPaging({
  items: () => store.allRewards(),
  rowHeight: 92,
  containerRef: mainEl,
  gridRef: rewardListEl
})
const { pageItems: rewardPageItems, currentPage: rewardCurrentPage, totalPages: rewardTotalPages, fitsOnePage: rewardFitsOnePage, next: rewardNext, prev: rewardPrev } = rewardPaging

// ===== 历史记录列表视图（一维列表，行高 42px，row-heights.json rewardsHistory MAX 40 + 2） =====
const historyListEl = ref<HTMLElement | null>(null)
const historyPaging = usePanelPaging({
  items: () => store.allHistory(),
  rowHeight: 42,
  containerRef: historyListEl
})
const { pageItems: historyPageItems, currentPage: historyCurrentPage, totalPages: historyTotalPages, fitsOnePage: historyFitsOnePage, next: historyNext, prev: historyPrev } = historyPaging

// ===== 奖励项新增/编辑弹框 =====
const showRewardDialog = ref(false)
const editingReward = ref<StudentRewardItem | null>(null)
const rewardForm = ref({ name: '', cost: 1, stock: 0 })
const stockEnabled = ref(false)

function openAddReward(): void {
  editingReward.value = null
  rewardForm.value = { name: '', cost: 1, stock: 0 }
  stockEnabled.value = false
  showRewardDialog.value = true
}

function openEditReward(item: StudentRewardItem): void {
  editingReward.value = item
  rewardForm.value = {
    name: item.name,
    cost: item.cost,
    stock: item.stock ?? 0
  }
  stockEnabled.value = item.stock !== undefined
  showRewardDialog.value = true
}

function closeRewardDialog(): void {
  showRewardDialog.value = false
  editingReward.value = null
}

async function submitReward(): Promise<void> {
  const { name, cost, stock } = rewardForm.value
  const trimmed = name.trim()
  if (!trimmed) {
    toast.error('奖励名称不能为空')
    return
  }
  if (!Number.isFinite(cost) || cost < 1 || cost > 9999) {
    toast.error('积分需在 1-9999 之间')
    return
  }
  if (editingReward.value) {
    const patch: { name?: string; cost?: number; stock?: number } = { name: trimmed, cost: Math.floor(cost) }
    if (stockEnabled.value) patch.stock = Math.max(0, Math.floor(stock))
    else patch.stock = undefined
    const result = await store.updateReward(editingReward.value.id, patch)
    if (!result.ok) {
      toast.error(mapRewardError(result.reason))
      return
    }
    toast.success('奖励已更新')
  } else {
    const result = await store.addReward(trimmed, Math.floor(cost), stockEnabled.value ? Math.max(0, Math.floor(stock)) : undefined)
    if (!result.ok) {
      toast.error(mapRewardError(result.reason))
      return
    }
    toast.success('奖励已添加')
  }
  closeRewardDialog()
}

async function removeReward(item: StudentRewardItem): Promise<void> {
  if (!confirm(`确认删除奖励「${item.name}」？`)) return
  const result = await store.deleteReward(item.id)
  if (!result.ok) {
    toast.error(mapRewardError(result.reason))
    return
  }
  toast.success('奖励已删除')
}

// ===== 兑换 =====
async function redeem(item: StudentRewardItem): Promise<void> {
  const result = await store.redeem(item.id)
  if (!result.ok) {
    if (result.reason === 'insufficient') {
      toast.error(`积分不足，还差 ${result.shortage ?? 0} 分`)
    } else {
      toast.error(mapRewardError(result.reason))
    }
    return
  }
  toast.success(`兑换成功「${item.name}」，消耗 ${item.cost} 分`)
}

// ===== 手动加分弹框 =====
const showEarnDialog = ref(false)
const earnForm = ref({ points: 5, reason: '' })

function openEarnDialog(): void {
  earnForm.value = { points: 5, reason: '' }
  showEarnDialog.value = true
}

function closeEarnDialog(): void {
  showEarnDialog.value = false
}

async function submitEarn(): Promise<void> {
  const { points, reason } = earnForm.value
  if (!Number.isFinite(points) || points <= 0) {
    toast.error('积分必须为正数')
    return
  }
  const reasonTrim = reason.trim()
  if (!reasonTrim) {
    toast.error('加分原因不能为空')
    return
  }
  const result = await store.manualAddPoints(Math.floor(points), reasonTrim)
  if (!result.ok) {
    toast.error(mapRewardError(result.reason))
    return
  }
  toast.success(`已加 ${Math.floor(points)} 分`)
  closeEarnDialog()
}

// ===== 积分规则弹框 =====
const showRulesDialog = ref(false)
const rules = computed(() => store.rulesText())

// ===== 错误映射 =====
function mapRewardError(reason?: string): string {
  switch (reason) {
    case 'empty': return '名称不能为空'
    case 'duplicate': return '奖励名称已存在'
    case 'not-found': return '奖励项不存在'
    case 'invalid-cost': return '积分值非法'
    case 'insufficient': return '积分不足'
    case 'out-of-stock': return '奖励已售罄'
    case 'invalid-points': return '积分值非法'
    case 'invalid-source': return '加分源标识非法'
    default: return '操作失败'
  }
}

// ===== 视图层辅助（薄委托 store）=====
function txnPointsText(t: StudentRewardTxn): string { return store.txnPointsText(t) }
function txnDateText(iso: string): string { return store.txnDateText(iso) }
function isSoldOut(item: StudentRewardItem): boolean { return item.stock !== undefined && item.stock <= 0 }

onMounted(async () => {
  await store.loadRewards()
})
</script>

<template>
  <div class="sr-shell">
    <div class="sr-toolbar">
      <h2 class="sr-title">奖励积分</h2>
      <div class="sr-actions">
        <button class="sr-btn sr-btn-secondary" @click="showRulesDialog = true" title="积分规则" data-testid="sr-rules-btn">
          <Icon name="countdowns" :size="16" />
          <span>规则</span>
        </button>
        <button class="sr-btn sr-btn-secondary" @click="openEarnDialog" data-testid="sr-manual-earn-btn">
          <span>＋手动加分</span>
        </button>
        <button class="sr-btn sr-btn-primary" @click="openAddReward" data-testid="sr-add-reward-btn">
          <span>＋新增奖励</span>
        </button>
      </div>
    </div>

    <div class="sr-stats-row">
      <div class="sr-stat-card sr-stat-main">
        <span class="sr-stat-emoji">⭐</span>
        <span class="sr-stat-text">当前积分 <strong>{{ stats.totalPoints }}</strong></span>
      </div>
      <div class="sr-stat-card">
        <span class="sr-stat-label">累计赚取</span>
        <span class="sr-stat-value earn">+{{ stats.totalEarned }}</span>
      </div>
      <div class="sr-stat-card">
        <span class="sr-stat-label">累计兑换</span>
        <span class="sr-stat-value redeem">-{{ stats.totalRedeemed }}</span>
      </div>
      <div class="sr-stat-card">
        <span class="sr-stat-label">奖励项</span>
        <span class="sr-stat-value">{{ stats.rewardCount }}</span>
      </div>
      <div v-if="stats.soldOutCount > 0" class="sr-stat-card">
        <span class="sr-stat-label">售罄</span>
        <span class="sr-stat-value muted">{{ stats.soldOutCount }}</span>
      </div>
    </div>

    <div class="sr-tabs">
      <button
        class="sr-tab"
        :class="{ active: activeView === 'rewards' }"
        data-testid="sr-tab-rewards"
        @click="activeView = 'rewards'"
      >奖励项</button>
      <button
        class="sr-tab"
        :class="{ active: activeView === 'history' }"
        data-testid="sr-tab-history"
        @click="activeView = 'history'"
      >交易记录 <span class="sr-tab-count">({{ stats.txnCount }})</span></button>
    </div>

    <!-- 奖励项视图 -->
    <div v-if="activeView === 'rewards'" ref="mainEl" class="sr-main">
      <div v-if="stats.rewardCount === 0" class="empty-state" data-testid="sr-empty-rewards">
        <p>还没有奖励项，点击「＋新增奖励」添加</p>
      </div>
      <div v-else ref="rewardListEl" class="sr-grid" :class="{ 'sr-grid-scroll': !rewardFitsOnePage }">
        <div
          v-for="item in rewardPageItems"
          :key="item.id"
          class="sr-reward-card"
          :class="{ 'sold-out': isSoldOut(item) }"
          :data-testid="`sr-reward-${item.id}`"
        >
          <div class="sr-reward-head">
            <div class="sr-reward-name" :title="item.name">{{ item.name }}</div>
            <div class="sr-reward-cost">
              <span class="sr-reward-cost-num">{{ item.cost }}</span>
              <span class="sr-reward-cost-unit">分</span>
            </div>
          </div>
          <div class="sr-reward-foot">
            <div v-if="item.stock !== undefined" class="sr-reward-stock" :class="{ zero: isSoldOut(item) }">
              库存 {{ item.stock }}
            </div>
            <div v-else class="sr-reward-stock unlimited">无限</div>
            <div class="sr-reward-ops">
              <button class="sr-mini-btn" @click="redeem(item)" :disabled="isSoldOut(item)" :data-testid="`sr-redeem-${item.id}`">兑换</button>
              <button class="sr-mini-btn" @click="openEditReward(item)" :data-testid="`sr-edit-${item.id}`">编辑</button>
              <button class="sr-mini-btn danger" @click="removeReward(item)" :data-testid="`sr-del-${item.id}`">删除</button>
            </div>
          </div>
        </div>
      </div>
      <PanelPager
        v-if="rewardTotalPages > 1"
        :page="rewardCurrentPage"
        :total="rewardTotalPages"
        @prev="rewardPrev"
        @next="rewardNext"
      />
    </div>

    <!-- 交易记录视图 -->
    <div v-else ref="mainEl" class="sr-main">
      <div v-if="stats.txnCount === 0" class="empty-state" data-testid="sr-empty-history">
        <p>暂无交易记录</p>
      </div>
      <div v-else>
        <div ref="historyListEl" class="sr-history-list" :class="{ 'sr-history-scroll': !historyFitsOnePage }">
          <div
            v-for="t in historyPageItems"
            :key="t.id"
            class="sr-txn-row"
            :class="{ earn: t.type === 'earn', redeem: t.type === 'redeem' }"
            :data-testid="`sr-txn-${t.id}`"
          >
            <div class="sr-txn-points" :class="t.type">
              {{ txnPointsText(t) }}
            </div>
            <div class="sr-txn-reason" :title="t.reason">{{ t.reason }}</div>
            <div class="sr-txn-date">{{ txnDateText(t.createdAt) }}</div>
          </div>
        </div>
        <PanelPager
          v-if="historyTotalPages > 1"
          :page="historyCurrentPage"
          :total="historyTotalPages"
          @prev="historyPrev"
          @next="historyNext"
        />
      </div>
    </div>

    <!-- 新增/编辑奖励弹框 -->
    <div v-if="showRewardDialog" class="sr-dialog-overlay" @click.self="closeRewardDialog">
      <div class="sr-dialog" data-testid="sr-reward-dialog">
        <div class="sr-dialog-head">
          <h3>{{ editingReward ? '编辑奖励' : '新增奖励' }}</h3>
          <button class="sr-dialog-close" @click="closeRewardDialog" title="关闭">
            <Icon name="close" :size="18" />
          </button>
        </div>
        <div class="sr-dialog-body">
          <div class="sr-field">
            <label class="sr-label">奖励名称</label>
            <input
              v-model="rewardForm.name"
              type="text"
              class="sr-input"
              maxlength="30"
              placeholder="如：看 30 分钟动画片"
              data-testid="sr-form-name"
            />
          </div>
          <div class="sr-field">
            <label class="sr-label">所需积分</label>
            <input
              v-model.number="rewardForm.cost"
              type="number"
              min="1"
              max="9999"
              class="sr-input"
              data-testid="sr-form-cost"
            />
          </div>
          <div class="sr-field">
            <label class="sr-checkbox-label">
              <input v-model="stockEnabled" type="checkbox" data-testid="sr-form-stock-toggle" />
              <span>启用库存</span>
            </label>
            <input
              v-if="stockEnabled"
              v-model.number="rewardForm.stock"
              type="number"
              min="0"
              class="sr-input sr-input-stock"
              placeholder="库存数量"
              data-testid="sr-form-stock"
            />
          </div>
        </div>
        <div class="sr-dialog-foot">
          <button class="sr-btn sr-btn-secondary" @click="closeRewardDialog">取消</button>
          <button class="sr-btn sr-btn-primary" @click="submitReward" data-testid="sr-form-submit">
            {{ editingReward ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 手动加分弹框 -->
    <div v-if="showEarnDialog" class="sr-dialog-overlay" @click.self="closeEarnDialog">
      <div class="sr-dialog" data-testid="sr-earn-dialog">
        <div class="sr-dialog-head">
          <h3>手动加分</h3>
          <button class="sr-dialog-close" @click="closeEarnDialog" title="关闭">
            <Icon name="close" :size="18" />
          </button>
        </div>
        <div class="sr-dialog-body">
          <div class="sr-field">
            <label class="sr-label">加分原因</label>
            <input
              v-model="earnForm.reason"
              type="text"
              class="sr-input"
              maxlength="100"
              placeholder="如：主动做家务一次"
              data-testid="sr-earn-reason"
            />
          </div>
          <div class="sr-field">
            <label class="sr-label">积分数</label>
            <input
              v-model.number="earnForm.points"
              type="number"
              min="1"
              max="9999"
              class="sr-input"
              data-testid="sr-earn-points"
            />
          </div>
          <p class="sr-hint">手动加分允许重复加同一原因，每次都会写入交易记录。</p>
        </div>
        <div class="sr-dialog-foot">
          <button class="sr-btn sr-btn-secondary" @click="closeEarnDialog">取消</button>
          <button class="sr-btn sr-btn-primary" @click="submitEarn" data-testid="sr-earn-submit">加分</button>
        </div>
      </div>
    </div>

    <!-- 积分规则弹框 -->
    <div v-if="showRulesDialog" class="sr-dialog-overlay" @click.self="showRulesDialog = false">
      <div class="sr-dialog" data-testid="sr-rules-dialog">
        <div class="sr-dialog-head">
          <h3>积分规则</h3>
          <button class="sr-dialog-close" @click="showRulesDialog = false" title="关闭">
            <Icon name="close" :size="18" />
          </button>
        </div>
        <div class="sr-dialog-body">
          <ul class="sr-rules-list">
            <li v-for="(rule, idx) in rules" :key="idx" class="sr-rules-item">
              <span class="sr-rules-action">{{ rule.action }}</span>
              <span class="sr-rules-points">
                <template v-if="rule.points > 0">+{{ rule.points }} 分</template>
                <template v-else>自定义</template>
              </span>
            </li>
          </ul>
          <p class="sr-hint">完成习惯/作业/阅读自动加分，每条只加一次（幂等）；同一行为不会重复加分。</p>
        </div>
        <div class="sr-dialog-foot">
          <button class="sr-btn sr-btn-primary" @click="showRulesDialog = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sr-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 10px;
}

.sr-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.sr-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.sr-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.sr-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface, #fff);
  color: var(--color-text, #1f2937);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.sr-btn:hover { background: var(--color-surface-hover, #f9fafb); }
.sr-btn-primary {
  background: #3b82f6;
  color: #fff;
  border-color: transparent;
}
.sr-btn-primary:hover { background: #2563eb; }
.sr-btn-secondary { /* 默认样式 */ }
.sr-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sr-stats-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.sr-stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  padding: 6px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.sr-stat-main {
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff;
  border-color: transparent;
}
.sr-stat-emoji { font-size: 16px; }
.sr-stat-text strong { font-size: 18px; font-weight: 700; }
.sr-stat-label {
  font-size: 11px;
  color: var(--color-text-soft, #6b7280);
}
.sr-stat-value { font-size: 16px; font-weight: 600; }
.sr-stat-value.earn { color: #10b981; }
.sr-stat-value.redeem { color: #ef4444; }
.sr-stat-value.muted { color: #9ca3af; }

.sr-tabs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.sr-tab {
  padding: 6px 14px;
  border: none;
  background: transparent;
  color: var(--color-text-soft, #6b7280);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.sr-tab.active {
  color: var(--color-text, #1f2937);
  border-bottom-color: #3b82f6;
  font-weight: 600;
}
.sr-tab-count {
  font-size: 11px;
  color: var(--color-text-soft, #9ca3af);
}

.sr-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-soft, #9ca3af);
  font-size: 14px;
}

.sr-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
}
.sr-grid-scroll { overflow-y: auto; }

.sr-reward-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 90px;
}
.sr-reward-card.sold-out {
  opacity: 0.55;
  background: var(--color-bg, #f9fafb);
}
.sr-reward-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
}
.sr-reward-name {
  font-size: 13px;
  font-weight: 600;
  word-break: break-all;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sr-reward-cost {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  color: #f59e0b;
  flex-shrink: 0;
}
.sr-reward-cost-num {
  font-size: 18px;
  font-weight: 700;
}
.sr-reward-cost-unit {
  font-size: 11px;
}
.sr-reward-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-top: auto;
}
.sr-reward-stock {
  font-size: 11px;
  color: var(--color-text-soft, #6b7280);
}
.sr-reward-stock.zero { color: #ef4444; }
.sr-reward-stock.unlimited { color: #10b981; }
.sr-reward-ops {
  display: flex;
  gap: 4px;
}
.sr-mini-btn {
  padding: 3px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface, #fff);
  color: var(--color-text, #1f2937);
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}
.sr-mini-btn:hover { background: var(--color-surface-hover, #f3f4f6); }
.sr-mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sr-mini-btn.danger { color: #ef4444; }

.sr-history-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.sr-history-scroll { overflow-y: auto; }
.sr-txn-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--color-border, #f3f4f6);
  font-size: 13px;
}
.sr-txn-points {
  font-weight: 700;
  font-size: 14px;
  width: 56px;
  flex-shrink: 0;
  text-align: right;
}
.sr-txn-points.earn { color: #10b981; }
.sr-txn-points.redeem { color: #ef4444; }
.sr-txn-reason {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sr-txn-date {
  font-size: 11px;
  color: var(--color-text-soft, #9ca3af);
  flex-shrink: 0;
}

/* ===== 弹框 ===== */
.sr-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.sr-dialog {
  background: var(--color-surface, #fff);
  border-radius: 8px;
  width: 420px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.sr-dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.sr-dialog-head h3 {
  margin: 0;
  font-size: 15px;
}
.sr-dialog-close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-text-soft, #6b7280);
  padding: 4px;
  border-radius: 4px;
}
.sr-dialog-close:hover { background: var(--color-surface-hover, #f3f4f6); }
.sr-dialog-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.sr-dialog-foot {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.sr-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sr-label {
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
}
.sr-input {
  padding: 6px 8px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 4px;
  font-size: 14px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1f2937);
}
.sr-input:focus {
  outline: none;
  border-color: #3b82f6;
}
.sr-input-stock {
  margin-top: 6px;
}
.sr-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text, #1f2937);
  cursor: pointer;
}
.sr-hint {
  font-size: 12px;
  color: var(--color-text-soft, #9ca3af);
  margin: 0;
}

.sr-rules-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sr-rules-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: var(--color-bg, #f9fafb);
  border-radius: 4px;
  font-size: 13px;
}
.sr-rules-action { color: var(--color-text, #1f2937); }
.sr-rules-points {
  font-weight: 600;
  color: #f59e0b;
}
</style>
