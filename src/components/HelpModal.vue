<script setup lang="ts">
const emit = defineEmits<{
  close: []
}>()

async function downloadExample() {
  try {
    const resp = await fetch('/data/myself-sites.md')
    if (!resp.ok) throw new Error('下载失败')
    const text = await resp.text()
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'site.md'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('示例文件下载失败，请稍后重试')
  }
}

async function downloadIcons() {
  try {
    const resp = await fetch('/icons/icons.json')
    if (!resp.ok) throw new Error('下载失败')
    const text = await resp.text()
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'icons.json'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('图标文件下载失败，请稍后重试')
  }
}

const shortcuts = [
  { key: 'Ctrl + N', action: '新增网址' },
  { key: 'Ctrl + B', action: '切换前台/后台' },
  { key: 'Ctrl + D', action: '切换暗色模式' },
  { key: 'ESC', action: '关闭弹窗' }
]

const features = [
  {
    icon: '🔗',
    title: '网址管理',
    desc: '添加、编辑、删除网址。支持自动获取网站标题、描述和图标。'
  },
  {
    icon: '📂',
    title: '分类管理',
    desc: '内置视频音乐分类，可自定义添加新分类。历史分类自动迁移，不会丢失数据。'
  },
  {
    icon: '🔖',
    title: '标签筛选',
    desc: '每个网址可打多个标签，标签根据当前分类动态显示，方便精准筛选。'
  },
  {
    icon: '🔗',
    title: '断链检测',
    desc: '点击「检测断链」自动检测所有网址可用性，无效链接显示警告标记⚠️，鼠标悬停可手动取消失效标记。'
  },
  {
    icon: '🔍',
    title: '全文搜索',
    desc: '支持按名称、描述、标签搜索，输入即显示结果。'
  },
  {
    icon: '🔄',
    title: '拖拽排序',
    desc: '拖拽网址卡片交换位置，自动保存排序结果。'
  },
  {
    icon: '📥',
    title: '导入/导出',
    desc: '导出为 Markdown 文件备份，支持按分类/搜索引擎/网址排序导出，上传 .md 文件批量导入，自动按 URL 去重。'
  },
  {
    icon: '💾',
    title: '数据备份',
    desc: '自动保存最近10个版本的历史数据，支持一键恢复到任意历史版本。'
  },
  {
    icon: '🌙',
    title: '暗色模式',
    desc: '点击右上角月亮图标切换深色主题，适合夜间使用。图片背景模式下自动隐藏。'
  },
  {
    icon: '🖼️',
    title: '背景图片',
    desc: '支持上传本地图片作为背景，图片背景模式下自动隐藏主题切换按钮。'
  },
  {
    icon: '📈',
    title: '点击频率排序',
    desc: '网址按点击频率自动排序，常用网址置顶，方便快速访问。'
  },
  {
    icon: '🏷️',
    title: '图标本地化',
    desc: '网站图标自动缓存到本地，无网络时也能正常显示，同时提供预设图标可选。'
  },
  {
    icon: '🔎',
    title: '搜索引擎管理',
    desc: '添加/删除自定义搜索引擎，支持设置默认搜索，可在搜索栏快速切换。提供恢复默认按钮。'
  },
  {
    icon: '🔒',
    title: '密码管理',
    desc: 'AES-GCM 加密存储账号密码，支持主密码保护、一键复制、搜索筛选。导入/导出时密码自动加密解密，跨设备安全同步。'
  }
]
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="help-modal">
      <div class="modal-header">
        <h2>💡 使用帮助</h2>
        <button class="close-btn" @click="emit('close')" title="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- 示例数据下载 -->
        <section class="help-section download-section">
          <div class="download-card">
            <div class="download-info">
              <span class="download-icon">📦</span>
              <div>
                <h4>下载示例数据</h4>
                <p>下载预置的网址导航示例文件 <code>site.md</code> 与图标数据 <code>icons.json</code>，包含常用网站分类、链接和预设图标。网址文件下载后在管理后台点击「导入」上传，即可快速初始化导航页。</p>
              </div>
            </div>
            <div class="download-actions">
              <button class="btn-download" @click="downloadExample">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载网址
              </button>
              <button class="btn-download" @click="downloadIcons">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                下载图标
              </button>
            </div>
          </div>
        </section>

        <!-- 功能介绍 -->
        <section class="help-section">
          <h3 class="section-title">🎯 功能介绍</h3>
          <div class="features-grid">
            <div
              v-for="feature in features"
              :key="feature.title"
              class="feature-item"
            >
              <span class="feature-icon">{{ feature.icon }}</span>
              <div class="feature-content">
                <h4>{{ feature.title }}</h4>
                <p>{{ feature.desc }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 快捷键 -->
        <section class="help-section">
          <h3 class="section-title">⌨️ 键盘快捷键</h3>
          <div class="shortcuts-list">
            <div
              v-for="shortcut in shortcuts"
              :key="shortcut.key"
              class="shortcut-item"
            >
              <kbd class="shortcut-key">{{ shortcut.key }}</kbd>
              <span class="shortcut-action">{{ shortcut.action }}</span>
            </div>
          </div>
        </section>

        <!-- 页面模式 -->
        <section class="help-section">
          <h3 class="section-title">📄 页面模式</h3>
          <div class="mode-info">
            <div class="mode-item">
              <span class="mode-badge mode-admin">管理后台</span>
              <p>路由 <code>/</code>，默认页面，可添加/编辑/删除网址，管理分类和搜索引擎。</p>
            </div>
            <div class="mode-item">
              <span class="mode-badge mode-display">前台展示</span>
              <p>路由 <code>/display</code>，纯展示模式，隐藏管理功能，适合设为浏览器新标签页。</p>
            </div>
          </div>
        </section>

        <!-- 数据存储 -->
        <section class="help-section">
          <h3 class="section-title">💾 数据存储</h3>
          <ul class="storage-list">
            <li><strong>内置数据</strong>：构建进包，不可动态修改</li>
            <li><strong>用户数据</strong>：存储于浏览器 <code>localStorage</code>，包括网址、分类、搜索引擎、密码</li>
            <li><strong>密码数据</strong>：AES-GCM 加密后存储，需主密码解锁才能查看</li>
            <li><strong>断链检测结果</strong>：存储于 <code>localStorage</code>，关闭页面后保留</li>
          </ul>
        </section>
      </div>

      <div class="modal-footer">
        <button class="btn-primary" @click="emit('close')">知道了</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.help-modal {
  background-color: white;
  border-radius: 16px;
  width: 100%;
  max-width: 680px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: #94a3b8;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #64748b;
  background-color: #f1f5f9;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #3b82f6;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

/* 功能网格 */
.features-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background-color: #f8fafc;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
}

.feature-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.feature-content h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.feature-content p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

/* 快捷键列表 */
.shortcuts-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background-color: #f8fafc;
  border-radius: 8px;
}

