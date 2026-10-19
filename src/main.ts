import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { initSidebarStatus } from "./sidebar-status";
import { DEFAULT_TOOL_ID, tools, type Tool, type ToolHandle } from "./tools";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`应用骨架缺少必要的 DOM 节点: ${selector}`);
  }
  return element;
}

const navEl = requireElement<HTMLElement>("#tool-nav");
const titleEl = requireElement<HTMLElement>("#page-title");
const subtitleEl = requireElement<HTMLElement>("#page-subtitle");
const bodyEl = requireElement<HTMLElement>("#page-body");

let activeToolId = "";
let activeHandle: ToolHandle | null = null;

function createIcon(markup: string, className = "nav-item__icon"): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = className;
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    >${markup}</svg>
  `;
  return icon;
}

function renderNav(): void {
  const fragment = document.createDocumentFragment();

  for (const tool of tools) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "nav-item";
    item.dataset.toolId = tool.id;

    const label = document.createElement("span");
    label.className = "nav-item__label";
    label.textContent = tool.name;

    item.append(createIcon(tool.icon), label);
    item.addEventListener("click", () => selectTool(tool.id));
    fragment.append(item);
  }

  navEl.replaceChildren(fragment);
}

function syncActiveItem(): void {
  for (const item of navEl.querySelectorAll<HTMLButtonElement>(".nav-item")) {
    if (item.dataset.toolId === activeToolId) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  }
}

function renderPlaceholder(tool: Tool): void {
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder";

  const icon = createIcon(tool.icon, "nav-item__icon placeholder__icon");

  const title = document.createElement("p");
  title.className = "placeholder__title";
  title.textContent = `“${tool.name}”页面待实现`;

  const hint = document.createElement("p");
  hint.className = "placeholder__hint";
  hint.textContent =
    "这是工具集骨架的占位内容。新增工具时，在 src/tools.ts 中注册条目，并实现 mount()。";

  placeholder.append(icon, title, hint);
  bodyEl.replaceChildren(placeholder);
}

function selectTool(id: string): void {
  const tool = tools.find((candidate) => candidate.id === id);
  if (!tool || id === activeToolId) {
    return;
  }

  activeHandle?.dispose();
  activeHandle = null;
  activeToolId = tool.id;

  titleEl.textContent = tool.name;
  subtitleEl.textContent = tool.description;
  bodyEl.replaceChildren();
  document.body.dataset.activeTool = tool.id;
  bodyEl.dataset.toolId = tool.id;
  syncActiveItem();

  if (tool.mount) {
    try {
      activeHandle = tool.mount(bodyEl);
    } catch (error) {
      console.error(`工具「${tool.name}」挂载失败`, error);
      renderPlaceholder(tool);
    }
  } else {
    renderPlaceholder(tool);
  }

  document.title = `${tool.name} · KeFeng Toolkits`;
}

function setupTitlebar(): void {
  const titleBar = requireElement<HTMLElement>(".titlebar");
  const minimizeButton = requireElement<HTMLButtonElement>("#window-minimize");
  const maximizeButton = requireElement<HTMLButtonElement>("#window-maximize");
  const closeButton = requireElement<HTMLButtonElement>("#window-close");
  const maximizeIcon = requireElement<Element>('[data-icon="maximize"]');
  const restoreIcon = requireElement<Element>('[data-icon="restore"]');
  const appWindow = isTauri() ? getCurrentWindow() : null;

  const report = (action: string, error: unknown): void => {
    console.error(`窗口操作失败：${action}`, error);
  };

  const syncMaximizedState = async (): Promise<void> => {
    if (!appWindow) {
      return;
    }
    try {
      const maximized = await appWindow.isMaximized();
      maximizeIcon.toggleAttribute("hidden", maximized);
      restoreIcon.toggleAttribute("hidden", !maximized);
      const label = maximized ? "还原" : "最大化";
      maximizeButton.title = label;
      maximizeButton.setAttribute("aria-label", label);
    } catch (error) {
      report("读取最大化状态", error);
    }
  };

  const toggleMaximize = (): void => {
    if (!appWindow) {
      return;
    }
    void appWindow
      .toggleMaximize()
      .then(() => syncMaximizedState())
      .catch((error: unknown) => report("最大化/还原", error));
  };

  minimizeButton.addEventListener("click", () => {
    if (!appWindow) {
      return;
    }
    void appWindow
      .minimize()
      .catch((error: unknown) => report("最小化", error));
  });

  maximizeButton.addEventListener("click", toggleMaximize);

  closeButton.addEventListener("click", () => {
    if (!appWindow) {
      return;
    }
    void appWindow
      .close()
      .catch((error: unknown) => report("关闭窗口", error));
  });

  titleBar.addEventListener("dblclick", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".titlebar__controls")) {
      return;
    }
    toggleMaximize();
  });

  if (appWindow) {
    void syncMaximizedState();
    void appWindow
      .onResized(() => {
        void syncMaximizedState();
      })
      .catch((error: unknown) => report("监听窗口尺寸", error));
  }
}

initSidebarStatus();
setupTitlebar();
renderNav();
selectTool(DEFAULT_TOOL_ID);
