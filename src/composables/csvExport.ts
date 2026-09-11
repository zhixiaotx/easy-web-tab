// 通用 CSV 导出工具（零 vue/DOM 强依赖，纯函数可测）
// 单元格转义遵循 RFC4180；下载默认带 UTF-8 BOM，Excel 打开中文不乱码。

/** CSV 单元格转义：含逗号/引号/换行则整体加引号，内部引号转义为双引号 */
export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/** 由表头 + 二维行数据生成 CSV 文本（\r\n 换行，符合 RFC4180） */
export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  return [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
}

/** 生成带日期的文件名：prefix_YYYY-MM-DD.csv */
export function csvFileName(prefix: string): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${prefix}_${date}.csv`
}

/**
 * 浏览器下载 CSV 文本。
 * @param filename 文件名（含 .csv）
 * @param csv CSV 文本
 * @param withBom 是否带 UTF-8 BOM（默认 true，避免 Excel 中文乱码）
 */
export function downloadCsv(filename: string, csv: string, withBom = true): void {
  const content = withBom ? '﻿' + csv : csv
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