.shortcut-key {
  background-color: #e2e8f0;
  color: #3b82f6;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  white-space: nowrap;
}

.shortcut-action {
  font-size: 13px;
  color: #475569;
}

/* 页面模式 */
.mode-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mode-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background-color: #f8fafc;
  border-radius: 10px;
}

.mode-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.mode-admin {
  background-color: #eff6ff;
  color: #3b82f6;
}

.mode-display {
  background-color: #f0fdf4;
  color: #22c55e;
}

.mode-item p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.mode-item code {
  background-color: #e2e8f0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: #3b82f6;
}

/* 数据存储 */
.storage-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.storage-list li {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

.storage-list strong {
  color: #1e293b;
}

.storage-list code {
  background-color: #e2e8f0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: #3b82f6;
}

/* 底部 */
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: center;
}

.btn-primary {
  padding: 10px 32px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: #2563eb;
}

/* 示例数据下载 */
.download-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
  border-radius: 12px;
  border: 1px solid #bfdbfe;
}

.download-info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.download-icon {
  font-size: 28px;
  flex-shrink: 0;
  margin-top: 2px;
}

.download-info h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.download-info p {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.download-info code {
  background-color: #e2e8f0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  color: #3b82f6;
}

.btn-download {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.btn-download:hover {
  background-color: #2563eb;
}

.download-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

/* 响应式 */
@media (max-width: 600px) {
  .features-grid {
    grid-template-columns: 1fr;
  }

  .shortcuts-list {
    grid-template-columns: 1fr;
  }

  .help-modal {
    max-height: 90vh;
  }

  .download-card {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-download {
    justify-content: center;
  }
}
</style>
