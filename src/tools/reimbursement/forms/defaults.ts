import {
  FORM_LABELS,
  type ApprovalInfo,
  type FormInstance,
  type FormType,
  type GeneralData,
  type GeneralRow,
  type PrivateCarData,
  type PrivateCarTrip,
  type SummaryData,
  type SummaryRow,
  type TravelData,
  type TravelExtras,
  type TravelRow,
} from "../types";

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `rb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function createApprovals(): ApprovalInfo {
  return {
    reviewer: "",
    finance: "",
    cashier: "",
    supervisor: "",
    reimburser: "",
  };
}

function createTravelRow(): TravelRow {
  return {
    departDate: "",
    departHour: "",
    departPlace: "",
    arriveDate: "",
    arriveHour: "",
    arrivePlace: "",
    trainNo: "",
    headcount: "",
    vehicleAmount: "",
    travelDays: "",
    travelAmount: "",
    personDays: "",
    mealAmount: "",
    roomNights: "",
    lodgingAmount: "",
  };
}

function createTravelExtras(): TravelExtras {
  return {
    publicTransport: "",
    taxi: "",
    postage: "",
    storage: "",
    refundFee: "",
    parking: "",
    fuel: "",
    other: "",
  };
}

export function createTravelData(): TravelData {
  return {
    number: "",
    date: todayIso(),
    name: "",
    companions: "",
    project: "",
    totalDays: "",
    rows: Array.from({ length: 27 }, createTravelRow),
    extras: createTravelExtras(),
    prepayment: "",
    attachmentCount: "",
    approvals: createApprovals(),
  };
}

function createGeneralRow(): GeneralRow {
  return { date: "", description: "", receiptCount: "", amount: "", note: "" };
}

export function createGeneralData(): GeneralData {
  return {
    date: todayIso(),
    rows: Array.from({ length: 19 }, createGeneralRow),
    attachmentCount: "",
    approvals: createApprovals(),
  };
}

function createSummaryRow(): SummaryRow {
  return { date: "", project: "", amount: "", note: "" };
}

export function createSummaryData(): SummaryData {
  return {
    date: todayIso(),
    rows: Array.from({ length: 19 }, createSummaryRow),
    approvals: createApprovals(),
  };
}

function createPrivateCarTrip(): PrivateCarTrip {
  return {
    departDate: "",
    departPlace: "",
    arriveDate: "",
    arrivePlace: "",
    startOdometer: "",
    endOdometer: "",
  };
}

export function createPrivateCarData(): PrivateCarData {
  return {
    date: todayIso(),
    user: "",
    plate: "",
    companions: "",
    purpose: "",
    rate: "1.00",
    trips: Array.from({ length: 10 }, createPrivateCarTrip),
    approvals: createApprovals(),
  };
}

export function createDefaultData(type: FormType): FormInstance["data"] {
  switch (type) {
    case "travel":
      return createTravelData();
    case "general":
      return createGeneralData();
    case "summary":
      return createSummaryData();
    case "private-car":
      return createPrivateCarData();
  }
}

export function createInstance(type: FormType, sequence: number): FormInstance {
  const id = createId();
  const title = `${FORM_LABELS[type]} ${sequence}`;
  switch (type) {
    case "travel":
      return { id, type, title, data: createTravelData() };
    case "general":
      return { id, type, title, data: createGeneralData() };
    case "summary":
      return { id, type, title, data: createSummaryData() };
    case "private-car":
      return { id, type, title, data: createPrivateCarData() };
  }
}

function mergeStrings<T extends object>(defaults: T, raw: unknown): T {
  const record = asRecord(raw);
  const result: Record<string, unknown> = {
    ...(defaults as Record<string, unknown>),
  };
  for (const key of Object.keys(defaults)) {
    const value = record[key];
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result as T;
}

function mergeRows<T extends object>(
  count: number,
  create: () => T,
  raw: unknown,
): T[] {
  const rows = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, index) =>
    mergeStrings(create(), rows[index]),
  );
}

export function normalizeData(type: FormType, raw: unknown): FormInstance["data"] {
  const record = asRecord(raw);
  switch (type) {
    case "travel": {
      const defaults = createTravelData();
      return {
        ...defaults,
        ...mergeStrings(
          {
            number: defaults.number,
            date: defaults.date,
            name: defaults.name,
            companions: defaults.companions,
            project: defaults.project,
            totalDays: defaults.totalDays,
            prepayment: defaults.prepayment,
            attachmentCount: defaults.attachmentCount,
          },
          record,
        ),
        rows: mergeRows(27, createTravelRow, record.rows),
        extras: mergeStrings(createTravelExtras(), record.extras),
        approvals: mergeStrings(createApprovals(), record.approvals),
      };
    }
    case "general": {
      const defaults = createGeneralData();
      return {
        ...defaults,
        ...mergeStrings(
          {
            date: defaults.date,
            attachmentCount: defaults.attachmentCount,
          },
          record,
        ),
        rows: mergeRows(19, createGeneralRow, record.rows),
        approvals: mergeStrings(createApprovals(), record.approvals),
      };
    }
    case "summary": {
      const defaults = createSummaryData();
      return {
        ...defaults,
        ...mergeStrings({ date: defaults.date }, record),
        rows: mergeRows(19, createSummaryRow, record.rows),
        approvals: mergeStrings(createApprovals(), record.approvals),
      };
    }
    case "private-car": {
      const defaults = createPrivateCarData();
      return {
        ...defaults,
        ...mergeStrings(
          {
            date: defaults.date,
            user: defaults.user,
            plate: defaults.plate,
            companions: defaults.companions,
            purpose: defaults.purpose,
            rate: defaults.rate,
          },
          record,
        ),
        trips: mergeRows(10, createPrivateCarTrip, record.trips),
        approvals: mergeStrings(createApprovals(), record.approvals),
      };
    }
  }
}

export function normalizeInstance(raw: unknown): FormInstance | null {
  const record = asRecord(raw);
  const type = record.type;
  if (
    type !== "travel" &&
    type !== "general" &&
    type !== "summary" &&
    type !== "private-car"
  ) {
    return null;
  }

  const id = typeof record.id === "string" && record.id ? record.id : createId();
  const title =
    typeof record.title === "string" && record.title
      ? record.title
      : FORM_LABELS[type];
  const data = normalizeData(type, record.data);

  switch (type) {
    case "travel":
      return { id, type, title, data: data as TravelData };
    case "general":
      return { id, type, title, data: data as GeneralData };
    case "summary":
      return { id, type, title, data: data as SummaryData };
    case "private-car":
      return { id, type, title, data: data as PrivateCarData };
  }
}

export function cloneInstance(
  source: FormInstance,
  sequence: number,
): FormInstance {
  const copy = JSON.parse(JSON.stringify(source)) as FormInstance;
  return {
    ...copy,
    id: createId(),
    title: `${FORM_LABELS[source.type]} ${sequence}`,
  } as FormInstance;
}
