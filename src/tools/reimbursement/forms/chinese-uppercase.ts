const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const SMALL_UNITS = ["", "拾", "佰", "仟"];
const BIG_UNITS = ["", "万", "亿", "万亿"];

function groupToChinese(group: number): string {
  let result = "";
  let zeroPending = false;

  for (let unit = 3; unit >= 0; unit -= 1) {
    const digit = Math.floor(group / 10 ** unit) % 10;
    if (digit === 0) {
      if (result.length > 0) {
        zeroPending = true;
      }
      continue;
    }

    if (zeroPending) {
      result += "零";
      zeroPending = false;
    }
    result += DIGITS[digit] + SMALL_UNITS[unit];
  }

  return result;
}

/** 人民币中文大写；输入为整数分，范围 0 ~ 999,999,999。 */
export function toChineseUppercase(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0 || cents > 999_999_999) {
    throw new Error("金额超出中文大写支持范围");
  }

  const yuan = Math.floor(cents / 100);
  const jiao = Math.floor(cents / 10) % 10;
  const fen = cents % 10;

  if (yuan === 0 && jiao === 0 && fen === 0) {
    return "零元整";
  }

  let integerPart = "";
  if (yuan > 0) {
    const groups: number[] = [];
    let remaining = yuan;
    while (remaining > 0) {
      groups.push(remaining % 10000);
      remaining = Math.floor(remaining / 10000);
    }

    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const group = groups[index];
      if (group === 0) {
        if (
          integerPart.length > 0 &&
          groups.slice(0, index).some((value) => value > 0) &&
          !integerPart.endsWith("零")
        ) {
          integerPart += "零";
        }
        continue;
      }

      if (
        integerPart.length > 0 &&
        group < 1000 &&
        !integerPart.endsWith("零")
      ) {
        integerPart += "零";
      }
      integerPart += groupToChinese(group) + BIG_UNITS[index];
    }
  } else {
    integerPart = "零";
  }

  let result = `${integerPart}元`;

  if (jiao === 0 && fen === 0) {
    return `${result}整`;
  }

  if (jiao > 0) {
    result += `${DIGITS[jiao]}角`;
  } else if (fen > 0) {
    result += "零";
  }

  if (fen > 0) {
    result += `${DIGITS[fen]}分`;
  } else {
    result += "整";
  }

  return result;
}
