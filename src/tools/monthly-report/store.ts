import {
  DEFAULT_ENGINEER_LEVEL,
  ENGINEER_LEVELS,
  type DayDerived,
  type DayRecord,
  type HolidayInfo,
  type LocationSummaryRow,
  type Period,
  type Profile,
  type ReportLine,
  type StoreSnapshot,
  type SummaryValues,
  type WarningLevel,
} from "./types";
import { deriveDay } from "./calculations/daily-entry";
import {
  computeLocationSummary,
  computeSummary,
  EMPTY_SUMMARY,
} from "./calculations/summary";
import {
  createYearOptions,
  daysInMonth,
  isoDate,
} from "./calculations/work-calendar";
import { buildReportLines, defaultFileName } from "./calculations/report-layout";
import type { MonthlyStorage } from "./services/storage";
import type { HolidayService } from "./services/holiday-service";

export type DayField = "location" | "workContent" | "startTime" | "endTime";

export type StoreEvent =
  | { type: "reload"; snapshot: StoreSnapshot }
  | { type: "row"; date: string; derived: DayDerived; snapshot: StoreSnapshot }
  | { type: "calendar"; snapshot: StoreSnapshot }
  | { type: "status"; snapshot: StoreSnapshot };

type Listener = (event: StoreEvent) => void;

export interface MonthlyStoreOptions {
  storage: MonthlyStorage;
  holidays: HolidayService;
  now?: () => Date;
}

function periodKey(period: Period): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

function parsePeriodKey(key: string): Period | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) {
    return null;
  }
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }
  return { year: Number(match[1]), month };
}

function cloneDay(day: DayRecord): DayRecord {
  return {
    date: day.date,
    location: day.location,
    workContent: day.workContent,
    startTime: day.startTime,
    endTime: day.endTime,
  };
}

function createEmptyDays(period: Period): DayRecord[] {
  const count = daysInMonth(period.year, period.month);
  return Array.from({ length: count }, (_, index) => ({
    date: isoDate(period.year, period.month, index + 1),
    location: "",
    workContent: "",
    startTime: "",
    endTime: "",
  }));
}

/** 校验草稿日期序列；不匹配时返回 null，避免把上个月的数据当成这个月。 */
function normalizeDraftDays(
  period: Period,
  days: readonly DayRecord[],
): DayRecord[] | null {
  const expectedCount = daysInMonth(period.year, period.month);
  if (days.length !== expectedCount) {
    return null;
  }

  const normalized: DayRecord[] = [];
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    const expectedDate = isoDate(period.year, period.month, index + 1);
    if (day.date !== expectedDate) {
      return null;
    }
    normalized.push({
      date: day.date,
      location: day.location.trim(),
      workContent: day.workContent,
      startTime: day.startTime.trim(),
      endTime: day.endTime.trim(),
    });
  }
  return normalized;
}

export class MonthlyStore {
  private readonly years: number[];
  private period: Period;
  private profile: Profile = {
    employeeName: "",
    level: DEFAULT_ENGINEER_LEVEL,
  };
  private days: DayRecord[] = [];
  private derived = new Map<string, DayDerived>();
  private summary: SummaryValues = { ...EMPTY_SUMMARY };
  private locations: LocationSummaryRow[] = [];
  private holidayInfo: HolidayInfo;
  private dirty = false;
  private draftSaveError: string | null = null;
  private profileSaveError: string | null = null;
  private profileDirty = false;
  private storageNotice = "";
  private notice = "";
  private exporting = false;
  private pendingDrafts = new Map<string, DayRecord[]>();
  private holidayGeneration = 0;
  private profileTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<Listener>();
  private initialized = false;

