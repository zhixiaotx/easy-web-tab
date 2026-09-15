<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '时间', value: txnDateText(row.createdAt) },
    { label: '类型', value: row.type === 'earn' ? '加分' : '兑换' },
    { label: '积分变动', value: txnPointsText(row) },
    { label: '事由', value: row.reason }
  ]
}

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
import StudentToolbar from '@/components/student/StudentToolbar.vue'
import type { StudentRewardItem, StudentRewardTxn } from '@/types'

const store = useStudentRewardsStore()
const toast = useToast()

// 视图切换：'rewards' 奖励项 / 'history' 交易记录
type ViewTab = 'rewards' | 'history'
const activeView = ref<ViewTab>('rewards')

// ===== 统计卡数据 =====
const stats = computed(() => store.stats())

// ===== 奖励项网格视图（行高 152px，参考学习计划 4 列 150px 高卡片） =====
const mainEl = ref<HTMLElement | null>(null)
const rewardListEl = ref<HTMLElement | null>(null)
const rewardPaging = usePanelPaging({
  items: () => store.allRewards(),
  rowHeight: 152,
  containerRef: mainEl,
  gridRef: rewardListEl
})
const { pageItems: rewardPageItems, currentPage: rewardCurrentPage, totalPages: rewardTotalPages, fitsOnePage: rewardFitsOnePage, next: rewardNext, prev: rewardPrev } = rewardPaging

