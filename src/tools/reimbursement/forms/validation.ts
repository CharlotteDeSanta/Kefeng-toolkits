import type { FormInstance } from "../types";
import {
  computeGeneralTotals,
  computePrivateCarTotals,
  computeSummaryTotals,
  computeTravelTotals,
} from "./calculations";
import {
  MAX_AMOUNT_CENTS,
  parseAmountToCents,
  parseDecimal,
} from "./money";
import { isValidIsoDate } from "./pdf-values";

function validateDate(
  iso: string,
  label: string,
  errors: string[],
): void {
  if (!isValidIsoDate(iso)) {
    errors.push(`${label}日期格式无效`);
  }
}

function validateAmount(
  text: string,
  label: string,
  errors: string[],
): void {
  if (text.trim().length > 0 && parseAmountToCents(text) === null) {
    errors.push(`${label}金额格式无效（最多 7 位整数、2 位小数）`);
  }
}

function validateHour(text: string, label: string, errors: string[]): void {
  if (text.trim().length === 0) {
    return;
  }
  if (!/^\d{1,2}$/.test(text.trim())) {
    errors.push(`${label}时间格式无效`);
    return;
  }
  const hour = Number(text);
  if (hour < 0 || hour > 23) {
    errors.push(`${label}时间应在 00–23 之间`);
  }
}

function validateAttachmentCount(
  text: string,
  label: string,
  errors: string[],
): void {
  if (text.trim().length > 0 && !/^\d+$/.test(text.trim())) {
    errors.push(`${label}附件张数应为非负整数`);
  }
}

function validateTravel(instance: Extract<FormInstance, { type: "travel" }>): string[] {
  const errors: string[] = [];
  const data = instance.data;
  validateDate(data.date, "表头", errors);

  data.rows.forEach((row, index) => {
    const label = `第 ${index + 1} 行`;
    validateDate(row.departDate, `${label}出发`, errors);
    validateDate(row.arriveDate, `${label}到达`, errors);
    validateHour(row.departHour, `${label}出发`, errors);
    validateHour(row.arriveHour, `${label}到达`, errors);
    validateAmount(row.vehicleAmount, `${label}车船费`, errors);
    validateAmount(row.travelAmount, `${label}差旅补贴`, errors);
    validateAmount(row.mealAmount, `${label}伙食补贴`, errors);
    validateAmount(row.lodgingAmount, `${label}住宿费`, errors);
  });

  for (const [key, value] of Object.entries(data.extras)) {
    validateAmount(value, `其他费用 ${key} `, errors);
  }
  validateAmount(data.prepayment, "预支金额", errors);
  validateAttachmentCount(data.attachmentCount, "", errors);

  const totals = computeTravelTotals(data);
  if (totals.hasInvalid) {
    errors.push("差旅报销单金额存在非法值或总计超出 9,999,999.99 元");
  }

  return errors;
}

function validateGeneral(instance: Extract<FormInstance, { type: "general" }>): string[] {
  const errors: string[] = [];
  const data = instance.data;
  validateDate(data.date, "表头", errors);
  data.rows.forEach((row, index) => {
    validateDate(row.date, `第 ${index + 1} 行`, errors);
    validateAmount(row.amount, `第 ${index + 1} 行`, errors);
  });
  validateAttachmentCount(data.attachmentCount, "", errors);
  const totals = computeGeneralTotals(data);
  if (totals.hasInvalid || totals.total > MAX_AMOUNT_CENTS) {
    errors.push("报销单金额存在非法值或合计超出 9,999,999.99 元");
  }
  return errors;
}

function validateSummary(instance: Extract<FormInstance, { type: "summary" }>): string[] {
  const errors: string[] = [];
  const data = instance.data;
  validateDate(data.date, "表头", errors);
  data.rows.forEach((row, index) => {
    validateDate(row.date, `第 ${index + 1} 行`, errors);
    validateAmount(row.amount, `第 ${index + 1} 行`, errors);
  });
  const totals = computeSummaryTotals(data);
  if (totals.hasInvalid || totals.total > MAX_AMOUNT_CENTS) {
    errors.push("报销汇总单金额存在非法值或合计超出 9,999,999.99 元");
  }
  return errors;
}

function validatePrivateCar(
  instance: Extract<FormInstance, { type: "private-car" }>,
): string[] {
  const errors: string[] = [];
  const data = instance.data;
  validateDate(data.date, "表头", errors);

  const rate = parseDecimal(data.rate, 2);
  if (rate === null || rate < 0) {
    errors.push("私车公用单价应为非负数字（最多 2 位小数）");
  }

  data.trips.forEach((trip, index) => {
    const label = `第 ${index + 1} 段`;
    validateDate(trip.departDate, `${label}出发`, errors);
    validateDate(trip.arriveDate, `${label}到达`, errors);
    const startEmpty = trip.startOdometer.trim().length === 0;
    const endEmpty = trip.endOdometer.trim().length === 0;
    if (startEmpty !== endEmpty) {
      errors.push(`${label}起始里程与到达里程需同时填写`);
    }

    const start = parseDecimal(trip.startOdometer, 2);
    const end = parseDecimal(trip.endOdometer, 2);
    if (!startEmpty && start === null) {
      errors.push(`${label}起始里程格式无效`);
    }
    if (!endEmpty && end === null) {
      errors.push(`${label}到达里程格式无效`);
    }
    if (
      !startEmpty &&
      !endEmpty &&
      start !== null &&
      end !== null &&
      end < start
    ) {
      errors.push(`${label}到达里程不能小于起始里程`);
    }
  });

  const totals = computePrivateCarTotals(data);
  if (totals.hasInvalid) {
    errors.push("私车公用里程或单价存在非法值");
  }
  return errors;
}

export function validateInstance(instance: FormInstance): string[] {
  let errors: string[];
  switch (instance.type) {
    case "travel":
      errors = validateTravel(instance);
      break;
    case "general":
      errors = validateGeneral(instance);
      break;
    case "summary":
      errors = validateSummary(instance);
      break;
    case "private-car":
      errors = validatePrivateCar(instance);
      break;
  }
  return errors.map((error) => `${instance.title}：${error}`);
}

export function validateInstances(instances: readonly FormInstance[]): string[] {
  return instances.flatMap(validateInstance);
}
