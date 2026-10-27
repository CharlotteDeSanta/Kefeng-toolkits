import {
  FORM_LABELS,
  FORM_TYPES,
  type FormInstance,
  type FormType,
  type InvoiceItem,
  type NupCount,
  type SignatureImage,
} from "./types";
import {
  APPROVAL_TEXT_FIELDS,
  hasSignatureField,
} from "./forms/approvals";
import {
  computeGeneralTotals,
  computePrivateCarTotals,
  computeSummaryTotals,
  computeTravelTotals,
} from "./forms/calculations";
import { formatCents } from "./forms/money";
import { nupSheetCount, totalInvoicePages } from "./services/invoices";
import "./styles.css";

export type StatusLevel = "info" | "success" | "error" | "warning";

export interface ReimbursementViewState {
  instances: readonly FormInstance[];
  activeInstanceId: string | null;
  nup: NupCount;
  invoices: readonly InvoiceItem[];
  signature: SignatureImage | null;
}

export interface ReimbursementViewHandlers {
  onAdd(type: FormType): void;
  onSelect(id: string): void;
  onDuplicate(): void;
  onDelete(): void;
  onMove(direction: -1 | 1): void;
  onFieldChange(
    instanceId: string,
    rowIndex: number | null,
    field: string,
    value: string,
  ): void;
  onImportInvoices(): void;
  onChooseSignature(): void;
  onClearSignature(): void;
  onRemoveInvoice(id: string): void;
  onMoveInvoice(id: string, direction: -1 | 1): void;
  onNupChange(nup: NupCount): void;
  onExport(): void;
  onReveal(path: string): void;
}

export interface ReimbursementView {
  render(state: ReimbursementViewState): void;
  updateSummary(instance: FormInstance): void;
  updatePrivateCarDistance(rowIndex: number, value: string): void;
  setStatus(text: string, level: StatusLevel, revealPath?: string): void;
  setBusy(busy: boolean, text?: string, busyLabel?: string): void;
  dispose(): void;
}

interface ColumnDef {
  field: string;
  label: string;
  kind: "text" | "date" | "amount" | "number";
  width?: string;
}

const TRAVEL_COLUMNS: ColumnDef[] = [
  { field: "departDate", label: "出发日期", kind: "date", width: "132px" },
  { field: "departHour", label: "时", kind: "number", width: "48px" },
  { field: "departPlace", label: "出发地点", kind: "text", width: "110px" },
  { field: "arriveDate", label: "到达日期", kind: "date", width: "132px" },
  { field: "arriveHour", label: "时", kind: "number", width: "48px" },
  { field: "arrivePlace", label: "到达地点", kind: "text", width: "110px" },
  { field: "trainNo", label: "车次", kind: "text", width: "76px" },
  { field: "headcount", label: "人数", kind: "number", width: "58px" },
  { field: "vehicleAmount", label: "车船费", kind: "amount", width: "84px" },
  { field: "travelDays", label: "差旅天数", kind: "number", width: "70px" },
  { field: "travelAmount", label: "差旅补贴", kind: "amount", width: "84px" },
  { field: "personDays", label: "伙食人天", kind: "number", width: "70px" },
  { field: "mealAmount", label: "伙食补贴", kind: "amount", width: "84px" },
  { field: "roomNights", label: "住宿间夜", kind: "number", width: "70px" },
  { field: "lodgingAmount", label: "住宿费", kind: "amount", width: "84px" },
];

const GENERAL_COLUMNS: ColumnDef[] = [
  { field: "date", label: "日期", kind: "date", width: "132px" },
  { field: "description", label: "报销内容", kind: "text", width: "320px" },
  { field: "receiptCount", label: "单据张数", kind: "number", width: "80px" },
  { field: "amount", label: "金额", kind: "amount", width: "110px" },
  { field: "note", label: "备注", kind: "text", width: "180px" },
];

