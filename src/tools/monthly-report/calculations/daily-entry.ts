import type { DayDerived, DayRecord, WorkCalendar } from "../types";
import { minutesToHundredths } from "./fixed-point";
import { parseTime, workMinutes } from "./time";

const COMPANY = "公司";
const REST_LEAVE = "调休";
const REST = "休息";

/** 地点是否含“调休”或“休息”（两者同义）。 */
export function containsRest(location: string): boolean {
  return location.includes(REST_LEAVE) || location.includes(REST);
}

/** 纯调休/休息：地点恰为“调休”或“休息”。 */
export function isPureRest(location: string): boolean {
  return location === REST_LEAVE || location === REST;
}

/** 混合调休：含“调休/休息”且带“/”。 */
export function isMixedRest(location: string): boolean {
  return containsRest(location) && location.includes("/");
}

/** 拆分并剔除 公司/调休/休息 后的项目名 token。 */
export function getProjectTokens(location: string): string[] {
  return location
    .split("/")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 0 && token !== COMPANY && token !== REST_LEAVE && token !== REST,
    );
}

export function hasProject(location: string): boolean {
  return getProjectTokens(location).length > 0;
}

/** 工作时长（小时百分位）。 */
export function workHoursHundredths(day: DayRecord): number {
  const minutes = workMinutes(day.startTime, day.endTime);
  return minutes === null ? 0 : minutesToHundredths(minutes);
}

/** 正常工作日口径：混合公司调休超过 4h，其余超过 8h。 */
function workdayOvertime(location: string, hours: number): number {
  return isMixedRest(location)
    ? Math.max(hours - 400, 0)
    : Math.max(hours - 800, 0);
}

/**
 * 加班时长（小时百分位）。
 * - 国家调班日（如国庆后的周六）：按正常工作日计算，不按休息日全天计加班；
 * - 普通周末/法定节假日（非调班日）：全部工时；
 * - 其他工作日：混合公司调休超过 4h，其余超过 8h。
 */
export function overtimeHoursHundredths(
  day: DayRecord,
  calendar: WorkCalendar,
): number {
  const hours = workHoursHundredths(day);
  if (hours <= 0) {
    return 0;
  }

  // 调班日优先于周末判断：日历上虽是周六/周日，但属于法定工作日。
  if (calendar.isMakeupWorkday(day.date)) {
    return workdayOvertime(day.location, hours);
  }

  if (calendar.isHoliday(day.date) || calendar.isWeekend(day.date)) {
    return hours;
  }

  return workdayOvertime(day.location, hours);
}

/** 项目出勤（天百分位：0 / 50 / 100）。 */
export function projectAttendanceHundredths(day: DayRecord): number {
  const location = day.location;
  if (!hasProject(location)) {
    return 0;
  }
  if (location.includes(COMPANY)) {
    return 50;
  }

  const hours = workHoursHundredths(day);
  if (hours < 400) {
    return 0;
  }
  if (hours < 800) {
    return 50;
  }
  return 100;
}

export function deriveDay(day: DayRecord, calendar: WorkCalendar): DayDerived {
  const location = day.location.trim();
  const startTime = day.startTime.trim();
  const endTime = day.endTime.trim();
  const hasInvalidTime =
    (startTime.length > 0 && parseTime(startTime) === null) ||
    (endTime.length > 0 && parseTime(endTime) === null);

  const normalizedDay: DayRecord = { ...day, location, startTime, endTime };

  return {
    workHours: workHoursHundredths(normalizedDay),
    overtimeHours: overtimeHoursHundredths(normalizedDay, calendar),
    projectAttendance: projectAttendanceHundredths(normalizedDay),
    isRestDay: calendar.isRestDay(day.date),
    hasInvalidTime,
    hasFilledTime: startTime.length > 0 || endTime.length > 0,
    containsRest: containsRest(location),
    isPureRest: isPureRest(location),
  };
}
