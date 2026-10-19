import type { Tool } from "../../tools";
import { mountMonthlyReport } from "./controller";

export const monthlyReportTool: Tool = {
  id: "monthly-report",
  name: "月报统计",
  description:
    "生成 AGV 项目工作月报，自动计算工时、加班与项目出勤，并导出 XLSX。",
  icon: `
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <path d="M3 9h18" />
    <path d="M8 13h3" />
    <path d="M8 17h6" />
  `,
  mount: mountMonthlyReport,
};
