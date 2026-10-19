import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  publishMonthlySummary,
  publishProfile,
} from "../../sidebar-status";
import type { ToolHandle } from "../../tools";
import { MonthlyStore, type StoreEvent } from "./store";
import { createMonthlyView } from "./view";
import { HolidayService } from "./services/holiday-service";
import { MonthlyStorage } from "./services/storage";
import { buildMonthlyWorkbookBytes } from "./services/xlsx-export";
import { revealExport, saveXlsx } from "./services/save-file";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function mountMonthlyReport(container: HTMLElement): ToolHandle {
  const storage = new MonthlyStorage(window.localStorage);
  const holidays = new HolidayService(storage);
  const store = new MonthlyStore({ storage, holidays });

  const view = createMonthlyView(container, {
    onPeriodChange: (period) => store.switchPeriod(period),
    onDayChange: (date, field, value) => store.updateDay(date, field, value),
    onProfileChange: (patch) => store.updateProfile(patch),
    onClear: () => {
      void clearMonth();
    },
    onExport: () => {
      void exportReport();
    },
    onRetryHolidays: () => store.retryHolidays(),
    onReveal: (path) => {
      void revealExport(path).catch((error: unknown) => {
        view.showExportStatus(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      });
    },
  });

  const publishSummary = (snapshot: {
    period: { year: number; month: number };
    summary: { totalWorkHours: number; usedRestDays: number };
  }): void => {
    publishMonthlySummary({
      year: snapshot.period.year,
      month: snapshot.period.month,
      workHours: snapshot.summary.totalWorkHours,
      // usedRestDays 是“天”的百分位，×8 后即“小时”的百分位。
      restHours: snapshot.summary.usedRestDays * 8,
    });
  };

  const unsubscribe = store.subscribe((event: StoreEvent) => {
    switch (event.type) {
      case "reload":
        publishSummary(event.snapshot);
        publishProfile(event.snapshot.profile);
        view.render(event.snapshot);
        break;
      case "row":
        publishSummary(event.snapshot);
        view.updateRow(event.date, event.derived, event.snapshot);
        break;
      case "calendar":
        // usedRestDays 依赖 isWorkday；节假日异步加载完成后需刷新休息小时。
        publishSummary(event.snapshot);
        view.updateCalendar(event.snapshot);
        break;
      case "status":
        publishProfile(event.snapshot.profile);
        view.updateStatus(event.snapshot);
        break;
    }
  });

  async function clearMonth(): Promise<void> {
    if (store.isExporting()) {
      return;
    }
    const { year, month } = store.getPeriod();
    const message = `确定清空 ${year} 年 ${month} 月的全部填写内容？`;

    let confirmed: boolean;
    try {
      confirmed = await confirm(message, {
        title: "清空表单",
        kind: "warning",
      });
    } catch {
      confirmed = window.confirm(message);
    }

    if (confirmed) {
      store.clearMonth();
    }
  }

  async function exportReport(): Promise<void> {
    if (store.isExporting()) {
      return;
    }

    const errors = store.getValidationErrors();
    if (errors.length > 0) {
      view.showExportStatus(errors.join("；"), "error");
      return;
    }

    const payload = store.getExportPayload();
    store.saveNow(true);
    store.setExporting(true);
    view.setBusy(true, "正在导出，请稍候……");
    view.showExportStatus("", "info");

    try {
      // 让浏览器先渲染 busy 状态，再开始同步构建工作簿。
      await nextFrame();
      const bytes = await buildMonthlyWorkbookBytes(payload.lines);
      const result = await saveXlsx(payload.fileName, bytes);

      if (result.canceled) {
        view.showExportStatus("已取消导出", "info");
        return;
      }
      view.showExportStatus(`已导出：${result.path}`, "success", result.path);
    } catch (error) {
      view.showExportStatus(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      store.setExporting(false);
      view.setBusy(false, "");
    }
  }

  store.initialize();

  const autosave = window.setInterval(() => store.saveNow(true), 10_000);
  const onBeforeUnload = (): void => store.flush();
  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      store.flush();
    }
  };

  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("visibilitychange", onVisibilityChange);

  let unlistenClose: (() => void) | null = null;
  if (isTauri()) {
    getCurrentWindow()
      .onCloseRequested(() => {
        // Tauri v2 在监听器返回后会自动调用 Window.destroy() 完成关闭。
        // destroy() 需要 capabilities 中的 core:window:allow-destroy 权限，
        // 且监听器不能抛错，否则 destroy() 不会执行、关闭按钮会失效。
        try {
          store.flush();
        } catch (error) {
          console.error("关闭前保存失败", error);
        }
      })
      .then((unlisten) => {
        unlistenClose = unlisten;
      })
      .catch((error: unknown) => {
        console.warn("注册窗口关闭保存失败", error);
      });
  }

  let disposed = false;
  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      const snapshot = store.getSnapshot();
      publishSummary(snapshot);
      publishProfile(snapshot.profile);
      unsubscribe();
      window.clearInterval(autosave);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unlistenClose?.();
      store.dispose();
      view.dispose();
    },
  };
}
