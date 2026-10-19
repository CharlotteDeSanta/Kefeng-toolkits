import {
  ENGINEER_LEVELS,
  type DayDerived,
  type DayRecord,
  type EngineerLevel,
  type Period,
  type Profile,
  type StoreSnapshot,
} from "./types";
import type { DayField } from "./store";
import { formatHundredths } from "./calculations/fixed-point";
import { parseTime } from "./calculations/time";
import { weekdayText } from "./calculations/work-calendar";
import "./styles.css";

export interface MonthlyViewHandlers {
  onPeriodChange(period: Period): void;
  onDayChange(date: string, field: DayField, value: string): void;
  onProfileChange(patch: Partial<Profile>): void;
  onClear(): void;
  onExport(): void;
  onRetryHolidays(): void;
  onReveal(path: string): void;
}

export interface MonthlyView {
  render(snapshot: StoreSnapshot): void;
  updateRow(date: string, derived: DayDerived, snapshot: StoreSnapshot): void;
  updateCalendar(snapshot: StoreSnapshot): void;
  updateStatus(snapshot: StoreSnapshot): void;
  setBusy(busy: boolean, text: string): void;
  showExportStatus(
    text: string,
    level: "info" | "success" | "error",
    path?: string,
  ): void;
  dispose(): void;
}

interface RowElements {
  row: HTMLTableRowElement;
  location: HTMLInputElement;
  content: HTMLTextAreaElement;
  start: HTMLInputElement;
  end: HTMLInputElement;
  startCell: HTMLTableCellElement;
  endCell: HTMLTableCellElement;
  work: HTMLTableCellElement;
  overtime: HTMLTableCellElement;
  attendance: HTMLTableCellElement;
}

const SUMMARY_LABELS = [
  "实际上班天数(天)",
  "项目出勤天数(天)",
  "总工作时长(h)",
  "总加班时长(h)",
  "当月累计可调休天数(天)",
  "当月已调休天数(天)",
] as const;

const HEADERS = [
  "日期",
  "星期",
  "上班地点",
  "工作内容",
  "上班时间",
  "下班时间",
  "工作时长(h)",
  "加班时长(h)",
  "项目出勤",
];

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function timeInputValue(value: string): string {
  const parsed = parseTime(value);
  if (!parsed) {
    return "";
  }
  return `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
}

function autoResize(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 40), 140)}px`;
}