  constructor(private readonly options: MonthlyStoreOptions) {
    const now = options.now?.() ?? new Date();
    this.period = { year: now.getFullYear(), month: now.getMonth() + 1 };
    this.years = createYearOptions(now);
    this.holidayInfo = options.holidays.describeInitial(this.period.year);
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const profile = this.options.storage.loadProfile();
    if (profile.ok) {
      if (profile.value) {
        this.profile = profile.value;
      }
    } else {
      this.storageNotice = profile.error;
    }

    this.loadMonth();
    this.holidayInfo = this.options.holidays.describeInitial(this.period.year);
    this.recompute();
    this.emit({ type: "reload", snapshot: this.snapshot() });

    if (this.holidayInfo.loading) {
      void this.ensureHolidays(this.period.year);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getPeriod(): Period {
    return { ...this.period };
  }

  getSnapshot(): StoreSnapshot {
    return this.snapshot();
  }

  isExporting(): boolean {
    return this.exporting;
  }

  setExporting(exporting: boolean): void {
    if (this.exporting === exporting) {
      return;
    }
    this.exporting = exporting;
    this.emit({ type: "status", snapshot: this.snapshot() });
  }

  switchPeriod(next: Period): void {
    if (next.year === this.period.year && next.month === this.period.month) {
      return;
    }
    if (!this.years.includes(next.year) || next.month < 1 || next.month > 12) {
      return;
    }

    // 关键：先用“旧 period + 旧数据”保存，再切换。
    this.saveNow(false);

    this.period = { year: next.year, month: next.month };
    this.loadMonth();

    const initial = this.options.holidays.describeInitial(this.period.year);
    this.holidayInfo = initial;
    this.recompute();
    this.emit({ type: "reload", snapshot: this.snapshot() });

    if (initial.loading) {
      void this.ensureHolidays(this.period.year);
    }
  }

  updateDay(date: string, field: DayField, value: string): void {
    const index = this.days.findIndex((day) => day.date === date);
    if (index < 0) {
      return;
    }

    const normalized = field === "workContent" ? value : value.trim();
    const current = this.days[index];
    if (current[field] === normalized) {
      return;
    }

    this.days[index] = { ...current, [field]: normalized };
    const derived = deriveDay(this.days[index], this.options.holidays.calendar);
    this.derived.set(date, derived);
    this.refreshSummary();
    this.dirty = true;
    this.emit({
      type: "row",
      date,
      derived,
      snapshot: this.snapshot(),
    });
  }

  updateProfile(patch: Partial<Profile>): void {
    let changed = false;

    if (
      typeof patch.employeeName === "string" &&
      patch.employeeName !== this.profile.employeeName
    ) {
      this.profile = { ...this.profile, employeeName: patch.employeeName };
      changed = true;
    }

    if (
      patch.level !== undefined &&
      (ENGINEER_LEVELS as readonly string[]).includes(patch.level) &&
      patch.level !== this.profile.level
    ) {
      this.profile = { ...this.profile, level: patch.level };
      changed = true;
    }

    if (!changed) {
      return;
    }

    this.profileDirty = true;
    this.scheduleProfileSave();
    this.emit({ type: "status", snapshot: this.snapshot() });
  }

  clearMonth(): void {
    this.days = createEmptyDays(this.period);
    this.dirty = true;
    this.notice = "";
    this.recompute();
    this.emit({ type: "reload", snapshot: this.snapshot() });
  }

  retryHolidays(): void {
    if (this.holidayInfo.status !== "unavailable") {
      return;
    }
    this.holidayInfo = {
      year: this.period.year,
      status: "loading",
      message: "",
      reliable: false,
      loading: true,
    };
    this.recompute();
    this.emit({ type: "status", snapshot: this.snapshot() });
    void this.ensureHolidays(this.period.year);
  }

  getValidationErrors(): string[] {
    const errors: string[] = [];

    if (this.holidayInfo.loading) {
      errors.push("正在加载节假日数据，请稍候再导出");
    } else if (!this.holidayInfo.reliable) {
      errors.push(
        `${this.holidayInfo.message}。此时导出的加班时长与项目出勤可能不符合实际，` +
          "因此已禁止导出；请连接网络后重试（或联系维护人员补充该年节假日数据）。",
      );
    }

    if (this.profile.employeeName.trim().length === 0) {
      errors.push("请填写姓名");
    }

    const invalidDates = this.days
      .filter((day) => deriveDay(day, this.options.holidays.calendar).hasInvalidTime)
      .map((day) => day.date.slice(5));
    if (invalidDates.length > 0) {
      errors.push(
        `以下日期的时间填写有误（格式应为 HH:mm）：${invalidDates.join("、")}`,
      );
    }

    return errors;
  }

  getExportPayload(): { fileName: string; lines: ReportLine[] } {
    const meta = {
      year: this.period.year,
      month: this.period.month,
      employeeName: this.profile.employeeName.trim(),
      level: this.profile.level,
    };
    return {
      fileName: defaultFileName(meta),
      lines: buildReportLines(
        meta,
        this.days,
        this.options.holidays.calendar,
      ),
    };
  }

  /** 保存当前草稿、pending 草稿与 profile；只有成功才清除 dirty。 */
  saveNow(emit = true): void {
    const hasWork =
      this.dirty || this.pendingDrafts.size > 0 || this.profileDirty;
    if (!hasWork) {
      return;
    }

    const errors: string[] = [];
    const currentKey = periodKey(this.period);
    let currentHandled = false;

    if (this.dirty) {
      currentHandled = true;
      const result = this.options.storage.saveDraft(this.period, this.days);
      if (result.ok) {
        this.dirty = false;
        this.pendingDrafts.delete(currentKey);
      } else {
        errors.push(result.error);
        this.pendingDrafts.set(currentKey, this.days.map(cloneDay));
      }
    }

    for (const [key, days] of [...this.pendingDrafts]) {
      if (currentHandled && key === currentKey) {
        continue;
      }
      const period = parsePeriodKey(key);
      if (!period) {
        this.pendingDrafts.delete(key);
        continue;
      }
      const result = this.options.storage.saveDraft(period, days);
      if (result.ok) {
        this.pendingDrafts.delete(key);
      } else {
        errors.push(result.error);
      }
    }

    this.draftSaveError = errors[0] ?? null;

    if (this.profileDirty) {
      this.saveProfileNow(false);
    }

    if (emit) {
      this.emit({ type: "status", snapshot: this.snapshot() });
    }
  }

  /** 窗口关闭 / 切换工具时调用。 */
  flush(): void {
    if (this.profileTimer !== null) {
      clearTimeout(this.profileTimer);
      this.profileTimer = null;
    }
    this.saveNow(false);
  }

  dispose(): void {
    this.flush();
    if (this.profileTimer !== null) {
      clearTimeout(this.profileTimer);
      this.profileTimer = null;
    }
    this.listeners.clear();
  }

  private scheduleProfileSave(): void {
    if (this.profileTimer !== null) {
      clearTimeout(this.profileTimer);
    }
    this.profileTimer = setTimeout(() => {
      this.profileTimer = null;
      this.saveProfileNow(true);
    }, 400);
  }

  private saveProfileNow(emit: boolean): void {
    if (!this.profileDirty) {
      return;
    }
    const result = this.options.storage.saveProfile(this.profile);
    if (result.ok) {
      this.profileDirty = false;
      this.profileSaveError = null;
    } else {
      this.profileSaveError = result.error;
    }
    if (emit) {
      this.emit({ type: "status", snapshot: this.snapshot() });
    }
  }

  private loadMonth(): void {
    const key = periodKey(this.period);
    const pending = this.pendingDrafts.get(key);
    if (pending) {
      this.days = pending.map(cloneDay);
      this.dirty = true;
      this.notice = `已恢复未保存的 ${this.period.year} 年 ${this.period.month} 月草稿`;
      this.recompute();
      return;
    }

    const draft = this.options.storage.loadDraft(this.period);
    if (!draft.ok) {
      this.days = createEmptyDays(this.period);
      this.dirty = false;
      this.notice = `${draft.error}，已生成空白月报`;
      this.recompute();
      return;
    }

    if (draft.value) {
      const normalized = normalizeDraftDays(this.period, draft.value.days);
      if (normalized) {
        this.days = normalized;
        this.dirty = false;
        this.notice = `已恢复 ${this.period.year} 年 ${this.period.month} 月草稿`;
        this.recompute();
        return;
      }
      this.days = createEmptyDays(this.period);
      this.dirty = false;
      this.notice = "草稿与当前月份不匹配，已生成空白月报";
      this.recompute();
      return;
    }

    this.days = createEmptyDays(this.period);
    this.dirty = false;
    this.notice = "";
    this.recompute();
  }

  private recompute(): void {
    const derived = new Map<string, DayDerived>();
    for (const day of this.days) {
      derived.set(day.date, deriveDay(day, this.options.holidays.calendar));
    }
    this.derived = derived;
    this.refreshSummary();
  }

  private refreshSummary(): void {
    this.summary = computeSummary(this.days, this.options.holidays.calendar);
    this.locations = computeLocationSummary(
      this.days,
      this.options.holidays.calendar,
    );
  }

  private async ensureHolidays(year: number): Promise<void> {
    const generation = ++this.holidayGeneration;
    const result = await this.options.holidays.ensure(year);

    if (generation !== this.holidayGeneration || this.period.year !== year) {
      return;
    }

    this.holidayInfo = {
      year,
      status: result.status,
      message: result.message,
      reliable: result.reliable,
      loading: false,
    };
    this.recompute();
    this.emit({ type: "calendar", snapshot: this.snapshot() });
  }

  private canExport(): boolean {
    return (
      !this.exporting &&
      this.holidayInfo.reliable &&
      !this.holidayInfo.loading
    );
  }

  private buildWarning(): { text: string; level: WarningLevel } {
    const parts: string[] = [];
    let level: WarningLevel = "normal";
    let hasNormal = false;

    if (this.holidayInfo.loading) {
      parts.push(`正在加载 ${this.holidayInfo.year} 年节假日数据…`);
      level = "info";
    } else if (this.holidayInfo.status === "unavailable") {
      parts.push(this.holidayInfo.message);
      level = "critical";
    }

    if (this.storageNotice) {
      parts.push(this.storageNotice);
      hasNormal = true;
    }
    if (this.notice) {
      parts.push(this.notice);
      hasNormal = true;
    }
    if (this.draftSaveError) {
      parts.push(this.draftSaveError);
      level = "critical";
    }
    if (this.profileSaveError) {
      parts.push(this.profileSaveError);
      level = "critical";
    }

    let noWork = 0;
    let noLocation = 0;
    const invalidDates: string[] = [];

    for (const day of this.days) {
      const derived = this.derived.get(day.date);
      if (!derived) {
        continue;
      }
      const location = day.location.trim();
      if (
        location.length > 0 &&
        !derived.containsRest &&
        derived.workHours <= 0
      ) {
        noWork += 1;
      }
      if (derived.hasFilledTime && location.length === 0) {
        noLocation += 1;
      }
      if (derived.hasInvalidTime) {
        invalidDates.push(day.date.slice(5));
      }
    }

    if (noWork > 0) {
      parts.push(`提示：${noWork} 行填写了地点但没有有效工时`);
      hasNormal = true;
    }
    if (noLocation > 0) {
      parts.push(`提示：${noLocation} 行填写了时间但没有地点`);
      hasNormal = true;
    }
    if (invalidDates.length > 0) {
      parts.push(
        `以下日期的时间填写有误（格式应为 HH:mm）：${invalidDates.join("、")}`,
      );
      hasNormal = true;
    }

    if (level !== "critical") {
      level = hasNormal ? "normal" : "info";
    }

    return { text: parts.join("；"), level };
  }

  private snapshot(): StoreSnapshot {
    const warning = this.buildWarning();
    return {
      period: { ...this.period },
      years: [...this.years],
      profile: { ...this.profile },
      days: this.days.map(cloneDay),
      derived: new Map(this.derived),
      summary: { ...this.summary },
      locations: this.locations.map((row) => ({ ...row })),
      holiday: { ...this.holidayInfo },
      dirty: this.dirty,
      saveError: this.draftSaveError ?? this.profileSaveError,
      notice: this.notice,
      exporting: this.exporting,
      canExport: this.canExport(),
      warningText: warning.text,
      warningLevel: warning.level,
    };
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("月报状态更新失败", error);
      }
    }
  }
}
