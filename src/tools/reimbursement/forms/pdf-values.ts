import type {
  FormInstance,
  GeneralData,
  PrivateCarData,
  SummaryData,
  TravelData,
} from "../types";
import {
  computeGeneralTotals,
  computePrivateCarTotals,
  computeSummaryTotals,
  computeTravelTotals,
} from "./calculations";
import {
  amountCellText,
  centsToDigits,
  formatCents,
  formatDistance,
  parseAmountToCents,
} from "./money";

export interface DateParts {
  year: string;
  month: string;
  day: string;
}

export function splitIsoDate(iso: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    return null;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year: match[1], month: String(month), day: String(day) };
}

export function isValidIsoDate(iso: string): boolean {
  if (iso.trim().length === 0) {
    return true;
  }
  const parts = splitIsoDate(iso);
  if (!parts) {
    return false;
  }
  const date = new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return (
    date.getFullYear() === Number(parts.year) &&
    date.getMonth() === Number(parts.month) - 1 &&
    date.getDate() === Number(parts.day)
  );
}

export function formatPrivateCarDate(iso: string): string {
  const parts = splitIsoDate(iso);
  if (!parts) {
    return "";
  }
  return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日`;
}

function emptyDateParts(): DateParts {
  return { year: "", month: "", day: "" };
}

function rowAmount(text: string, always = false): string {
  if (always) {
    return formatCents(parseAmountToCents(text) ?? 0);
  }
  return amountCellText(text);
}

function rowAmountDigits(text: string): string[] {
  const cents = parseAmountToCents(text);
  if (cents === null || cents <= 0) {
    return Array.from({ length: 9 }, () => "");
  }
  return centsToDigits(cents);
}

function totalDigits(cents: number): string[] {
  if (cents <= 0) {
    return Array.from({ length: 9 }, () => "");
  }
  return centsToDigits(cents);
}

function travelValues(data: TravelData): Record<string, unknown> {
  const topDate = splitIsoDate(data.date) ?? emptyDateParts();
  const totals = computeTravelTotals(data);

  const rows = data.rows.map((row) => {
    const depart = splitIsoDate(row.departDate) ?? emptyDateParts();
    const arrive = splitIsoDate(row.arriveDate) ?? emptyDateParts();
    return {
      departMonth: depart.month,
      departDay: depart.day,
      departHour: row.departHour.trim(),
      departPlace: row.departPlace.trim(),
      arriveMonth: arrive.month,
      arriveDay: arrive.day,
      arriveHour: row.arriveHour.trim(),
      arrivePlace: row.arrivePlace.trim(),
      trainNo: row.trainNo.trim(),
      headcount: row.headcount.trim(),
      vehicleAmount: rowAmount(row.vehicleAmount),
      travelDays: row.travelDays.trim(),
      travelAmount: rowAmount(row.travelAmount),
      personDays: row.personDays.trim(),
      mealAmount: rowAmount(row.mealAmount),
      roomNights: row.roomNights.trim(),
      lodgingAmount: rowAmount(row.lodgingAmount),
    };
  });

  return {
    number: data.number.trim(),
    dateYear: topDate.year,
    dateMonth: topDate.month,
    dateDay: topDate.day,
    name: data.name.trim(),
    companions: data.companions.trim(),
    project: data.project.trim(),
    totalDays: data.totalDays.trim(),
    rows,
    vehicleSubtotal: formatCents(totals.vehicleSubtotal),
    travelSubtotal: formatCents(totals.travelSubtotal),
    mealSubtotal: formatCents(totals.mealSubtotal),
    lodgingSubtotal: formatCents(totals.lodgingSubtotal),
    extraPublicTransport: rowAmount(data.extras.publicTransport, true),
    extraTaxi: rowAmount(data.extras.taxi, true),
    extraPostage: rowAmount(data.extras.postage, true),
    extraStorage: rowAmount(data.extras.storage, true),
    extraRefundFee: rowAmount(data.extras.refundFee, true),
    extraParking: rowAmount(data.extras.parking, true),
    extraFuel: rowAmount(data.extras.fuel, true),
    extraOther: rowAmount(data.extras.other, true),
    extraTotal: formatCents(totals.extraTotal),
    grandTotal: formatCents(totals.grandTotal),
    uppercase: totals.uppercase,
    prepayment: rowAmount(data.prepayment),
    payable: formatCents(totals.payable),
    attachmentCount: data.attachmentCount.trim(),
  };
}

function generalValues(data: GeneralData): Record<string, unknown> {
  const topDate = splitIsoDate(data.date) ?? emptyDateParts();
  const totals = computeGeneralTotals(data);

  const rows = data.rows.map((row) => {
    const date = splitIsoDate(row.date) ?? emptyDateParts();
    return {
      month: date.month,
      day: date.day,
      description: row.description.trim(),
      receiptCount: row.receiptCount.trim(),
      amountDigits: rowAmountDigits(row.amount),
      note: row.note.trim(),
    };
  });

  return {
    dateYear: topDate.year,
    dateMonth: topDate.month,
    dateDay: topDate.day,
    rows,
    uppercase: totals.uppercase,
    totalDigits: totalDigits(totals.total),
    attachmentCount: data.attachmentCount.trim(),
  };
}

function summaryValues(data: SummaryData): Record<string, unknown> {
  const topDate = splitIsoDate(data.date) ?? emptyDateParts();
  const totals = computeSummaryTotals(data);

  const rows = data.rows.map((row) => {
    const date = splitIsoDate(row.date) ?? emptyDateParts();
    return {
      month: date.month,
      day: date.day,
      project: row.project.trim(),
      amountDigits: rowAmountDigits(row.amount),
      note: row.note.trim(),
    };
  });

  return {
    dateYear: topDate.year,
    dateMonth: topDate.month,
    dateDay: topDate.day,
    rows,
    uppercase: totals.uppercase,
    total: totals.total > 0 ? formatCents(totals.total) : "",
  };
}

function privateCarValues(data: PrivateCarData): Record<string, unknown> {
  const totals = computePrivateCarTotals(data);

  const trips = data.trips.map((trip, index) => {
    const depart = splitIsoDate(trip.departDate) ?? emptyDateParts();
    const arrive = splitIsoDate(trip.arriveDate) ?? emptyDateParts();
    const distance = totals.distances[index];
    return {
      departYear: depart.year,
      departMonth: depart.month,
      departDay: depart.day,
      departPlace: trip.departPlace.trim(),
      arriveYear: arrive.year,
      arriveMonth: arrive.month,
      arriveDay: arrive.day,
      arrivePlace: trip.arrivePlace.trim(),
      startOdometer: trip.startOdometer.trim(),
      endOdometer: trip.endOdometer.trim(),
      distance: distance === null ? "" : formatDistance(distance),
    };
  });

  return {
    dateText: formatPrivateCarDate(data.date),
    user: data.user.trim(),
    plate: data.plate.trim(),
    companions: data.companions.trim(),
    purpose: data.purpose.trim(),
    trips,
    totalDistance:
      totals.totalDistance > 0 ? formatDistance(totals.totalDistance) : "",
    fee: totals.fee > 0 ? totals.fee.toFixed(2) : "",
  };
}

export function buildPdfValues(instance: FormInstance): Record<string, unknown> {
  switch (instance.type) {
    case "travel":
      return travelValues(instance.data);
    case "general":
      return generalValues(instance.data);
    case "summary":
      return summaryValues(instance.data);
    case "private-car":
      return privateCarValues(instance.data);
  }
}

export function collectValueStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectValueStrings(item, output);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      collectValueStrings(item, output);
    }
  }
}
