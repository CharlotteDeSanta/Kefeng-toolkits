export const MAX_AMOUNT_CENTS = 999_999_999; // 9,999,999.99 元，对应 9 位金额格

/** 空串按 0 处理；非法、负数或超出 9 位金额格时返回 null。 */
export function parseAmountToCents(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }

  const [integerPart, decimalPart = ""] = trimmed.split(".");
  const cents =
    Number(integerPart) * 100 +
    Number((decimalPart + "00").slice(0, 2));
  return cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/** 解析为普通数值；空串返回 0，非法返回 null。 */
export function parseDecimal(text: string, digits = 2): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  const pattern =
    digits === 2 ? /^\d{1,7}(?:\.\d{1,2})?$/ : new RegExp(`^\\d{1,7}(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 9 位金额格：前 7 位整数 + 角/分，基于整数分。 */
export function centsToDigits(cents: number): string[] {
  return String(Math.max(0, Math.min(cents, MAX_AMOUNT_CENTS)))
    .padStart(9, "0")
    .split("");
}

/** 金额输入显示值：空保持空；非法保持原文；合法格式化为两位小数。 */
export function amountCellText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const cents = parseAmountToCents(trimmed);
  return cents === null ? "" : formatCents(cents);
}

export function sumAmounts(values: readonly string[]): {
  cents: number;
  hasInvalid: boolean;
} {
  let cents = 0;
  let hasInvalid = false;
  for (const value of values) {
    const parsed = parseAmountToCents(value);
    if (parsed === null) {
      hasInvalid = true;
    } else {
      cents += parsed;
    }
  }
  return { cents, hasInvalid };
}

export function formatDistance(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number(value.toFixed(2)).toString();
}

export function formatRate(value: number): string {
  return value.toFixed(2);
}
