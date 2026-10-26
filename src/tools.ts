import { monthlyReportTool } from "./tools/monthly-report";
import { reimbursementTool } from "./tools/reimbursement";

export interface ToolHandle {
  dispose(): void;
}

export interface Tool {
  /** 唯一标识，后续可作为工具页面的路由键。 */
  id: string;
  /** 显示在侧边栏与页面标题中的名称。 */
  name: string;
  /** 显示在页面标题下方的简要说明。 */
  description: string;
  /** 24x24 线性图标的内部 SVG 标记。 */
  icon: string;
  /** 有实现的工具提供 mount；未实现时显示占位页。 */
  mount?: (container: HTMLElement) => ToolHandle;
}

export const DEFAULT_TOOL_ID = "monthly-report";

export const tools: Tool[] = [
  monthlyReportTool,
  reimbursementTool,
  {
    id: "settings",
    name: "设置",
    description: "调整应用外观与通用偏好。",
    icon: `
      <path d="M4 6h9" />
      <path d="M17 6h3" />
      <path d="M4 12h3" />
      <path d="M11 12h9" />
      <path d="M4 18h7" />
      <path d="M15 18h5" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="13" cy="18" r="2" />
    `,
  },
];
