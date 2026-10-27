import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { ToolHandle } from "../../tools";
import {
  cloneInstance,
  createInstance,
} from "./forms/defaults";
import { validateInstances } from "./forms/validation";
import {
  pickSignaturePath,
  readImageFile,
  savePdfFile,
  revealExport,
} from "./services/files";
import { importInvoices } from "./services/invoices";
import { buildReimbursementPdf } from "./services/pdf";
import { prepareSignatureImage } from "./services/signature";
import { ReimbursementStorage } from "./services/storage";
import {
  createReimbursementView,
  type ReimbursementViewState,
} from "./view";
import {
  APPROVAL_KEYS,
  type ApprovalKey,
  type FormInstance,
  type FormType,
  type InvoiceItem,
  type NupCount,
  type ReimbursementDraft,
  type SignatureImage,
} from "./types";

function timestampName(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function nextSequence(instances: readonly FormInstance[], type: FormType): number {
  let max = 0;
  for (const instance of instances) {
    if (instance.type !== type) continue;
    const match = /(\d+)\s*$/.exec(instance.title);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

function setTopLevelField(
  instance: FormInstance,
  field: string,
  value: string,
): void {
  if (field.startsWith("approvals.")) {
    const key = field.slice("approvals.".length) as ApprovalKey;
    if ((APPROVAL_KEYS as readonly string[]).includes(key)) {
      (instance.data.approvals as Record<ApprovalKey, string>)[key] = value;
    }
    return;
  }
  if (field.startsWith("extras.")) {
    if (instance.type !== "travel") return;
    const key = field.slice("extras.".length);
    (instance.data.extras as unknown as Record<string, string>)[key] = value;
    return;
  }
  (instance.data as unknown as Record<string, unknown>)[field] = value;
}

function setRowField(
  instance: FormInstance,
  rowIndex: number,
  field: string,
  value: string,
): void {
  const collection =
    instance.type === "private-car" ? instance.data.trips : instance.data.rows;
  const row = collection[rowIndex] as unknown as Record<string, string> | undefined;
  if (row) {
    row[field] = value;
  }
}

export function mountReimbursement(container: HTMLElement): ToolHandle {
  const storage = new ReimbursementStorage(window.localStorage);
  let instances: FormInstance[] = [];
  let activeInstanceId: string | null = null;
  let nup: NupCount = 2;
  let invoices: InvoiceItem[] = [];
  let signature: SignatureImage | null = null;
  let busy = false;
  let saveTimer: number | null = null;
  let disposed = false;

  const loaded = storage.load();
  let loadNotice = "";
  if (loaded.ok && loaded.value) {
    const draft = loaded.value;
    instances = draft.instances;
    activeInstanceId =
      draft.activeInstanceId ?? instances[0]?.id ?? null;
    nup = draft.nup;
  } else if (!loaded.ok) {
    loadNotice = loaded.error;
  }

  const loadedSignature = storage.loadSignature();
  if (!loadedSignature.ok) {
    loadNotice = [loadNotice, loadedSignature.error].filter(Boolean).join("\n");
  } else {
    signature = loadedSignature.value;
  }

  const state = (): ReimbursementViewState => ({
    instances,
    activeInstanceId,
    nup,
    invoices,
    signature,
  });

  const view = createReimbursementView(container, {
    onAdd: (type) => {
      if (busy) return;
      const instance = createInstance(type, nextSequence(instances, type));
      instances.push(instance);
      activeInstanceId = instance.id;
      scheduleSave();
      view.render(state());
    },
    onSelect: (id) => {
      if (busy || !instances.some((item) => item.id === id)) return;
      activeInstanceId = id;
      scheduleSave();
      view.render(state());
    },
    onDuplicate: () => {
      if (busy) return;
      const index = instances.findIndex((item) => item.id === activeInstanceId);
      if (index < 0) return;
      const source = instances[index];
      const copy = cloneInstance(source, nextSequence(instances, source.type));
      instances.splice(index + 1, 0, copy);
      activeInstanceId = copy.id;
      scheduleSave();
      view.render(state());
    },
    onDelete: () => {
      if (busy) return;
      const index = instances.findIndex((item) => item.id === activeInstanceId);
      if (index < 0) return;
      const target = instances[index];
      const targetId = target.id;
      void askConfirm(
        `确定删除「${target.title}」？`,
        "删除报销单",
      ).then((confirmed) => {
        if (!confirmed || busy) return;
        const currentIndex = instances.findIndex(
          (item) => item.id === targetId,
        );
        if (currentIndex < 0) return;
        instances.splice(currentIndex, 1);
        activeInstanceId =
          instances[Math.min(currentIndex, instances.length - 1)]?.id ?? null;
        scheduleSave();
        view.render(state());
      });
    },
    onMove: (direction) => {
      if (busy) return;
      const index = instances.findIndex((item) => item.id === activeInstanceId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= instances.length) return;
      const [item] = instances.splice(index, 1);
      instances.splice(target, 0, item);
      scheduleSave();
      view.render(state());
    },
    onFieldChange: (instanceId, rowIndex, field, value) => {
      const instance = instances.find((item) => item.id === instanceId);
      if (!instance) return;
      if (rowIndex === null) {
        setTopLevelField(instance, field, value);
      } else {
        setRowField(instance, rowIndex, field, value);
      }
      scheduleSave();
      if (instance.id === activeInstanceId) {
        view.updateSummary(instance);
      }
    },
    onImportInvoices: () => {
      void importInvoiceFiles();
    },
    onChooseSignature: () => {
      void chooseSignature();
    },
    onClearSignature: () => {
      void clearSignature();
    },
    onRemoveInvoice: (id) => {
      if (busy) return;
      invoices = invoices.filter((invoice) => invoice.id !== id);
      view.render(state());
    },
    onMoveInvoice: (id, direction) => {
      if (busy) return;
      const index = invoices.findIndex((invoice) => invoice.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= invoices.length) return;
      const [item] = invoices.splice(index, 1);
      invoices.splice(target, 0, item);
      view.render(state());
    },
    onNupChange: (value) => {
      if (busy) return;
      nup = value;
      scheduleSave();
      view.render(state());
    },
    onExport: () => {
      void exportPdf();
    },
    onReveal: (path) => {
      void revealExport(path).catch((error: unknown) => {
        view.setStatus(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      });
    },
  });

  function render(): void {
    view.render(state());
  }

  function saveNow(): void {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    const draft: ReimbursementDraft = {
      schemaVersion: 1,
      instances,
      activeInstanceId,
      nup,
    };
    const result = storage.save(draft);
    if (!result.ok) {
      view.setStatus(result.error, "error");
    }
  }

  function scheduleSave(): void {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, 300);
  }

  async function askConfirm(message: string, title: string): Promise<boolean> {
    try {
      return await confirm(message, { title, kind: "warning" });
    } catch {
      return window.confirm(message);
    }
  }

  async function importInvoiceFiles(): Promise<void> {
    if (busy) return;
    try {
      view.setStatus("正在读取发票…", "info");
      const result = await importInvoices();
      if (result.items.length > 0) {
        invoices.push(...result.items);
        view.render(state());
      }

      if (result.errors.length > 0) {
        view.setStatus(result.errors.join("\n"), "error");
      } else if (result.items.length === 0) {
        view.setStatus("未选择发票", "info");
      } else {
        view.setStatus(`已导入 ${result.items.length} 个发票文件`, "success");
      }
    } catch (error) {
      view.setStatus(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  }

  function baseName(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }

  async function chooseSignature(): Promise<void> {
    if (busy) return;
    try {
      const path = await pickSignaturePath();
      if (!path) return;

      busy = true;
      view.setBusy(true, "正在读取签名…", "正在读取签名…");
      const bytes = await readImageFile(path);
      const prepared = await prepareSignatureImage(bytes, baseName(path));
      const saved = storage.saveSignature(prepared);
      if (!saved.ok) {
        throw new Error(saved.error);
      }

      signature = prepared;
      view.render(state());
      view.setStatus(`已设置签名：${prepared.fileName}`, "success");
    } catch (error) {
      view.setStatus(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      busy = false;
      view.setBusy(false);
    }
  }

  async function clearSignature(): Promise<void> {
    if (busy || !signature) return;
    const confirmed = await askConfirm(
      "确定清除已保存的电子签名？",
      "清除签名",
    );
    if (!confirmed || busy) return;

    const result = storage.clearSignature();
    if (!result.ok) {
      view.setStatus(result.error, "error");
      return;
    }
    signature = null;
    view.render(state());
    view.setStatus("已清除电子签名", "info");
  }

  async function exportPdf(): Promise<void> {
    if (busy) return;

    const errors = validateInstances(instances);
    if (errors.length > 0) {
      view.setStatus(errors.join("\n"), "error");
      return;
    }
    if (instances.length === 0 && invoices.length === 0) {
      view.setStatus("没有可导出的报销单或发票", "error");
      return;
    }

    busy = true;
    view.setBusy(true, "正在生成 PDF…");
    try {
      const bytes = await buildReimbursementPdf({
        instances,
        invoices,
        nup,
        signature,
        onProgress: (message) => view.setStatus(message, "info"),
      });
      const result = await savePdfFile(
        `报销单与发票_${timestampName()}.pdf`,
        bytes,
      );
      if (result.canceled) {
        view.setStatus("已取消导出", "info");
        return;
      }
      saveNow();
      view.setStatus(`已导出：${result.path}`, "success", result.path);
    } catch (error) {
      view.setStatus(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      busy = false;
      view.setBusy(false);
    }
  }

  render();
  if (loadNotice) {
    view.setStatus(loadNotice, "warning");
  }

  const onBeforeUnload = (): void => saveNow();
  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      saveNow();
    }
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("visibilitychange", onVisibilityChange);

  let unlistenClose: (() => void) | null = null;
  if (isTauri()) {
    getCurrentWindow()
      .onCloseRequested(() => {
        try {
          saveNow();
        } catch (error) {
          console.error("关闭前保存报销单草稿失败", error);
        }
      })
      .then((unlisten) => {
        unlistenClose = unlisten;
      })
      .catch((error: unknown) => {
        console.warn("注册报销单窗口关闭保存失败", error);
      });
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      saveNow();
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unlistenClose?.();
      view.dispose();
    },
  };
}
