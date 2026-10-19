import type { HolidayYearData, WorkCalendar } from "../types";

/** 完整复制自 WPF Models/WorkCalendar.cs。 */
export const BUILT_IN_HOLIDAYS: Record<number, HolidayYearData> = {
  2025: {
    holidays: [
      "2025-01-01",
      "2025-01-28",
      "2025-01-29",
      "2025-01-30",
      "2025-01-31",
      "2025-02-01",
      "2025-02-02",
      "2025-02-03",
      "2025-02-04",
      "2025-04-04",
      "2025-04-05",
      "2025-04-06",
      "2025-05-01",
      "2025-05-02",
      "2025-05-03",
      "2025-05-04",
      "2025-05-05",
      "2025-05-31",
      "2025-06-01",
      "2025-06-02",
      "2025-10-01",
      "2025-10-02",
      "2025-10-03",
      "2025-10-04",
      "2025-10-05",
      "2025-10-06",
      "2025-10-07",
      "2025-10-08",
    ],
    workdays: ["2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11"],
  },
  2026: {
    holidays: [
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-02-15",
      "2026-02-16",
      "2026-02-17",
      "2026-02-18",
      "2026-02-19",
      "2026-02-20",
      "2026-02-21",
      "2026-02-22",
      "2026-02-23",
      "2026-04-04",
      "2026-04-05",
      "2026-04-06",
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ],
    workdays: [
      "2026-01-04",
      "2026-02-14",
      "2026-02-28",
      "2026-05-09",
      "2026-09-20",
      "2026-10-10",
    ],
  },
};

export const BUILT_IN_YEARS = Object.keys(BUILT_IN_HOLIDAYS).map(Number);

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function parseIsoDate(date: string): DateParts | null {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) {
    return null;
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function dayOfWeek(date: string): number | null {
  const parts = parseIsoDate(date);
  if (!parts) {
    return null;
  }
  return new Date(parts.year, parts.month - 1, parts.day).getDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

export function weekdayText(date: string): string {
  const index = dayOfWeek(date);
  return index === null ? "" : WEEKDAYS[index];
}

export function isBuiltInYear(year: number): boolean {
  return Object.prototype.hasOwnProperty.call(BUILT_IN_HOLIDAYS, year);
}

/**
 * 可变工作日历：内置数据在构造时注册，HolidayService 加载/缓存后会继续注册。
 * 计算函数每次查询都读取当前数据，因此节假日异步到达后无需重建对象。
 */
export class WorkCalendarRegistry implements WorkCalendar {
  private readonly data = new Map<number, HolidayYearData>();

  constructor(initial: Record<number, HolidayYearData> = BUILT_IN_HOLIDAYS) {
    for (const [year, value] of Object.entries(initial)) {
      this.register(Number(year), value);
    }
  }

  register(year: number, value: HolidayYearData): void {
    this.data.set(year, {
      holidays: [...new Set(value.holidays)],
      workdays: [...new Set(value.workdays)],
    });
  }

  has(year: number): boolean {
    return this.data.has(year);
  }

  get(year: number): HolidayYearData | undefined {
    return this.data.get(year);
  }

  isWeekend(date: string): boolean {
    const index = dayOfWeek(date);
    return index === 0 || index === 6;
  }

  isHoliday(date: string): boolean {
    const parts = parseIsoDate(date);
    if (!parts) {
      return false;
    }
    return this.data.get(parts.year)?.holidays.includes(date) ?? false;
  }

  isMakeupWorkday(date: string): boolean {
    const parts = parseIsoDate(date);
    if (!parts) {
      return false;
    }
    return this.data.get(parts.year)?.workdays.includes(date) ?? false;
  }

  isWorkday(date: string): boolean {
    return (
      this.isMakeupWorkday(date) || (!this.isHoliday(date) && !this.isWeekend(date))
    );
  }

  isRestDay(date: string): boolean {
    return (
      (this.isHoliday(date) || this.isWeekend(date)) && !this.isMakeupWorkday(date)
    );
  }
}

/** 当前年份前 1 年至后 10 年，并合并内置年份。 */
export function createYearOptions(now: Date = new Date()): number[] {
  const current = now.getFullYear();
  const years = new Set<number>(BUILT_IN_YEARS);
  for (let year = current - 1; year <= current + 10; year += 1) {
    years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}
