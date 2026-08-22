// 全站备案信息（ICP + 公安）—— 写死常量，由 App.vue 挂载的 BeianFooter.vue 消费

/**
 * ICP 备案号
 * 号码格式示例：「粤ICP备12345678号」
 * 获取渠道：工信部备案系统 beian.miit.gov.cn
 * 空串语义：空串 = 页脚对应段落不显示（两段都空 = 整个页脚不渲染）
 * 变更后需 npm run build 重新构建部署才生效
 */
export const ICP_NUMBER = ''

/**
 * 公安备案号
 * 号码格式示例：「粤公网安备44030402001234号」
 * 获取渠道：公安备案 beian.mps.gov.cn（全国互联网安全管理平台）
 * 空串语义：空串 = 页脚对应段落不显示（两段都空 = 整个页脚不渲染）
 * 变更后需 npm run build 重新构建部署才生效
 */
export const PSB_NUMBER = ''

/** ICP 备案号唯一合法链接目标（工信部统一查询页），必须 target=_blank */
export const MIIT_BEIAN_URL = 'https://beian.miit.gov.cn/'

/** 公安备案徽标图片资源路径（public/beian/ghs.png） */
export const PSB_BADGE_SRC = '/beian/ghs.png'