// ===== 交易记录表格（el-table + el-pagination，固定 10 条/页，对齐教育经历） =====
const HISTORY_PAGE_SIZE = 10
const historyPage = ref(1)
const historyTotal = computed(() => store.allHistory().length)
const historyPageItems = computed<StudentRewardTxn[]>(() => {
  const all = store.allHistory()
  const start = (historyPage.value - 1) * HISTORY_PAGE_SIZE
  return all.slice(start, start + HISTORY_PAGE_SIZE)
})

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
    <StudentToolbar title="奖励积分">
      <el-button size="small" data-testid="sr-rules-btn" @click="showRulesDialog = true" title="积分规则">
        <Icon name="countdowns" :size="16" />
        <span>规则</span>
      </el-button>
    </StudentToolbar>

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

    <el-radio-group v-model="activeView" class="sr-tabs">
      <el-radio-button value="rewards" data-testid="sr-tab-rewards">奖励项</el-radio-button>
      <el-radio-button value="history" data-testid="sr-tab-history">交易记录 <span class="sr-tab-count">({{ stats.txnCount }})</span></el-radio-button>
    </el-radio-group>

    <!-- 奖励项视图 -->
    <div v-if="activeView === 'rewards'" ref="mainEl" class="sr-main">
      <div v-if="stats.rewardCount === 0" class="empty-state" data-testid="sr-empty-rewards">
        <p>还没有奖励项，请在「家长协同」→「配置奖励」中添加</p>
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
            <div class="sr-reward-cost">
              <span class="sr-reward-cost-num">{{ item.cost }}</span>
              <span class="sr-reward-cost-unit">分</span>
            </div>
          </div>
          <div class="sr-reward-name" :title="item.name">{{ item.name }}</div>
          <div class="sr-reward-stock" :class="{ zero: isSoldOut(item), unlimited: item.stock === undefined }">
            {{ item.stock !== undefined ? (isSoldOut(item) ? '已售罄' : `库存 ${item.stock}`) : '无限库存' }}
          </div>
          <div class="sr-reward-foot">
            <button class="sr-redeem-btn" @click.stop="redeem(item)" :disabled="isSoldOut(item)" :data-testid="`sr-redeem-${item.id}`">立即兑换</button>
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
    <div v-else class="sr-main">
      <div v-if="stats.txnCount === 0" class="empty-state" data-testid="sr-empty-history">
        <p>暂无交易记录</p>
      </div>
      <template v-else>
        <div class="ewt-table-toolbar"><ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" /></div>
        <div class="sr-history-list">
          <el-table v-if="vm.mode === 'list'" class="ewt-table"
            :data="historyPageItems"
            stripe
            border
            size="default"
            style="width: 100%"
            height="100%"
            empty-text="暂无交易记录"
          >
            <el-table-column label="时间" width="170" align="center">
              <template #default="{ row }">{{ txnDateText(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="类型" width="100" align="center">
              <template #default="{ row }">
                <span class="sr-txn-type-tag" :class="row.type" :data-testid="`sr-txn-type-${row.id}`">
                  {{ row.type === 'earn' ? '加分' : '兑换' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="积分变动" width="130" align="right">
              <template #default="{ row }">
                <span class="sr-txn-points" :class="row.type" :data-testid="`sr-txn-${row.id}`">{{ txnPointsText(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="事由" min-width="220" align="left" show-overflow-tooltip>
              <template #default="{ row }">
                <span :title="row.reason">{{ row.reason }}</span>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="ewt-card-grid">
            <RecordsCard
              v-for="item in historyPageItems"
              :key="item.id"
              :fields="cardFields(item)"
            >
            </RecordsCard>
          </div>

        </div>
        <div class="sr-history-pager">
          <el-pagination
            v-model:current-page="historyPage"
            :page-size="HISTORY_PAGE_SIZE"
            :page-sizes="[HISTORY_PAGE_SIZE]"
            layout="total, prev, pager, next, jumper"
            :total="historyTotal"
            background
            small
            prev-text="上一页"
            next-text="下一页"
          />
        </div>
      </template>
    </div>

    <!-- 积分规则弹框 -->
    <el-dialog v-model="showRulesDialog" title="积分规则" width="420px" append-to-body data-testid="sr-rules-dialog">
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
        <p class="sr-hint">完成习惯/作业/阅读自动加分，每条只加一次（幂等）；同一行为不会重复加分。如需新增奖励项或手工加分，请到「家长协同」面板使用。</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="showRulesDialog = false">知道了</el-button>
      </template>
    </el-dialog>
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
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  padding-bottom: 2px;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
}
.sr-grid-scroll { overflow-y: auto; }

.sr-reward-card {
  position: relative;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 10px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 150px;
  min-height: 150px;
  overflow: hidden;
  cursor: pointer;
  box-sizing: border-box;
  transition: box-shadow 0.15s ease;
}
.sr-reward-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.sr-reward-card.sold-out {
  opacity: 0.55;
  background: var(--color-bg, #f9fafb);
  cursor: default;
}
.sr-reward-head {
  display: flex;
  justify-content: flex-start;
  align-items: baseline;
  flex-shrink: 0;
}
.sr-reward-cost {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  color: #f59e0b;
  flex-shrink: 0;
}
.sr-reward-cost-num {
  font-size: 22px;
  font-weight: 700;
}
.sr-reward-cost-unit {
  font-size: 12px;
}
.sr-reward-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex-shrink: 0;
}
.sr-reward-stock {
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
  flex-shrink: 0;
}
.sr-reward-stock.zero { color: #ef4444; }
.sr-reward-stock.unlimited { color: #10b981; }
.sr-reward-foot {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-shrink: 0;
}
.sr-redeem-btn {
  padding: 4px 12px;
  border: none;
  background: #10b981;
  color: #fff;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.sr-redeem-btn:hover { background: #059669; }
.sr-redeem-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #9ca3af;
}

/* ===== 交易记录表格容器（参考教育经历 .edu-list） ===== */
.sr-history-list {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.sr-history-list > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  --el-table-border-color: var(--color-border, #e5e7eb);
  --el-table-header-bg-color: var(--color-bg-hover, #f3f4f6);
  --el-table-tr-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(16, 185, 129, 0.06);
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.sr-history-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.sr-history-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .sr-history-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .sr-history-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .sr-history-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.sr-history-list > :global(.el-table .el-table__body-wrapper .cell),
.sr-history-list > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 交易记录分页条（参考教育经历 .edu-list-pager） ===== */
.sr-history-pager {
  flex: 0 0 auto;
  padding: 14px 0 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 0 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .sr-history-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.sr-history-pager > :global(.el-pagination) {
  --el-pagination-bg-color: transparent;
}
.sr-history-pager > :global(.el-pagination button),
.sr-history-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.sr-history-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #10b981) !important;
  color: #fff !important;
  border-color: var(--color-primary, #10b981) !important;
}
:global(html.dark) .sr-history-pager > :global(.el-pagination button),
:global(html.dark) .sr-history-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .sr-history-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #10b981) !important;
  color: #fff !important;
  border-color: var(--color-primary, #10b981) !important;
}
.sr-history-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

/* 积分变动：加分绿 / 兑换红 */
.sr-txn-points {
  font-weight: 700;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.sr-txn-points.earn { color: #059669; }
.sr-txn-points.redeem { color: #dc2626; }

/* 类型标签：加分绿底 / 兑换红底 */
.sr-txn-type-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
.sr-txn-type-tag.earn {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}
.sr-txn-type-tag.redeem {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

/* ===== 弹框 ===== */
.sr-dialog-body {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
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

/* ===== 移动端：统计卡换行、奖励网格降为 2 列、表格横向滚动 ===== */
@media (max-width: 768px) {
  .sr-stats-row {
    gap: 6px;
  }
  .sr-stat-card {
    padding: 6px 10px;
    font-size: 12px;
  }
  .sr-stat-text strong {
    font-size: 16px;
  }
  .sr-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .sr-reward-card {
    height: 132px;
    min-height: 132px;
  }
  /* 交易记录表格在窄屏横向滚动，避免挤压变形 */
  .sr-history-list {
    overflow-x: auto;
  }
  .sr-history-list > :global(.el-table) {
    min-width: 560px;
  }
  .sr-history-pager > :deep(.el-pagination) {
    flex-wrap: wrap;
  }
}
</style>