export function createMonthlyView(
  container: HTMLElement,
  handlers: MonthlyViewHandlers,
): MonthlyView {
  container.replaceChildren();
  const root = element("section", "monthly-report");
  const abort = new AbortController();
  const signal = abort.signal;
  const rows = new Map<string, RowElements>();
  let lastSnapshot: StoreSnapshot | null = null;
  let revealPath: string | null = null;

  // ---------- 工具栏 ----------
  const toolbar = element("div", "mr-toolbar");

  const yearField = element("label", "mr-field");
  yearField.append(element("span", "mr-field__label", "年份"));
  const yearSelect = element("select", "mr-select");
  yearSelect.dataset.role = "year";
  yearField.append(yearSelect);

  const monthField = element("label", "mr-field");
  monthField.append(element("span", "mr-field__label", "月份"));
  const monthSelect = element("select", "mr-select");
  monthSelect.dataset.role = "month";
  for (let month = 1; month <= 12; month += 1) {
    const option = element("option", undefined, String(month));
    option.value = String(month);
    monthSelect.append(option);
  }
  monthField.append(monthSelect);

  const title = element("div", "mr-title");
  title.dataset.role = "title";

  const spacer = element("div", "mr-spacer");

  const nameField = element("label", "mr-field");
  nameField.append(element("span", "mr-field__label", "姓名"));
  const nameInput = element("input", "mr-input");
  nameInput.type = "text";
  nameInput.placeholder = "请输入姓名";
  nameInput.dataset.role = "name";
  nameField.append(nameInput);

  const levelField = element("label", "mr-field");
  levelField.append(element("span", "mr-field__label", "工程师等级"));
  const levelSelect = element("select", "mr-select");
  levelSelect.dataset.role = "level";
  for (const level of ENGINEER_LEVELS) {
    const option = element("option", undefined, level);
    option.value = level;
    levelSelect.append(option);
  }
  levelField.append(levelSelect);

  const actions = element("div", "mr-actions");
  const exportButton = element("button", "mr-button mr-button--primary", "导出 XLSX");
  exportButton.type = "button";
  exportButton.dataset.role = "export";
  const clearButton = element("button", "mr-button mr-button--danger", "清空表单");
  clearButton.type = "button";
  clearButton.dataset.role = "clear";
  actions.append(exportButton, clearButton);

  toolbar.append(yearField, monthField, title, spacer, nameField, levelField, actions);

  // ---------- 明细表 ----------
  const tableWrap = element("div", "mr-table-wrap");
  const table = element("table", "mr-grid");
  const colgroup = element("colgroup");
  for (const className of [
    "mr-col-date",
    "mr-col-weekday",
    "mr-col-location",
    "mr-col-content",
    "mr-col-time",
    "mr-col-time",
    "mr-col-number",
    "mr-col-number",
    "mr-col-number",
  ]) {
    colgroup.append(element("col", className));
  }
  const thead = element("thead");
  const headerRow = element("tr");
  for (const header of HEADERS) {
    headerRow.append(element("th", undefined, header));
  }
  thead.append(headerRow);
  const tbody = element("tbody");
  tbody.dataset.role = "rows";
  table.append(colgroup, thead, tbody);
  tableWrap.append(table);

  // ---------- 汇总区 ----------
  const summarySection = element("div", "mr-summary");

  const summaryPanel = element("section", "mr-panel");
  summaryPanel.append(element("h2", "mr-panel__title", "月度汇总统计"));
  const summaryTable = element("table", "mr-summary-table");
  const summaryHead = element("thead");
  const summaryHeadRow = element("tr");
  summaryHeadRow.append(
    element("th", undefined, "统计项"),
    element("th", "mr-number", "数值"),
  );
  summaryHead.append(summaryHeadRow);
  const summaryBody = element("tbody");
  summaryBody.dataset.role = "summary-body";
  summaryTable.append(summaryHead, summaryBody);
  summaryPanel.append(summaryTable);

  const locationPanel = element("section", "mr-panel");
  locationPanel.append(element("h2", "mr-panel__title", "项目地点汇总"));
  const locationTable = element("table", "mr-summary-table");
  const locationHead = element("thead");
  const locationHeadRow = element("tr");
  locationHeadRow.append(
    element("th", undefined, "项目地点"),
    element("th", "mr-number", "出勤天数(天)"),
    element("th", "mr-number", "加班时长(h)"),
  );
  locationHead.append(locationHeadRow);
  const locationBody = element("tbody");
  locationBody.dataset.role = "locations-body";
  locationTable.append(locationHead, locationBody);
  locationPanel.append(locationTable);

  summarySection.append(summaryPanel, locationPanel);

  // ---------- 状态区 ----------
  const status = element("div", "mr-status");
  const warningText = element("span");
  warningText.dataset.role = "warning-text";
  const retryButton = element("button", "mr-link-button", "重试");
  retryButton.type = "button";
  retryButton.hidden = true;
  retryButton.addEventListener("click", () => handlers.onRetryHolidays(), { signal });
  status.append(warningText, retryButton);

  const feedback = element("div", "mr-feedback");
  const busyText = element("span", "mr-busy");
  const exportStatus = element("span", "mr-export-status");
  exportStatus.dataset.role = "export-status";
  const revealButton = element("button", "mr-link-button", "在文件夹中显示");
  revealButton.type = "button";
  revealButton.hidden = true;
  revealButton.addEventListener(
    "click",
    () => {
      if (revealPath) {
        handlers.onReveal(revealPath);
      }
    },
    { signal },
  );
  feedback.append(busyText, exportStatus, revealButton);

  root.append(toolbar, tableWrap, summarySection, status, feedback);
  container.append(root);

  // ---------- 事件 ----------
  yearSelect.addEventListener(
    "change",
    () => {
      handlers.onPeriodChange({
        year: Number(yearSelect.value),
        month: Number(monthSelect.value),
      });
    },
    { signal },
  );
  monthSelect.addEventListener(
    "change",
    () => {
      handlers.onPeriodChange({
        year: Number(yearSelect.value),
        month: Number(monthSelect.value),
      });
    },
    { signal },
  );
  nameInput.addEventListener(
    "input",
    () => handlers.onProfileChange({ employeeName: nameInput.value }),
    { signal },
  );
  levelSelect.addEventListener(
    "change",
    () =>
      handlers.onProfileChange({
        level: levelSelect.value as EngineerLevel,
      }),
    { signal },
  );
  exportButton.addEventListener("click", () => handlers.onExport(), { signal });
  clearButton.addEventListener("click", () => handlers.onClear(), { signal });

  tbody.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      const field = target.dataset.field as DayField | undefined;
      const row = target.closest("tr[data-date]") as HTMLTableRowElement | null;
      if (!field || !row?.dataset.date) {
        return;
      }
      handlers.onDayChange(row.dataset.date, field, target.value);
      if (target instanceof HTMLTextAreaElement) {
        autoResize(target);
      }
    },
    { signal },
  );

  tbody.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "time") {
        return;
      }
      const field = target.dataset.field;
      if (
        (field !== "startTime" && field !== "endTime") ||
        target.value.length > 0
      ) {
        return;
      }
      const row = target.closest("tr[data-date]") as HTMLTableRowElement | null;
      if (!row?.dataset.date) {
        return;
      }
      const value = field === "startTime" ? "09:00" : "17:00";
      target.value = value;
      handlers.onDayChange(row.dataset.date, field, value);
    },
    { signal },
  );

  tbody.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest("button[data-clear-time]");
      if (!button) {
        return;
      }
      const wrapper = button.closest(".mr-time");
      const input = wrapper?.querySelector<HTMLInputElement>("input[type=time]");
      const row = button.closest("tr[data-date]") as HTMLTableRowElement | null;
      const field = input?.dataset.field as DayField | undefined;
      if (!input || !field || !row?.dataset.date) {
        return;
      }
      input.value = "";
      handlers.onDayChange(row.dataset.date, field, "");
      input.focus();
    },
    { signal },
  );

  tbody.addEventListener(
    "focusout",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      const field = target.dataset.field;
      if (field !== "location" && field !== "startTime" && field !== "endTime") {
        return;
      }
      const trimmed = target.value.trim();
      if (trimmed === target.value) {
        return;
      }
      target.value = trimmed;
      const row = target.closest("tr[data-date]") as HTMLTableRowElement | null;
      if (row?.dataset.date) {
        handlers.onDayChange(row.dataset.date, field, trimmed);
      }
    },
    { signal },
  );

  // ---------- 渲染 ----------

  function renderRows(snapshot: StoreSnapshot): void {
    rows.clear();
    tbody.replaceChildren();

    for (const day of snapshot.days) {
      const derived = snapshot.derived.get(day.date);
      const entry = createRow(day, derived);
      rows.set(day.date, entry);
      tbody.append(entry.row);
    }

    requestAnimationFrame(() => {
      for (const entry of rows.values()) {
        autoResize(entry.content);
      }
    });
  }

  function createRow(day: DayRecord, derived: DayDerived | undefined): RowElements {
    const row = element("tr");
    row.dataset.date = day.date;
    if (derived?.isRestDay) {
      row.classList.add("is-rest-day");
    }

    const dateCell = element("td", "mr-cell mr-cell--date", day.date);
    const weekdayCell = element(
      "td",
      "mr-cell mr-cell--weekday",
      weekdayText(day.date),
    );

    const locationCell = element("td", "mr-cell");
    const location = element("input", "mr-cell-input");
    location.type = "text";
    location.dataset.field = "location";
    location.value = day.location;
    location.placeholder = "公司 / 项目 / 调休";
    locationCell.append(location);

    const contentCell = element("td", "mr-cell");
    const content = element("textarea", "mr-cell-textarea");
    content.dataset.field = "workContent";
    content.rows = 2;
    content.value = day.workContent;
    content.placeholder = "填写工作内容";
    contentCell.append(content);

    const startCell = element("td", "mr-cell mr-cell--time");
    const start = createTimeInput(day.date, "startTime", day.startTime);
    startCell.append(createTimeWrapper(start, "startTime"));

    const endCell = element("td", "mr-cell mr-cell--time");
    const end = createTimeInput(day.date, "endTime", day.endTime);
    endCell.append(createTimeWrapper(end, "endTime"));

    const workCell = element("td", "mr-cell mr-cell--number");
    workCell.dataset.derived = "work";
    const overtimeCell = element("td", "mr-cell mr-cell--number");
    overtimeCell.dataset.derived = "overtime";
    const attendanceCell = element("td", "mr-cell mr-cell--number");
    attendanceCell.dataset.derived = "attendance";

    applyDerived(workCell, overtimeCell, attendanceCell, derived);
    markInvalidTime(startCell, day.startTime);
    markInvalidTime(endCell, day.endTime);

    row.append(
      dateCell,
      weekdayCell,
      locationCell,
      contentCell,
      startCell,
      endCell,
      workCell,
      overtimeCell,
      attendanceCell,
    );

    return {
      row,
      location,
      content,
      start,
      end,
      startCell,
      endCell,
      work: workCell,
      overtime: overtimeCell,
      attendance: attendanceCell,
    };
  }

  function createTimeInput(
    date: string,
    field: "startTime" | "endTime",
    value: string,
  ): HTMLInputElement {
    const input = element("input", "mr-time-input");
    input.type = "time";
    input.step = "60";
    input.dataset.field = field;
    input.dataset.date = date;
    input.value = timeInputValue(value);
    return input;
  }

  function createTimeWrapper(
    input: HTMLInputElement,
    field: "startTime" | "endTime",
  ): HTMLDivElement {
    const wrapper = element("div", "mr-time");
    const clear = element("button", "mr-clear-time", "×");
    clear.type = "button";
    clear.dataset.clearTime = field;
    clear.title = field === "startTime" ? "清空上班时间" : "清空下班时间";
    clear.setAttribute("aria-label", clear.title);
    wrapper.append(input, clear);
    return wrapper;
  }

  function markInvalidTime(cell: HTMLTableCellElement, value: string): void {
    const invalid = value.trim().length > 0 && parseTime(value) === null;
    cell.classList.toggle("is-invalid", invalid);
  }

  function applyDerived(
    workCell: HTMLTableCellElement,
    overtimeCell: HTMLTableCellElement,
    attendanceCell: HTMLTableCellElement,
    derived: DayDerived | undefined,
  ): void {
    workCell.textContent = derived ? formatHundredths(derived.workHours, 2) : "0.00";
    overtimeCell.textContent = derived
      ? formatHundredths(derived.overtimeHours, 2)
      : "0.00";
    attendanceCell.textContent = derived
      ? formatHundredths(derived.projectAttendance, 2)
      : "0.00";
  }

  function updateSummary(snapshot: StoreSnapshot): void {
    summaryBody.replaceChildren();
    const values = [
      formatHundredths(snapshot.summary.actualWorkDays, 1),
      formatHundredths(snapshot.summary.projectAttendanceDays, 2),
      formatHundredths(snapshot.summary.totalWorkHours, 2),
      formatHundredths(snapshot.summary.totalOvertimeHours, 2),
      formatHundredths(snapshot.summary.accruedRestDays, 2),
      formatHundredths(snapshot.summary.usedRestDays, 1),
    ];
    SUMMARY_LABELS.forEach((label, index) => {
      const row = element("tr");
      row.append(
        element("td", undefined, label),
        element("td", "mr-number", values[index]),
      );
      summaryBody.append(row);
    });

    locationBody.replaceChildren();
    if (snapshot.locations.length === 0) {
      const row = element("tr");
      const cell = element("td", "mr-empty", "暂无项目记录");
      cell.colSpan = 3;
      row.append(cell);
      locationBody.append(row);
    } else {
      for (const location of snapshot.locations) {
        const row = element("tr");
        row.append(
          element("td", undefined, location.location),
          element("td", "mr-number", formatHundredths(location.attendanceDays, 1)),
          element("td", "mr-number", formatHundredths(location.overtimeHours, 2)),
        );
        locationBody.append(row);
      }
    }
  }

  function updateStatus(snapshot: StoreSnapshot): void {
    lastSnapshot = snapshot;
    updateSummary(snapshot);

    warningText.textContent = snapshot.warningText;
    status.classList.remove(
      "mr-status--info",
      "mr-status--normal",
      "mr-status--critical",
    );
    status.classList.add(`mr-status--${snapshot.warningLevel}`);
    status.classList.toggle("is-empty", snapshot.warningText.length === 0);
    retryButton.hidden = snapshot.holiday.status !== "unavailable";

    exportButton.disabled = !snapshot.canExport;
    clearButton.disabled = snapshot.exporting;
    exportButton.textContent = snapshot.exporting ? "正在导出…" : "导出 XLSX";
  }

  function updateRowInternal(
    date: string,
    derived: DayDerived,
    snapshot: StoreSnapshot,
  ): void {
    const entry = rows.get(date);
    if (!entry) {
      return;
    }
    entry.row.classList.toggle("is-rest-day", derived.isRestDay);
    applyDerived(entry.work, entry.overtime, entry.attendance, derived);

    const day = snapshot.days.find((item) => item.date === date);
    if (day) {
      markInvalidTime(entry.startCell, day.startTime);
      markInvalidTime(entry.endCell, day.endTime);
    }
  }

  return {
    render(snapshot) {
      yearSelect.replaceChildren();
      for (const year of snapshot.years) {
        const option = element("option", undefined, String(year));
        option.value = String(year);
        yearSelect.append(option);
      }
      yearSelect.value = String(snapshot.period.year);
      monthSelect.value = String(snapshot.period.month);
      title.textContent = `${snapshot.period.year}年AGV项目工作月报`;
      nameInput.value = snapshot.profile.employeeName;
      levelSelect.value = snapshot.profile.level;

      renderRows(snapshot);
      updateStatus(snapshot);
    },

    updateRow(date, derived, snapshot) {
      updateRowInternal(date, derived, snapshot);
      updateStatus(snapshot);
    },

    updateCalendar(snapshot) {
      for (const day of snapshot.days) {
        const derived = snapshot.derived.get(day.date);
        if (derived) {
          updateRowInternal(day.date, derived, snapshot);
        }
      }
      updateStatus(snapshot);
    },

    updateStatus,

    setBusy(busy, text) {
      busyText.textContent = text;
      exportButton.disabled = busy || !lastSnapshot?.canExport;
      clearButton.disabled = busy;
      if (busy) {
        exportButton.textContent = "正在导出…";
      } else if (lastSnapshot) {
        exportButton.textContent = "导出 XLSX";
      }
    },

    showExportStatus(text, level, path) {
      exportStatus.textContent = text;
      exportStatus.className = `mr-export-status mr-export-status--${level}`;
      revealPath = path ?? null;
      revealButton.hidden = revealPath === null;
    },

    dispose() {
      abort.abort();
      root.remove();
      rows.clear();
    },
  };
}
