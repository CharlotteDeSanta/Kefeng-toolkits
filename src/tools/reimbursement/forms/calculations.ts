import type {
  FormInstance,
  GeneralData,
  PrivateCarData,
  SummaryData,
  TravelData,
} from "../types";
import { toChineseUppercase } from "./chinese-uppercase";
import {
  MAX_AMOUNT_CENTS,
  formatCents,
  parseAmountToCents,
  parseDecimal,
  sumAmounts,
} from "./money";

export interface TravelTotals {
  vehicleSubtotal: number;
  travelSubtotal: number;
  mealSubtotal: number;
  lodgingSubtotal: number;
  extraTotal: number;
  grandTotal: number;
  payable: number;
  uppercase: string;
  hasInvalid: boolean;
}

export function computeTravelTotals(data: TravelData): TravelTotals {
  const vehicle = sumAmounts(data.rows.map((row) => row.vehicleAmount));
  const travel = sumAmounts(data.rows.map((row) => row.travelAmount));
  const meal = sumAmounts(data.rows.map((row) => row.mealAmount));
  const lodging = sumAmounts(data.rows.map((row) => row.lodgingAmount));
  const extras = sumAmounts(Object.values(data.extras));

  const grandTotal =
    vehicle.cents + travel.cents + meal.cents + lodging.cents + extras.cents;
  const hasInvalid =
    vehicle.hasInvalid ||
    travel.hasInvalid ||
    meal.hasInvalid ||
    lodging.hasInvalid ||
    extras.hasInvalid ||
    grandTotal > MAX_AMOUNT_CENTS;

  return {
    vehicleSubtotal: vehicle.cents,
    travelSubtotal: travel.cents,
    mealSubtotal: meal.cents,
    lodgingSubtotal: lodging.cents,
    extraTotal: extras.cents,
    grandTotal,
    payable: grandTotal,
    uppercase:
      grandTotal > 0 && grandTotal <= MAX_AMOUNT_CENTS
        ? toChineseUppercase(grandTotal)
        : "",
    hasInvalid,
  };
}

export interface AmountTotals {
  total: number;
  uppercase: string;
  hasInvalid: boolean;
}

export function computeGeneralTotals(data: GeneralData): AmountTotals {
  const totals = sumAmounts(data.rows.map((row) => row.amount));
  return {
    total: totals.cents,
    uppercase:
      totals.cents > 0 && totals.cents <= MAX_AMOUNT_CENTS
        ? toChineseUppercase(totals.cents)
        : "",
    hasInvalid: totals.hasInvalid || totals.cents > MAX_AMOUNT_CENTS,
  };
}

export function computeSummaryTotals(data: SummaryData): AmountTotals {
  const totals = sumAmounts(data.rows.map((row) => row.amount));
  return {
    total: totals.cents,
    uppercase:
      totals.cents > 0 && totals.cents <= MAX_AMOUNT_CENTS
        ? toChineseUppercase(totals.cents)
        : "",
    hasInvalid: totals.hasInvalid || totals.cents > MAX_AMOUNT_CENTS,
  };
}

export interface PrivateCarTotals {
  distances: Array<number | null>;
  totalDistance: number;
  fee: number;
  rate: number;
  hasInvalid: boolean;
}

export function computePrivateCarTotals(data: PrivateCarData): PrivateCarTotals {
  let hasInvalid = false;
  let rate = 1;
  const parsedRate = parseDecimal(data.rate, 2);
  if (parsedRate === null || parsedRate < 0) {
    hasInvalid = true;
  } else {
    rate = parsedRate;
  }

  const distances = data.trips.map((trip) => {
    const startEmpty = trip.startOdometer.trim() === "";
    const endEmpty = trip.endOdometer.trim() === "";
    if (startEmpty && endEmpty) {
      return null;
    }
    if (startEmpty !== endEmpty) {
      hasInvalid = true;
      return null;
    }

    const start = parseDecimal(trip.startOdometer, 2);
    const end = parseDecimal(trip.endOdometer, 2);
    if (start === null || end === null) {
      hasInvalid = true;
      return null;
    }
    if (start > end) {
      hasInvalid = true;
      return null;
    }
    return Number((end - start).toFixed(2));
  });

  const totalDistance = distances.reduce<number>(
    (sum, distance) => sum + (distance ?? 0),
    0,
  );
  const fee = Number((totalDistance * rate).toFixed(2));

  return {
    distances,
    totalDistance: Number(totalDistance.toFixed(2)),
    fee,
    rate,
    hasInvalid,
  };
}

export function instanceTotalsText(instance: FormInstance): string {
  switch (instance.type) {
    case "travel": {
      const totals = computeTravelTotals(instance.data);
      return `总计 ¥${formatCents(totals.grandTotal)}`;
    }
    case "general": {
      const totals = computeGeneralTotals(instance.data);
      return `合计 ¥${formatCents(totals.total)}`;
    }
    case "summary": {
      const totals = computeSummaryTotals(instance.data);
      return `合计 ¥${formatCents(totals.total)}`;
    }
    case "private-car": {
      const totals = computePrivateCarTotals(instance.data);
      return `里程 ${totals.totalDistance} km / 费用 ¥${totals.fee.toFixed(2)}`;
    }
  }
}

export { parseAmountToCents };
