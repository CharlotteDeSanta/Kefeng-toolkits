import {
  DEFAULT_ENGINEER_LEVEL,
  ENGINEER_LEVELS,
  type DayRecord,
  type DraftData,
  type EngineerLevel,
  type HolidayYearData,
  type Period,
  type Profile,
} from "../types";
import { daysInMonth } from "../calculations/work-calendar";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const PREFIX = "kefeng-toolkits:monthly-report:v1";
const SCHEMA_VERSION = 1;

export const STORAGE_KEYS = {
  profile: `${PREFIX}:profile`,
  draft(period: Period): string {
    return `${PREFIX}:draft:${period.year}-${String(period.month).padStart(2, "0")}`;
  },
  holiday(year: number): string {
    return `${PREFIX}:holiday:${year}`;
  },
};

interface ProfileFile {
  schemaVersion: number;
  employeeName: string;
  level: EngineerLevel;
}

interface HolidayFile {
  schemaVersion: number;
  holidays: string[];
  workdays: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDayRecord(value: unknown): value is DayRecord {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value.date === "string" &&
    typeof value.location === "string" &&
    typeof value.workContent === "string" &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string"
  );
}

function isDraftData(value: unknown): value is DraftData {
  if (!isObject(value)) {
    return false;
  }
  return (
    value.schemaVersion === SCHEMA_VERSION &&
    typeof value.year === "number" &&
    typeof value.month === "number" &&
    Array.isArray(value.days) &&
    value.days.every(isDayRecord)
  );
}

function isHolidayData(value: unknown): value is HolidayYearData {
  return (
    isObject(value) && isStringArray(value.holidays) && isStringArray(value.workdays)
  );
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

/**
 * profile / 月报草稿 / 节假日缓存的本地持久化。
 * 所有异常都转换为 StorageResult，避免存储层把错误抛给界面。
 */
export class MonthlyStorage {
  constructor(private readonly store: KeyValueStore) {}

  loadProfile(): StorageResult<Profile | null> {
    let raw: string | null;
    try {
      raw = this.store.getItem(STORAGE_KEYS.profile);
    } catch (error) {
      return { ok: false, error: `读取个人配置失败：${errorMessage(error)}` };
    }
    if (raw === null) {
      return { ok: true, value: null };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        !isObject(parsed) ||
        parsed.schemaVersion !== SCHEMA_VERSION ||
        typeof parsed.employeeName !== "string" ||
        !ENGINEER_LEVELS.includes(parsed.level as EngineerLevel)
      ) {
        return { ok: false, error: "个人配置格式无效" };
      }
      const file = parsed as unknown as ProfileFile;
      return {
        ok: true,
        value: { employeeName: file.employeeName, level: file.level },
      };
    } catch (error) {
      return { ok: false, error: `个人配置解析失败：${errorMessage(error)}` };
    }
  }

  saveProfile(profile: Profile): StorageResult<void> {
    const file: ProfileFile = {
      schemaVersion: SCHEMA_VERSION,
      employeeName: profile.employeeName,
      level: profile.level,
    };
    try {
      this.store.setItem(STORAGE_KEYS.profile, JSON.stringify(file));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `个人配置保存失败：${errorMessage(error)}` };
    }
  }

  loadDraft(period: Period): StorageResult<DraftData | null> {
    let raw: string | null;
    try {
      raw = this.store.getItem(STORAGE_KEYS.draft(period));
    } catch (error) {
      return { ok: false, error: `读取月报草稿失败：${errorMessage(error)}` };
    }
    if (raw === null) {
      return { ok: true, value: null };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isDraftData(parsed)) {
        return { ok: false, error: "月报草稿格式无效" };
      }
      if (parsed.year !== period.year || parsed.month !== period.month) {
        return { ok: false, error: "月报草稿与当前月份不匹配" };
      }
      if (parsed.days.length !== daysInMonth(period.year, period.month)) {
        return { ok: false, error: "月报草稿天数与当前月份不匹配" };
      }
      return { ok: true, value: parsed };
    } catch (error) {
      return { ok: false, error: `月报草稿解析失败：${errorMessage(error)}` };
    }
  }

  saveDraft(period: Period, days: readonly DayRecord[]): StorageResult<void> {
    const draft: DraftData = {
      schemaVersion: SCHEMA_VERSION,
      year: period.year,
      month: period.month,
      days: days.map(cloneDay),
    };
    try {
      this.store.setItem(STORAGE_KEYS.draft(period), JSON.stringify(draft));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `月报草稿保存失败：${errorMessage(error)}` };
    }
  }

  loadHolidayCache(year: number): StorageResult<HolidayYearData | null> {
    let raw: string | null;
    try {
      raw = this.store.getItem(STORAGE_KEYS.holiday(year));
    } catch (error) {
      return { ok: false, error: `读取节假日缓存失败：${errorMessage(error)}` };
    }
    if (raw === null) {
      return { ok: true, value: null };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        !isObject(parsed) ||
        parsed.schemaVersion !== SCHEMA_VERSION ||
        !isHolidayData(parsed)
      ) {
        return { ok: false, error: "节假日缓存格式无效" };
      }
      return {
        ok: true,
        value: { holidays: parsed.holidays, workdays: parsed.workdays },
      };
    } catch (error) {
      return { ok: false, error: `节假日缓存解析失败：${errorMessage(error)}` };
    }
  }

  saveHolidayCache(year: number, data: HolidayYearData): StorageResult<void> {
    const file: HolidayFile = {
      schemaVersion: SCHEMA_VERSION,
      holidays: [...data.holidays],
      workdays: [...data.workdays],
    };
    try {
      this.store.setItem(STORAGE_KEYS.holiday(year), JSON.stringify(file));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `节假日缓存保存失败：${errorMessage(error)}` };
    }
  }
}

/** 测试/浏览器环境可用的默认等级，避免未初始化时出现 undefined。 */
export const EMPTY_PROFILE: Profile = {
  employeeName: "",
  level: DEFAULT_ENGINEER_LEVEL,
};
