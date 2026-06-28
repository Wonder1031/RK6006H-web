/**
 * 文件导出工具 —— CSV / 文本 / JSON 下载。
 *
 * 关键点：CSV 文本前置 UTF-8 BOM（﻿），用 Excel 打开中文不乱码
 * （升级方案 P1-9）。BOM 作为字符串首字符，Blob 以 UTF-8 编码时会输出 EF BB BF。
 */

/** UTF-8 BOM（CSV 文本前置，防 Excel 中文乱码） */
export const CSV_BOM = '﻿';

/**
 * 把二维数组拼成 CSV 文本（首行通常为表头）。
 * 字段含逗号 / 引号 / 换行时自动加引号并转义。
 */
export function buildCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
): string {
  return rows.map((row) => row.map(escapeCsvField).join(',')).join('\n');
}

function escapeCsvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 触发浏览器文本下载（content 已含 BOM 时直接传入）。 */
export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  downloadBlob(filename, blob);
}

/** 触发浏览器 Blob 下载。 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 便捷：导出 CSV（自动加 BOM + 时间戳文件名）。 */
export function downloadCsv(filenameStem: string, rows: ReadonlyArray<ReadonlyArray<string | number>>): void {
  downloadText(`${filenameStem}-${stamp()}.csv`, CSV_BOM + buildCsv(rows), 'text/csv');
}

/** 便捷：导出 JSON（自动加时间戳文件名）。 */
export function downloadJson(filenameStem: string, data: unknown): void {
  downloadText(`${filenameStem}-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
