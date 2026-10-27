export const FORM_TYPES = ["travel", "general", "summary", "private-car"] as const;
export type FormType = (typeof FORM_TYPES)[number];

export const FORM_LABELS: Record<FormType, string> = {
  travel: "差旅报销单",
  general: "报销单",
  summary: "报销汇总单",
  "private-car": "私车公用报销单",
};

/** 签批栏可填写的姓名键；不同模板只使用其中的一部分。 */
export const APPROVAL_KEYS = [
  "reviewer",
  "finance",
  "cashier",
  "supervisor",
  "reimburser",
] as const;

export type ApprovalKey = (typeof APPROVAL_KEYS)[number];

export interface ApprovalInfo {
  reviewer: string;
  finance: string;
  cashier: string;
  supervisor: string;
  reimburser: string;
}

export interface TravelRow {
  departDate: string;
  departHour: string;
  departPlace: string;
  arriveDate: string;
  arriveHour: string;
  arrivePlace: string;
  trainNo: string;
  headcount: string;
  vehicleAmount: string;
  travelDays: string;
  travelAmount: string;
  personDays: string;
  mealAmount: string;
  roomNights: string;
  lodgingAmount: string;
}

export interface TravelExtras {
  publicTransport: string;
  taxi: string;
  postage: string;
  storage: string;
  refundFee: string;
  parking: string;
  fuel: string;
  other: string;
}

export interface TravelData {
  number: string;
  date: string;
  name: string;
  companions: string;
  project: string;
  totalDays: string;
  rows: TravelRow[];
  extras: TravelExtras;
  prepayment: string;
  attachmentCount: string;
  approvals: ApprovalInfo;
}

export interface GeneralRow {
  date: string;
  description: string;
  receiptCount: string;
  amount: string;
  note: string;
}

export interface GeneralData {
  date: string;
  rows: GeneralRow[];
  attachmentCount: string;
  approvals: ApprovalInfo;
}

export interface SummaryRow {
  date: string;
  project: string;
  amount: string;
  note: string;
}

export interface SummaryData {
  date: string;
  rows: SummaryRow[];
  approvals: ApprovalInfo;
}

export interface PrivateCarTrip {
  departDate: string;
  departPlace: string;
  arriveDate: string;
  arrivePlace: string;
  startOdometer: string;
  endOdometer: string;
}

export interface PrivateCarData {
  date: string;
  user: string;
  plate: string;
  companions: string;
  purpose: string;
  rate: string;
  trips: PrivateCarTrip[];
  approvals: ApprovalInfo;
}

export interface TravelInstance {
  id: string;
  type: "travel";
  title: string;
  data: TravelData;
}

export interface GeneralInstance {
  id: string;
  type: "general";
  title: string;
  data: GeneralData;
}

export interface SummaryInstance {
  id: string;
  type: "summary";
  title: string;
  data: SummaryData;
}

export interface PrivateCarInstance {
  id: string;
  type: "private-car";
  title: string;
  data: PrivateCarData;
}

export type FormInstance =
  | TravelInstance
  | GeneralInstance
  | SummaryInstance
  | PrivateCarInstance;

export type NupCount = 1 | 2 | 4;

export interface InvoiceItem {
  id: string;
  name: string;
  path: string;
  bytes: Uint8Array;
  pageCount: number;
  size: number;
}

export type SignatureMime = "image/png" | "image/jpeg";

/** 个人电子签名：以 data URL 保存在本机，不随草稿或导出文件上传。 */
export interface SignatureImage {
  dataUrl: string;
  mime: SignatureMime;
  fileName: string;
  width: number;
  height: number;
}

export interface ReimbursementDraft {
  schemaVersion: 1;
  instances: FormInstance[];
  activeInstanceId: string | null;
  nup: NupCount;
}

export interface PdfField {
  address: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font: string;
  fontSize: number;
  align: "left" | "center" | "right";
  wrap: boolean;
}

/** 签名图片字段：只描述矩形，文字字段继续用 PdfField。 */
export interface PdfImageField {
  address: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: true;
  padding?: number;
}

export type PdfFieldNode =
  | PdfField
  | PdfImageField
  | PdfFieldNode[]
  | { [key: string]: PdfFieldNode };

export interface PdfFormMeta {
  template: string;
  zoom: number;
  pageWidth: number;
  pageHeight: number;
  fields: PdfFieldNode;
}

export type PdfFieldsMeta = Record<FormType, PdfFormMeta>;

export function isPdfField(node: unknown): node is PdfField {
  return (
    typeof node === "object" &&
    node !== null &&
    !("image" in node) &&
    "address" in node &&
    "x" in node &&
    "y" in node &&
    "width" in node &&
    "height" in node
  );
}

export function isPdfImageField(node: unknown): node is PdfImageField {
  return (
    typeof node === "object" &&
    node !== null &&
    "image" in node &&
    node.image === true &&
    "address" in node &&
    "x" in node &&
    "y" in node &&
    "width" in node &&
    "height" in node
  );
}