const SUMMARY_COLUMNS: ColumnDef[] = [
  { field: "date", label: "日期", kind: "date", width: "132px" },
  { field: "project", label: "所属项目", kind: "text", width: "320px" },
  { field: "amount", label: "金额", kind: "amount", width: "110px" },
  { field: "note", label: "备注", kind: "text", width: "180px" },
];

const PRIVATE_CAR_COLUMNS: ColumnDef[] = [
  { field: "departDate", label: "出发日期", kind: "date", width: "132px" },
  { field: "departPlace", label: "出发地点", kind: "text", width: "150px" },
  { field: "arriveDate", label: "到达日期", kind: "date", width: "132px" },
  { field: "arrivePlace", label: "到达地点", kind: "text", width: "150px" },
  { field: "startOdometer", label: "起始里程", kind: "amount", width: "100px" },
  { field: "endOdometer", label: "到达里程", kind: "amount", width: "100px" },
];

const TRAVEL_EXTRAS: Array<{ field: string; label: string }> = [
  { field: "extras.publicTransport", label: "公共交通费" },
  { field: "extras.taxi", label: "出租车费" },
  { field: "extras.postage", label: "邮电费" },
  { field: "extras.storage", label: "寄存费" },
  { field: "extras.refundFee", label: "退票费" },
  { field: "extras.parking", label: "停车费" },
  { field: "extras.fuel", label: "燃油费" },
  { field: "extras.other", label: "其他费用" },
];

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function button(label: string, className = "rb-button"): HTMLButtonElement {
  const node = element("button", className, label);
  node.type = "button";
  return node;
}

function createInput(
  field: string,
  value: string,
  kind: ColumnDef["kind"],
  rowIndex: number | null,
): HTMLInputElement {
  const input = element("input", "rb-input");
  input.type = kind === "date" ? "date" : "text";
  if (kind === "amount" || kind === "number") {
    input.inputMode = "decimal";
  }
  input.value = value;
  input.dataset.field = field;
  if (rowIndex !== null) {
    input.dataset.row = String(rowIndex);
  }
  if (kind === "amount") {
    input.classList.add("rb-input--amount");
  }
  return input;
}

