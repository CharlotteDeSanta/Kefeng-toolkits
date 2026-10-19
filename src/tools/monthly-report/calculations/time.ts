export interface ParsedTime {
  hour: number;
  minute: number;
}

// 对应 .NET TimeSpan.TryParseExact 的 "h:mm" / "hh:mm"：小时 0–23，分钟固定两位。
const TIME_PATTERN = /^(\d{1,2}):([0-5]\d)$/;

/** 严格解析 HH:mm；非法返回 null。 */
export function parseTime(text: string): ParsedTime | null {
  const match = TIME_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  if (hour > 23) {
    return null;
  }

  return { hour, minute: Number(match[2]) };
}

/** 空串视为“未填写”，非空则必须可解析。 */
export function isValidTime(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length === 0 || parseTime(trimmed) !== null;
}

/**
 * 计算上班到下班经过的分钟数：下班早于上班按跨午夜 +24h；相等返回 0。
 * 任一时间缺失/非法返回 null。
 */
export function workMinutes(startText: string, endText: string): number | null {
  const start = parseTime(startText);
  const end = parseTime(endText);
  if (!start || !end) {
    return null;
  }

  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  let diff = endMinutes - startMinutes;
  if (diff < 0) {
    diff += 24 * 60;
  }
  return diff;
}
