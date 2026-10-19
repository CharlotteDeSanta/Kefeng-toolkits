import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export interface SaveXlsxResult {
  canceled: boolean;
  path?: string;
}

const ILLEGAL_FILENAME = /[<>:"/\\|?*\u0000-\u001F]/g;

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(ILLEGAL_FILENAME, "_").replace(/[. ]+$/g, "").trim();
  return cleaned.length > 0 ? cleaned : "AGV月报.xlsx";
}

function ensureXlsxExtension(name: string): string {
  return /\.xlsx$/i.test(name) ? name : `${name}.xlsx`;
}

function downloadInBrowser(fileName: string, bytes: Uint8Array): void {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 浏览器开发环境使用下载，Tauri 环境使用原生保存对话框 + Rust 写文件。 */
export async function saveXlsx(
  defaultName: string,
  bytes: Uint8Array,
): Promise<SaveXlsxResult> {
  const fileName = ensureXlsxExtension(sanitizeFileName(defaultName));

  if (!isTauri()) {
    downloadInBrowser(fileName, bytes);
    return { canceled: false, path: fileName };
  }

  const selected = await save({
    title: "导出 XLSX",
    defaultPath: fileName,
    filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
  });
  if (!selected) {
    return { canceled: true };
  }

  const path = ensureXlsxExtension(selected);
  await invoke("save_workbook", {
    path,
    bytes: Array.from(bytes),
  });
  return { canceled: false, path };
}

export async function revealExport(path: string): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await revealItemInDir(path);
}
