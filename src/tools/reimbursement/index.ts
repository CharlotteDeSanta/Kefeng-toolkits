import type { Tool } from "../../tools";
import { mountReimbursement } from "./controller";

export const reimbursementTool: Tool = {
  id: "reimbursement",
  name: "报销单与发票导出",
  description:
    "填写内部报销单、导入 PDF 发票，并合并导出为一个 PDF 文件。",
  icon: `
    <path d="M6 2h9l4 4v16l-3-2-3 2-3-2-3 2V2z" />
    <path d="M9 8h7" />
    <path d="M9 12h7" />
    <path d="M9 16h5" />
  `,
  mount: mountReimbursement,
};
