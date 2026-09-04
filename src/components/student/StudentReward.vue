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

// ===== 历史记录卡片网格（6 列/行 × 3 行/页 = 每页 18 卡；卡片行高 150px） =====
const historyWrapEl = ref<HTMLElement | null>(null)
const historyListEl = ref<HTMLElement | null>(null)
const historyPaging = usePanelPaging({
  items: () => store.allHistory(),
  rowHeight: 150,
  maxRows: 3,
  containerRef: historyWrapEl,
  gridRef: historyListEl
})
const { pageItems: historyPageItems, currentPage: historyCurrentPage, totalPages: historyTotalPages, fitsOnePage: historyFitsOnePage, next: historyNext, prev: historyPrev } = historyPaging

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
    <div v-else ref="mainEl" class="sr-main">
      <div v-if="stats.txnCount === 0" class="empty-state" data-testid="sr-empty-history">
        <p>暂无交易记录</p>
      </div>
      <div v-else ref="historyWrapEl" class="sr-history-wrap">
        <div ref="historyListEl" class="sr-history-grid" :class="{ 'sr-history-scroll': !historyFitsOnePage }">
          <div
            v-for="t in historyPageItems"
            :key="t.id"
            class="sr-txn-card"
            :class="{ earn: t.type === 'earn', redeem: t.type === 'redeem' }"
            :data-testid="`sr-txn-${t.id}`"
          >
            <div class="sr-txn-card-head">
              <span class="sr-txn-points" :class="t.type">{{ txnPointsText(t) }}</span>
              <span class="sr-txn-type-tag">{{ t.type === 'earn' ? '加分' : '兑换' }}</span>
            </div>
            <div class="sr-txn-card-reason" :title="t.reason">{{ t.reason }}</div>
            <div class="sr-txn-card-date">{{ txnDateText(t.createdAt) }}</div>
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

/* ===== 奖励工作台一屏布局：中间包装层（grid + Pager 之间的 wrapper）必须 flex 列 ===== */
/* 参考密码面板 .pwd-main 规则：缺此规则时 .sr-history-grid 的 flex:1 失效、RO 只测到 1 行高 → rowsPerPage=1 */
.sr-history-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sr-history-grid {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  padding: 4px 2px;
}
.sr-history-scroll { overflow-y: auto; }

.sr-txn-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 10px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  /* 宽时封顶 150px；窄时自动跟随宽度（正方形 1:1）收窄，不会出现"高 150 但卡窄成细长条" */
  aspect-ratio: 1 / 1;
  max-height: 150px;
  box-sizing: border-box;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  overflow: hidden;
}
.sr-txn-card.redeem {
  border-color: #fecaca;
  background: linear-gradient(180deg, #fff 0%, #fef2f2 100%);
}
.sr-txn-card.earn {
  border-color: #a7f3d0;
  background: linear-gradient(180deg, #fff 0%, #ecfdf5 100%);
}
.sr-txn-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sr-txn-card .sr-txn-points {
  font-weight: 800;
  font-size: 18px;
  width: auto;
  text-align: left;
}
.sr-txn-card .sr-txn-points.earn { color: #059669; }
.sr-txn-card .sr-txn-points.redeem { color: #dc2626; }
.sr-txn-type-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.8);
  color: var(--color-text-soft, #6b7280);
  border: 1px solid var(--color-border, #e5e7eb);
}
.sr-txn-card-reason {
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-text-secondary, #374151);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
  flex: 1;
}
.sr-txn-card-date {
  font-size: 11px;
  color: var(--color-text-soft, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 保留旧类（其他模块无引用），以安全过渡 */
.sr-history-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.sr-txn-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--color-border, #f3f4f6);
  font-size: 13px;
}
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
</style>
