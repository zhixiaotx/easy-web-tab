# URL 自动填充功能 - 技术方案

## 需求概述

在添加网址时，输入 URL 后点击「获取」按钮，自动填充：
- 网站名称
- 网站描述
- 图标地址
- 标签（可选）

---

## 技术挑战

### CORS 限制
浏览器直接 fetch 外部网站会触发 CORS 跨域限制，需要通过代理解决。

### 解决方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| CORS 代理 (allorigins.win) | 简单，无需后端 | 依赖第三方服务 |
| 第三方 API (linkpreview.net) | 功能完整 | 需要付费/配额 |
| 纯前端解析 | 无依赖 | 需要后端支持 CORS |

---

## 推荐方案：使用 CORS 代理 + 手动解析

### 实现步骤

1. **创建获取元数据 composable** (`useUrlMetadata.ts`)
   - 使用 `allorigins.win` 代理获取页面 HTML
   - 解析 meta 标签提取信息

2. **更新 SiteModal.vue**
   - 添加「获取」按钮
   - 添加加载状态
   - 自动填充表单

### 数据来源优先级

```typescript
// 获取优先级
title: 
  1. og:title
  2. <title>
  3. 从 URL 提取

description:
  1. og:description
  2. <meta name="description">

icon:
  1. og:image
  2. apple-touch-icon
  3. /favicon.ico
```

### 示例 API 调用

```javascript
// 通过 CORS 代理获取
const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl)
const response = await fetch(proxyUrl)
const html = await response.text()

// 解析 HTML
const parser = new DOMParser()
const doc = parser.parseFromString(html, 'text/html')

// 获取 title
doc.querySelector('meta[property="og:title"]')?.content 
  || doc.querySelector('title')?.textContent

// 获取 description  
doc.querySelector('meta[property="og:description"]')?.content
  || doc.querySelector('meta[name="description"]')?.content

// 获取图标
doc.querySelector('meta[property="og:image"]')?.content
```

---

## UI 设计

```
┌─────────────────────────────────────┐
│ 网站地址 *                           │
│ [https://github.com          ] [获取]│
│                                     │
│ 网站名称 *                           │
│ [GitHub                        ]   │
│                                     │
│ 网站描述                             │
│ [全球最大的代码托管平台...          ]   │
│                                     │
│ 分类 *                               │
│ [开发技术 ▼                        ]   │
│                                     │
│ 标签                                 │
│ [代码, 开源                       ]   │
│                                     │
│ 图标地址                             │
│ [https://github.com/favicon.ico  ] │
│                                     │
│ [取消]                      [添加]   │
└─────────────────────────────────────┘
```

---

## 预估工作量

- 创建 `useUrlMetadata.ts`: 30 分钟
- 更新 `SiteModal.vue`: 20 分钟
- 测试验证: 10 分钟

**总计**: 约 1 小时
