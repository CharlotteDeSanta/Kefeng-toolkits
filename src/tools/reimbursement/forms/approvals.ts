import type { ApprovalKey, FormType } from "../types";

export interface ApprovalFieldDef {
  key: ApprovalKey;
  label: string;
}

/**
 * 各模板签批栏中需要“打印姓名”的字段。
 * 差旅/汇总的“报销人”格改为签章图片，因此这里不包含 reimburser。
 * 私车公用报销单仍保留“报销人”姓名栏。
 */
export const APPROVAL_TEXT_FIELDS: Record<FormType, readonly ApprovalFieldDef[]> = {
  travel: [
    { key: "reviewer", label: "复核" },
    { key: "cashier", label: "出纳" },
    { key: "supervisor", label: "主管" },
  ],
  general: [
    { key: "supervisor", label: "主管" },
    { key: "reviewer", label: "复核" },
    { key: "cashier", label: "出纳" },
    { key: "reimburser", label: "报销人" },
  ],
  summary: [
    { key: "reviewer", label: "复核" },
    { key: "finance", label: "财务" },
    { key: "cashier", label: "出纳" },
    { key: "supervisor", label: "主管" },
  ],
  "private-car": [
    { key: "reviewer", label: "复核" },
    { key: "cashier", label: "出纳" },
  ],
};

/** 报销人栏使用电子签名的模板。 */
export const SIGNATURE_FORM_TYPES = [
  "travel",
  "general",
  "summary",
  "private-car",
] as const;

export type SignatureFormType = (typeof SIGNATURE_FORM_TYPES)[number];

export function hasSignatureField(type: FormType): boolean {
  return (SIGNATURE_FORM_TYPES as readonly FormType[]).includes(type);
}
