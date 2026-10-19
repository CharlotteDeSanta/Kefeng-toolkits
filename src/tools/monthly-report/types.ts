/** 工时/天数的内部表示：整数百分位（158 = 1.58）。 */
export type Hundredths = number;

export interface Period {
  year: number;
  month: number;
}

export const ENGINEER_LEVELS = [
  "实习工程师",
  "新进工程师",
  "初级工程师",
  "中级工程师",
  "高级工程师",
] as const;

export type EngineerLevel = (typeof ENGINEER_LEVELS)[number];

export const DEFAULT_ENGINEER_LEVEL: EngineerLevel = "新进工程师";

export interface Profile {
  employeeName: string;
  level: EngineerLevel;
}

/** 月报一行只保存用户输入，派生值始终重新计算。 */
export interface DayRecord {
  /** ISO 日期，YYYY-MM-DD。 */
  date: string;
  location: string;
  workContent: string;
  /** HH:mm；空字符串表示未填写。 */
  startTime: string;
  /** HH:mm；空字符串表示未填写。 */
  endTime: string;
}

export interface DayDerived {
  workHours: Hundredths;
  overtimeHours: Hundredths;
  projectAttendance: Hundredths;
  isRestDay: boolean;
  hasInvalidTime: boolean;
  hasFilledTime: boolean;
  containsRest: boolean;
  isPureRest: boolean;
}

export interface SummaryValues {
  actualWorkDays: Hundredths;
  projectAttendanceDays: Hundredths;
  totalWorkHours: Hundredths;
  totalOvertimeHours: Hundredths;
  accruedRestDays: Hundredths;
  usedRestDays: Hundredths;
}

export interface LocationSummaryRow {
  location: string;
  attendanceDays: Hundredths;
  overtimeHours: Hundredths;
}

export interface ReportMeta {
  year: number;
  month: number;
  employeeName: string;
  level: EngineerLevel;
}

export type LineRole =
  | "Title"
  | "Meta"
  | "DetailHeader"
  | "Detail"
  | "Separator"
  | "SummaryTitle"
  | "SummaryValues"
  | "LocationTitle"
  | "LocationHeader"
  | "LocationRow";

export interface ReportLine {
  role: LineRole;
  /** 固定 8 列，不足补空串。 */
  cells: string[];
  restDay?: boolean;
  mergeDownCols?: number[];
  mergeDownCount?: number;
  columnCount: number;
}

export interface HolidayYearData {
  holidays: string[];
  workdays: string[];
}

export type HolidayStatus = "loading" | "builtin" | "network" | "cache" | "unavailable";

export interface HolidayInfo {
  year: number;
  status: HolidayStatus;
  message: string;
  reliable: boolean;
  loading: boolean;
}

export interface WorkCalendar {
  isHoliday(date: string): boolean;
  isMakeupWorkday(date: string): boolean;
  isWeekend(date: string): boolean;
  isWorkday(date: string): boolean;
  isRestDay(date: string): boolean;
}

export interface DraftData {
  schemaVersion: 1;
  year: number;
  month: number;
  days: DayRecord[];
}

export type WarningLevel = "info" | "normal" | "critical";

/** 视图渲染所需的完整状态快照。 */
export interface StoreSnapshot {
  period: Period;
  years: number[];
  profile: Profile;
  days: DayRecord[];
  derived: Map<string, DayDerived>;
  summary: SummaryValues;
  locations: LocationSummaryRow[];
  holiday: HolidayInfo;
  dirty: boolean;
  saveError: string | null;
  notice: string;
  exporting: boolean;
  canExport: boolean;
  warningText: string;
  warningLevel: WarningLevel;
}
