<template>
  <footer class="beian-footer" data-testid="beian-footer">
    <span class="beian-inner">
      <template v-if="hasBeian">
        <a v-if="ICP_NUMBER" :href="MIIT_BEIAN_URL" target="_blank" rel="noopener noreferrer" data-testid="beian-icp-link">{{ ICP_NUMBER }}</a>
        <span v-if="ICP_NUMBER && PSB_NUMBER" class="beian-sep">|</span>
        <a v-if="PSB_NUMBER" :href="psbQueryUrl" target="_blank" rel="noopener noreferrer" data-testid="beian-psb-link" class="beian-psb"><img :src="PSB_BADGE_SRC" alt="公安备案" @error="badgeHidden = true" v-show="!badgeHidden" />{{ PSB_NUMBER }}</a>
        <span class="beian-sep">|</span>
      </template>
      <!-- 计数锚点：vercount 会查找这两个 ID 并上报/填充。视觉隐藏（不显示在页脚），实际数字在「设置 → 导航设置 → 站点外观」展示 -->
      <span class="visitor-counter" aria-hidden="true">
        使用人数 <span id="vercount_value_site_uv">-</span> · 总访问 <span id="vercount_value_site_pv">-</span>
      </span>
    </span>
  </footer>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ICP_NUMBER, PSB_NUMBER, MIIT_BEIAN_URL, PSB_BADGE_SRC } from '@/config/beian'

const hasBeian = computed(() => !!(ICP_NUMBER || PSB_NUMBER))
const psbQueryUrl = computed(() => 'https://beian.mps.gov.cn/#/query/webSearch?code=' + PSB_NUMBER.replace(/\D/g, ''))
const badgeHidden = ref(false)

// Vercount 访客统计（不蒜子替代，需公网域名访问才生效）。
// SPA 下若直接把脚本放 index.html，脚本执行时（document.readyState 已非 loading）Vue 尚未挂载页脚，
// 计数 span（vercount_value_site_uv / site_pv）还不存在、统计会落空。
// 故改为页脚（App.vue 中无条件常驻挂载）挂载后再动态注入脚本，确保锚点 span 已渲染、脚本加载即填充并上报。
// 锚点仅作计数用途（视觉隐藏），展示数字在「设置 → 导航设置 → 站点外观」读取渲染。
onMounted(() => {
  if (document.getElementById('vercount-script')) return
  const s = document.createElement('script')
  s.id = 'vercount-script'
  s.src = 'https://events.vercount.one/js'
  document.head.appendChild(s)
})
</script>

<style scoped>
.beian-footer {
  position: fixed;
  bottom: 4px;
  left: 0;
  right: 0;
  z-index: 40; /* 低于视图工具栏(50+)/弹窗(200+)层级 */
  text-align: center;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text-muted);
  opacity: 0.75;
  transition: opacity var(--transition-fast, 0.15s ease);
  pointer-events: none; /* 容器穿透，不挡下方点击 */
}
.beian-footer:hover { opacity: 1; }
.beian-inner {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  pointer-events: auto; /* 仅链接区可交互 */
}
.beian-sep { opacity: 0.6; }
.beian-footer a { color: inherit; text-decoration: none; }
.beian-footer a:hover { color: var(--color-text-secondary); text-decoration: underline; }
.beian-psb img { height: 12px; width: auto; vertical-align: -1px; margin-right: 3px; }
/* 计数锚点视觉隐藏（不显示在页脚），仍常驻 DOM 供 vercount 统计每次访问；数字在设置-站点外观展示 */
.visitor-counter {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