export function createReimbursementView(
  container: HTMLElement,
  handlers: ReimbursementViewHandlers,
): ReimbursementView {
  container.replaceChildren();
  const root = element("section", "reimbursement rb");
  const abort = new AbortController();
  const signal = abort.signal;
  let activeInstanceId: string | null = null;
  let busy = false;

  const toolbar = element("div", "rb-toolbar");
  const addGroup = element("div", "rb-add");
  const addSelect = element("select", "rb-select");
  addSelect.dataset.role = "add-type";
  for (const type of FORM_TYPES) {
    const option = element("option", undefined, `添加${FORM_LABELS[type]}`);
    option.value = type;
    addSelect.append(option);
  }
  const addButton = button("添加单据", "rb-button rb-button--primary");
  addButton.dataset.role = "add";
  addGroup.append(addSelect, addButton);

  const tabs = element("div", "rb-tabs");
  tabs.dataset.role = "tabs";

  const actions = element("div", "rb-actions");
  const duplicateButton = button("复制");
  duplicateButton.dataset.role = "duplicate";
  const moveLeftButton = button("←");
  moveLeftButton.dataset.role = "move-left";
  moveLeftButton.title = "上移";
  const moveRightButton = button("→");
  moveRightButton.dataset.role = "move-right";
  moveRightButton.title = "下移";
  const deleteButton = button("删除", "rb-button rb-button--danger");
  deleteButton.dataset.role = "delete";
  const exportButton = button("导出 PDF", "rb-button rb-button--primary");
  exportButton.dataset.role = "export";
  actions.append(
    duplicateButton,
    moveLeftButton,
    moveRightButton,
    deleteButton,
    exportButton,
  );

  toolbar.append(addGroup, tabs, actions);

  const editor = element("div", "rb-editor");
  editor.dataset.role = "editor";

  const invoicePanel = element("div", "rb-invoices");
  const invoiceHeader = element("div", "rb-invoices__header");
  const importButton = button("导入发票 PDF");
  importButton.dataset.role = "import";
  const nupLabel = element("label", "rb-inline-field");
  nupLabel.append(element("span", undefined, "每页发票"));
  const nupSelect = element("select", "rb-select rb-select--small");
  nupSelect.dataset.role = "nup";
  for (const value of [1, 2, 4] as const) {
    const option = element("option", undefined, `${value} 张`);
    option.value = String(value);
    nupSelect.append(option);
  }
  nupLabel.append(nupSelect);
  const invoiceSummary = element("span", "rb-invoice-summary");
  invoiceSummary.dataset.role = "invoice-summary";
  invoiceHeader.append(importButton, nupLabel, invoiceSummary);

  const invoiceList = element("div", "rb-invoices__list");
  invoiceList.dataset.role = "invoice-list";
  invoicePanel.append(invoiceHeader, invoiceList);

  const status = element("div", "rb-status");
  status.dataset.role = "status";
  status.setAttribute("aria-live", "polite");

  root.append(toolbar, editor, invoicePanel, status);
  container.append(root);

  // ---------- 静态事件 ----------
  addButton.addEventListener("click", () => {
    if (busy) return;
    handlers.onAdd(addSelect.value as FormType);
  }, { signal });

  tabs.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const tab = target.closest<HTMLButtonElement>("[data-instance-id]");
    if (tab?.dataset.instanceId) {
      handlers.onSelect(tab.dataset.instanceId);
    }
  }, { signal });

  duplicateButton.addEventListener("click", () => handlers.onDuplicate(), { signal });
  deleteButton.addEventListener("click", () => handlers.onDelete(), { signal });
  moveLeftButton.addEventListener("click", () => handlers.onMove(-1), { signal });
  moveRightButton.addEventListener("click", () => handlers.onMove(1), { signal });
  exportButton.addEventListener("click", () => handlers.onExport(), { signal });

  importButton.addEventListener("click", () => handlers.onImportInvoices(), { signal });
  nupSelect.addEventListener("change", () => {
    const value = Number(nupSelect.value);
    if (value === 1 || value === 2 || value === 4) {
      handlers.onNupChange(value);
    }
  }, { signal });

  invoiceList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const actionButton = target.closest<HTMLButtonElement>("[data-invoice-action]");
    const id = actionButton?.dataset.invoiceId;
    if (!actionButton || !id) return;

    switch (actionButton.dataset.invoiceAction) {
      case "remove":
        handlers.onRemoveInvoice(id);
        break;
      case "up":
        handlers.onMoveInvoice(id, -1);
        break;
      case "down":
        handlers.onMoveInvoice(id, 1);
        break;
    }
  }, { signal });

  editor.addEventListener("input", (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement)
    ) {
      return;
    }
    const field = target.dataset.field;
    const row = target.closest<HTMLTableRowElement>("tr[data-row]");
    if (!field || !activeInstanceId) return;
    handlers.onFieldChange(
      activeInstanceId,
      row?.dataset.row ? Number(row.dataset.row) : null,
      field,
      target.value,
    );
  }, { signal });

  // ---------- 渲染 ----------

  function renderTabs(state: ReimbursementViewState): void {
    tabs.replaceChildren();
    for (const instance of state.instances) {
      const tab = button(instance.title, "rb-tab");
      tab.dataset.instanceId = instance.id;
      if (instance.id === state.activeInstanceId) {
        tab.classList.add("is-active");
      }
      tabs.append(tab);
    }

    const hasActive = Boolean(state.activeInstanceId);
    duplicateButton.disabled = !hasActive || busy;
    deleteButton.disabled = !hasActive || busy;
    moveLeftButton.disabled = !hasActive || busy;
    moveRightButton.disabled = !hasActive || busy;
    exportButton.disabled =
      busy || (state.instances.length === 0 && state.invoices.length === 0);
  }

  function fieldRow(
    label: string,
    control: HTMLInputElement | HTMLSelectElement,
  ): HTMLElement {
    const wrapper = element("label", "rb-field");
    wrapper.append(element("span", "rb-field__label", label), control);
    return wrapper;
  }

  function renderHeader(instance: FormInstance): HTMLElement {
    const wrapper = element("div", "rb-fields");

    switch (instance.type) {
      case "travel":
        wrapper.append(
          fieldRow("编号", createInput("number", instance.data.number, "text", null)),
          fieldRow("日期", createInput("date", instance.data.date, "date", null)),
          fieldRow("姓名", createInput("name", instance.data.name, "text", null)),
          fieldRow(
            "同行人数",
            createInput("companions", instance.data.companions, "number", null),
          ),
          fieldRow("项目名", createInput("project", instance.data.project, "text", null)),
          fieldRow(
            "往返总天数",
            createInput("totalDays", instance.data.totalDays, "number", null),
          ),
        );
        break;
      case "general":
        wrapper.append(
          fieldRow("日期", createInput("date", instance.data.date, "date", null)),
        );
        break;
      case "summary":
        wrapper.append(
          fieldRow("日期", createInput("date", instance.data.date, "date", null)),
        );
        break;
      case "private-car":
        wrapper.append(
          fieldRow("日期", createInput("date", instance.data.date, "date", null)),
          fieldRow("用车人", createInput("user", instance.data.user, "text", null)),
          fieldRow("车牌号", createInput("plate", instance.data.plate, "text", null)),
          fieldRow(
            "同行人数",
            createInput("companions", instance.data.companions, "number", null),
          ),
          fieldRow("单价(元/公里)", createInput("rate", instance.data.rate, "amount", null)),
          fieldRow("用车事由", createInput("purpose", instance.data.purpose, "text", null)),
        );
        break;
    }

    return wrapper;
  }

  function renderTable(instance: FormInstance): HTMLElement {
    const wrap = element("div", "rb-table-wrap");
    const table = element("table", "rb-table");
    const thead = element("thead");
    const headRow = element("tr");
    headRow.append(element("th", "rb-th-index", "序号"));

    let columns: ColumnDef[];
    let rows: Array<Record<string, string>>;
    let showDistance = false;

    switch (instance.type) {
      case "travel":
        columns = TRAVEL_COLUMNS;
        rows = instance.data.rows as unknown as Array<Record<string, string>>;
        break;
      case "general":
        columns = GENERAL_COLUMNS;
        rows = instance.data.rows as unknown as Array<Record<string, string>>;
        break;
      case "summary":
        columns = SUMMARY_COLUMNS;
        rows = instance.data.rows as unknown as Array<Record<string, string>>;
        break;
      case "private-car":
        columns = PRIVATE_CAR_COLUMNS;
        rows = instance.data.trips as unknown as Array<Record<string, string>>;
        showDistance = true;
        break;
    }

    for (const column of columns) {
      const th = element("th", undefined, column.label);
      if (column.width) {
        th.style.width = column.width;
      }
      headRow.append(th);
    }
    if (showDistance) {
      headRow.append(element("th", undefined, "小计里程"));
    }
    thead.append(headRow);

    const tbody = element("tbody");
    rows.forEach((row, rowIndex) => {
      const tr = element("tr");
      tr.dataset.row = String(rowIndex);
      tr.append(element("td", "rb-td-index", String(rowIndex + 1)));

      for (const column of columns) {
        const td = element("td");
        td.append(
          createInput(column.field, row[column.field] ?? "", column.kind, rowIndex),
        );
        tr.append(td);
      }

      if (showDistance) {
        const td = element("td", "rb-distance");
        td.dataset.distanceRow = String(rowIndex);
        td.textContent = "";
        tr.append(td);
      }
      tbody.append(tr);
    });

    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
  }

  function summaryValue(label: string, role: string): HTMLElement {
    const row = element("div", "rb-summary-row");
    const value = element("span", "rb-summary-value");
    value.dataset.summary = role;
    value.textContent = "0.00";
    row.append(element("span", "rb-summary-label", label), value);
    return row;
  }

  function renderTravelSummary(data: Extract<FormInstance, { type: "travel" }>["data"]): HTMLElement {
    const wrapper = element("div", "rb-summary");
    const left = element("section", "rb-panel");
    left.append(element("h3", "rb-panel__title", "费用汇总"));
    left.append(
      summaryValue("车船费", "subtotal-vehicle"),
      summaryValue("差旅补贴", "subtotal-travel"),
      summaryValue("伙食补贴", "subtotal-meal"),
      summaryValue("住宿费", "subtotal-lodging"),
      summaryValue("其他费用合计", "extra-total"),
      summaryValue("共计金额", "grand-total"),
      summaryValue("应付金额", "payable"),
    );
    const uppercaseRow = element("div", "rb-summary-row rb-summary-row--wide");
    const uppercase = element("span", "rb-summary-uppercase");
    uppercase.dataset.summary = "uppercase";
    uppercaseRow.append(element("span", "rb-summary-label", "大写"), uppercase);
    left.append(uppercaseRow);

    const right = element("section", "rb-panel");
    right.append(element("h3", "rb-panel__title", "其他费用与附件"));
    const extras = element("div", "rb-extras");
    for (const extra of TRAVEL_EXTRAS) {
      const input = createInput(extra.field, (data.extras as unknown as Record<string, string>)[extra.field.replace("extras.", "")] ?? "", "amount", null);
      extras.append(fieldRow(extra.label, input));
    }
    right.append(extras);
    const footer = element("div", "rb-fields rb-fields--compact");
    footer.append(
      fieldRow("预支金额", createInput("prepayment", data.prepayment, "amount", null)),
      fieldRow("附单据张数", createInput("attachmentCount", data.attachmentCount, "number", null)),
    );
    right.append(footer);

    wrapper.append(left, right);
    return wrapper;
  }

  function renderSimpleSummary(instance: FormInstance): HTMLElement {
    const wrapper = element("div", "rb-summary");
    const panel = element("section", "rb-panel");
    panel.append(element("h3", "rb-panel__title", "合计"));

    if (instance.type === "general" || instance.type === "summary") {
      panel.append(summaryValue("合计金额", "total"));
      const uppercaseRow = element("div", "rb-summary-row rb-summary-row--wide");
      const uppercase = element("span", "rb-summary-uppercase");
      uppercase.dataset.summary = "uppercase";
      uppercaseRow.append(element("span", "rb-summary-label", "大写"), uppercase);
      panel.append(uppercaseRow);
      if (instance.type === "general") {
        panel.append(
          fieldRow(
            "附件张数",
            createInput("attachmentCount", instance.data.attachmentCount, "number", null),
          ),
        );
      }
    } else {
      panel.append(
        summaryValue("总行驶里程", "distance"),
        summaryValue("费用", "fee"),
      );
    }

    wrapper.append(panel);
    return wrapper;
  }

  function renderSignature(signature: SignatureImage | null): HTMLElement {
    const wrapper = element("div", "rb-signature");
    wrapper.append(element("span", "rb-signature__title", "报销人签名"));

    const preview = element("div", "rb-signature__preview");
    if (signature) {
      const image = element("img");
      image.src = signature.dataUrl;
      image.alt = "电子签名";
      preview.append(image);
    } else {
      preview.append(element("span", "rb-signature__empty", "未设置签名"));
    }

    const actions = element("div", "rb-signature__actions");
    const pickButton = button(signature ? "更换图片" : "选择图片");
    pickButton.dataset.signatureAction = "pick";
    pickButton.disabled = busy;
    pickButton.addEventListener(
      "click",
      () => {
        if (!busy) {
          handlers.onChooseSignature();
        }
      },
      { signal },
    );
    actions.append(pickButton);

    if (signature) {
      const clearButton = button("清除", "rb-button rb-button--danger");
      clearButton.dataset.signatureAction = "clear";
      clearButton.disabled = busy;
      clearButton.addEventListener(
        "click",
        () => {
          if (!busy) {
            handlers.onClearSignature();
          }
        },
        { signal },
      );
      actions.append(clearButton);
    }

    wrapper.append(
      preview,
      actions,
      element(
        "p",
        "rb-signature__hint",
        "支持 JPG/PNG，仅保存在本机；导出时放入模板的报销人签名格。",
      ),
    );
    return wrapper;
  }

  function renderApprovals(
    instance: FormInstance,
    signature: SignatureImage | null,
  ): HTMLElement {
    const panel = element("section", "rb-panel rb-approvals");
    panel.append(element("h3", "rb-panel__title", "签批信息"));

    const fields = element("div", "rb-fields rb-fields--approvals");
    for (const field of APPROVAL_TEXT_FIELDS[instance.type]) {
      fields.append(
        fieldRow(
          field.label,
          createInput(
            `approvals.${field.key}`,
            instance.data.approvals[field.key],
            "text",
            null,
          ),
        ),
      );
    }
    if (fields.childElementCount > 0) {
      panel.append(fields);
    }

    if (hasSignatureField(instance.type)) {
      panel.append(renderSignature(signature));
    }
    return panel;
  }

  function renderEditor(
    instance: FormInstance | null,
    signature: SignatureImage | null,
  ): void {
    editor.replaceChildren();
    activeInstanceId = instance?.id ?? null;

    if (!instance) {
      const empty = element("div", "rb-empty");
      empty.append(
        element("h2", undefined, "尚未添加报销单"),
        element(
          "p",
          undefined,
          "通过上方「添加单据」选择表单类型；可添加任意数量的报销单实例。",
        ),
      );
      editor.append(empty);
      return;
    }

    const form = element("div", "rb-form");
    const head = element("div", "rb-form__head");
    head.append(
      element("h2", "rb-form__title", instance.title),
      element("span", "rb-badge", FORM_LABELS[instance.type]),
    );
    form.append(head, renderHeader(instance), renderTable(instance));
    form.append(
      instance.type === "travel"
        ? renderTravelSummary(instance.data)
        : renderSimpleSummary(instance),
    );
    form.append(renderApprovals(instance, signature));
    editor.append(form);

    updateSummary(instance);
    if (instance.type === "private-car") {
      const totals = computePrivateCarTotals(instance.data);
      totals.distances.forEach((distance, index) => {
        updatePrivateCarDistanceValue(index, distance === null ? "" : String(distance));
      });
    }
  }

  function updateSummary(instance: FormInstance): void {
    if (!activeInstanceId || instance.id !== activeInstanceId) {
      return;
    }
    const set = (role: string, value: string): void => {
      const node = editor.querySelector<HTMLElement>(
        `[data-summary="${role}"]`,
      );
      if (node) {
        node.textContent = value;
      }
    };

    switch (instance.type) {
      case "travel": {
        const totals = computeTravelTotals(instance.data);
        set("subtotal-vehicle", formatCents(totals.vehicleSubtotal));
        set("subtotal-travel", formatCents(totals.travelSubtotal));
        set("subtotal-meal", formatCents(totals.mealSubtotal));
        set("subtotal-lodging", formatCents(totals.lodgingSubtotal));
        set("extra-total", formatCents(totals.extraTotal));
        set("grand-total", formatCents(totals.grandTotal));
        set("payable", formatCents(totals.payable));
        set("uppercase", totals.uppercase || "—");
        break;
      }
      case "general": {
        const totals = computeGeneralTotals(instance.data);
        set("total", formatCents(totals.total));
        set("uppercase", totals.uppercase || "—");
        break;
      }
      case "summary": {
        const totals = computeSummaryTotals(instance.data);
        set("total", formatCents(totals.total));
        set("uppercase", totals.uppercase || "—");
        break;
      }
      case "private-car": {
        const totals = computePrivateCarTotals(instance.data);
        set("distance", `${totals.totalDistance} km`);
        set("fee", `¥${totals.fee.toFixed(2)}`);
        totals.distances.forEach((distance, index) => {
          updatePrivateCarDistanceValue(
            index,
            distance === null ? "" : String(distance),
          );
        });
        break;
      }
    }
  }

  function updatePrivateCarDistanceValue(rowIndex: number, value: string): void {
    const node = editor.querySelector<HTMLElement>(
      `[data-distance-row="${rowIndex}"]`,
    );
    if (node) {
      node.textContent = value;
    }
  }

  function renderInvoices(state: ReimbursementViewState): void {
    nupSelect.value = String(state.nup);
    const pages = totalInvoicePages(state.invoices);
    const sheets = nupSheetCount(state.invoices, state.nup);
    invoiceSummary.textContent =
      state.invoices.length === 0
        ? "尚未导入发票"
        : `${state.invoices.length} 个文件 / ${pages} 页，排版后 ${sheets} 页`;

    invoiceList.replaceChildren();
    state.invoices.forEach((invoice, index) => {
      const row = element("div", "rb-invoice");
      const info = element("div", "rb-invoice__info");
      info.append(
        element("span", "rb-invoice__name", invoice.name),
        element(
          "span",
          "rb-invoice__meta",
          `${invoice.pageCount} 页 · ${(invoice.size / 1024).toFixed(1)} KB`,
        ),
      );
      const actions = element("div", "rb-invoice__actions");
      const up = button("↑", "rb-icon-button");
      up.dataset.invoiceAction = "up";
      up.dataset.invoiceId = invoice.id;
      up.disabled = index === 0 || busy;
      const down = button("↓", "rb-icon-button");
      down.dataset.invoiceAction = "down";
      down.dataset.invoiceId = invoice.id;
      down.disabled = index === state.invoices.length - 1 || busy;
      const remove = button("移除", "rb-icon-button rb-icon-button--danger");
      remove.dataset.invoiceAction = "remove";
      remove.dataset.invoiceId = invoice.id;
      remove.disabled = busy;
      actions.append(up, down, remove);
      row.append(info, actions);
      invoiceList.append(row);
    });
  }

  function render(state: ReimbursementViewState): void {
    renderTabs(state);
    const active =
      state.instances.find((item) => item.id === state.activeInstanceId) ??
      null;
    renderEditor(active, state.signature);
    renderInvoices(state);
    if (!busy) {
      exportButton.disabled =
        state.instances.length === 0 && state.invoices.length === 0;
    }
  }

  return {
    render,
    updateSummary,
    updatePrivateCarDistance(rowIndex, value) {
      updatePrivateCarDistanceValue(rowIndex, value);
    },
    setStatus(text, level, revealPath) {
      status.replaceChildren();
      status.className = `rb-status rb-status--${level}`;
      status.append(element("span", undefined, text));
      if (revealPath) {
        const reveal = button("在文件夹中显示", "rb-link-button");
        reveal.addEventListener("click", () => handlers.onReveal(revealPath), {
          signal,
        });
        status.append(reveal);
      }
    },
    setBusy(nextBusy, text = "", busyLabel = "正在导出…") {
      busy = nextBusy;
      root.classList.toggle("is-busy", busy);
      exportButton.disabled = busy;
      importButton.disabled = busy;
      nupSelect.disabled = busy;
      addButton.disabled = busy;
      duplicateButton.disabled = busy || !activeInstanceId;
      deleteButton.disabled = busy || !activeInstanceId;
      moveLeftButton.disabled = busy || !activeInstanceId;
      moveRightButton.disabled = busy || !activeInstanceId;
      for (const node of root.querySelectorAll<HTMLButtonElement>(
        "[data-signature-action]",
      )) {
        node.disabled = busy;
      }
      exportButton.textContent = busy ? busyLabel : "导出 PDF";
      if (text) {
        this.setStatus(text, "info");
      }
    },
    dispose() {
      abort.abort();
      root.remove();
    },
  };
}
