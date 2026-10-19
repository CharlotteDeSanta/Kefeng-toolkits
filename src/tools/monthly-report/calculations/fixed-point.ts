import type { Hundredths } from "../types";

const SCALE = 100;

/** 按指定小数位四舍五入（half away from zero），与 .NET Math.Round(AwayFromZero) 一致。 */
export function roundHalfAwayFromZero(value: number, digits = 2): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const rounded = Math.sign(scaled) * Math.floor(Math.abs(scaled) + 0.5);
  return rounded / factor;
}

/**
 * 分钟数转“小时”的整数百分位。
 * minutes × 100 / 60 = minutes × 5 / 3，小数部分只会是 0/⅓/⅔，不会出现 .5 平局。
 */
export function minutesToHundredths(minutes: number): Hundredths {
  const sign = Math.sign(minutes);
  const abs = Math.abs(minutes);
  return sign * Math.floor((abs * 5 + 1.5) / 3);
}

/** 银行家舍入（round half to even）到整数。 */
export function roundToEvenInt(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (Math.abs(diff - 0.5) < 1e-9) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(value);
}

/** 总加班（小时百分位）÷ 8 → 可调休天数百分位，银行家舍入。 */
export function accruedRestDays(totalOvertimeHundredths: Hundredths): Hundredths {
  if (totalOvertimeHundredths <= 0) {
    return 0;
  }
  return roundToEvenInt(totalOvertimeHundredths / 8);
}

/** 百分位数值格式化为固定小数位文本（对应 .NET "0.0" / "0.00"）。 */
export function formatHundredths(value: Hundredths, digits: 1 | 2): string {
  return (value / SCALE).toFixed(digits);
}

/** 百分位数值转为 Excel 中的真实数字。 */
export function hundredthsToNumber(value: Hundredths): number {
  return value / SCALE;
}
