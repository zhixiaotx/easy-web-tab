<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGenealogyStore } from '@/stores/genealogy'
import type { FamilyTreeNode } from '@/composables/genealogyCore'

defineOptions({ name: 'GenealogyTreeNode' })

const props = defineProps<{ node: FamilyTreeNode }>()
const store = useGenealogyStore()
const collapsed = ref(false)

const GENDER_LABEL: Record<string, string> = { male: '男', female: '女', '': '未知' }
const isRoot = computed(() => store.rootId === props.node.member.id)
const genderLabel = computed(() => GENDER_LABEL[props.node.member.gender ?? ''] ?? '未知')
const hasChildren = computed(() => props.node.children.length > 0)
const spouseNames = computed(() =>
  props.node.member.spouses.map((id) => store.members.find((m) => m.id === id)?.name ?? '(已删除)')
)

function toggle() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <div class="gtn">
    <div class="gtn-self">
      <button
        v-if="hasChildren"
        class="gtn-caret"
        :aria-label="collapsed ? '展开' : '折叠'"
        @click="toggle"
      >{{ collapsed ? '▸' : '▾' }}</button>
      <span v-else class="gtn-caret-placeholder"></span>
      <div class="gtn-card" :class="{ root: isRoot }">
        <span class="gtn-name">{{ node.member.name }}</span>
        <span class="gtn-gender">{{ genderLabel }}</span>
        <span v-if="isRoot" class="gtn-root-badge">主根</span>
        <span v-if="spouseNames.length" class="gtn-spouse">♥ {{ spouseNames.join('、') }}</span>
      </div>
    </div>
    <div v-if="hasChildren && !collapsed" class="gtn-children">
      <GenealogyTreeNode
        v-for="child in node.children"
        :key="child.member.id"
        :node="child"
      />
    </div>
  </div>
</template>

<style scoped>
.gtn {
  display: flex;
  align-items: center;
}
.gtn-self {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  padding: 6px 0;
}
.gtn-caret {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}
.gtn-caret-placeholder {
  width: 18px;
  flex-shrink: 0;
}
.gtn-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: var(--color-bg-card, #fff);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #111827);
  white-space: nowrap;
}
.gtn-card.root {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary, #3b82f6) 22%, transparent);
}
.gtn-gender {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted, #9ca3af);
}
.gtn-root-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  color: #fff;
  background: var(--color-primary, #3b82f6);
}
.gtn-spouse {
  font-size: 12px;
  color: #db2777;
}

/* 思维导图连线：曲线（主干竖线 + 各子节点引出的圆角弧线，仅显示关系、无操作按钮） */
.gtn-children {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-left: 16px;
  padding-left: 24px;
  position: relative;
}
/* 主干（竖向脊柱） */
.gtn-children::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-border, #e5e7eb);
}
/* 父卡 → 主干 的曲线连接 */
.gtn-children::after {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border-left: 2px solid var(--color-border, #e5e7eb);
  border-bottom: 2px solid var(--color-border, #e5e7eb);
  border-bottom-left-radius: 16px;
}
/* 每个子节点从主干引出的曲线（四分之一圆弧） */
.gtn-children > .gtn > .gtn-self::before {
  content: '';
  position: absolute;
  left: -24px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-left: 2px solid var(--color-border, #e5e7eb);
  border-bottom: 2px solid var(--color-border, #e5e7eb);
  border-bottom-left-radius: 24px;
}

/* 暗色覆盖 */
:global(html.dark) .gtn-card {
  background: var(--color-bg-card, #1f2937);
  color: var(--color-text, #f9fafb);
}
:global(html.dark) .gtn-card.root {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);
}
:global(html.dark) .gtn-gender {
  color: var(--color-text-muted, #9ca3af);
}
:global(html.dark) .gtn-children::before,
:global(html.dark) .gtn-children::after,
:global(html.dark) .gtn-children > .gtn > .gtn-self::before {
  border-color: var(--color-border, #374151);
}
:global(html.dark) .gtn-children::before {
  background: var(--color-border, #374151);
}
</style>
