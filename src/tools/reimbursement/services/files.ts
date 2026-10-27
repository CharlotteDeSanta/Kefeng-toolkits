import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

const ILLEGAL_FILENAME = /[<>:"/\\|?*\u0000-\u001F]/g;

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(ILLEGAL_FILENAME, "_").replace(/[. ]+$/g, "").trim();
  return cleaned.length > 0 ? cleaned : "报销单与发票.pdf";
}

function ensurePdfExtension(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

function requireTauri(): void {
  if (!isTauri()) {
    throw new Error("文件导入/导出需要在桌面应用中运行");
  }
}

export async function pickInvoicePaths(): Promise<string[]> {
  requireTauri();
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "PDF 发票", extensions: ["pdf"] }],
  });
  if (selected === null) {
    return [];
  }
  return Array.isArray(selected) ? selected : [selected];
}

export async function readPdfFile(path: string): Promise<Uint8Array> {
  requireTauri();
  const buffer = await invoke<ArrayBuffer>("read_binary_file", { path });
  return new Uint8Array(buffer);
}

export async function pickSignaturePath(): Promise<string | null> {
  requireTauri();
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "签名图片", extensions: ["png", "jpg", "jpeg"] }],
  });
  if (selected === null) {
    return null;
  }
  return Array.isArray(selected) ? selected[0] ?? null : selected;
}

export async function readImageFile(path: string): Promise<Uint8Array> {
  requireTauri();
  const buffer = await invoke<ArrayBuffer>("read_image_file", { path });
  return new Uint8Array(buffer);
}

export async function savePdfFile(
  defaultName: string,
  bytes: Uint8Array,
): Promise<{ canceled: boolean; path?: string }> {
  requireTauri();
  const selected = await save({
    title: "导出报销单 PDF",
    defaultPath: sanitizeFileName(defaultName),
    filters: [{ name: "PDF 文件", extensions: ["pdf"] }],
  });
  if (!selected) {
    return { canceled: true };
  }

  const path = ensurePdfExtension(selected);
  await invoke("write_binary_file", bytes, {
    headers: { "x-file-path": encodeURIComponent(path) },
  });
  return { canceled: false, path };
}

export async function readSystemFont(kind: "simsun" | "yahei"): Promise<Uint8Array> {
  requireTauri();
  const buffer = await invoke<ArrayBuffer>("read_system_font", { kind });
  return new Uint8Array(buffer);
}

export async function revealExport(path: string): Promise<void> {
  requireTauri();
  await revealItemInDir(path);
}
