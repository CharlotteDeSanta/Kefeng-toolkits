import { describe, expect, it } from "vitest";
import { toChineseUppercase } from "./chinese-uppercase";
import {
  centsToDigits,
  formatCents,
  parseAmountToCents,
} from "./money";
import {
  computeGeneralTotals,
  computePrivateCarTotals,
  computeSummaryTotals,
  computeTravelTotals,
} from "./calculations";
import {
  createGeneralData,
  createPrivateCarData,
  createSummaryData,
  createTravelData,
  normalizeInstance,
} from "./defaults";
import {
  buildPdfValues,
  isValidIsoDate,
  splitIsoDate,
} from "./pdf-values";
import { validateInstance } from "./validation";

describe("money", () => {
  it("parses amounts into cents", () => {
    expect(parseAmountToCents("")).toBe(0);
    expect(parseAmountToCents("123.45")).toBe(12345);
    expect(parseAmountToCents("0.05")).toBe(5);
    expect(parseAmountToCents("9,999,999.99")).toBeNull();
    expect(parseAmountToCents("9999999.99")).toBe(999999999);
    expect(parseAmountToCents("10000000")).toBeNull();
    expect(parseAmountToCents("1.234")).toBeNull();
    expect(parseAmountToCents("-1")).toBeNull();
  });

  it("formats cents and nine-digit grids", () => {
    expect(formatCents(12345)).toBe("123.45");
    expect(centsToDigits(12345)).toEqual([
      "0",
      "0",
      "0",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });
});

describe("Chinese uppercase amounts", () => {
  it("handles common financial amounts", () => {
    expect(toChineseUppercase(0)).toBe("零元整");
    expect(toChineseUppercase(100)).toBe("壹元整");
    expect(toChineseUppercase(5)).toBe("零元零伍分");
    expect(toChineseUppercase(50)).toBe("零元伍角整");
    expect(toChineseUppercase(1005)).toBe("壹拾元零伍分");
    expect(toChineseUppercase(10010)).toBe("壹佰元壹角整");
    expect(toChineseUppercase(100100)).toBe("壹仟零壹元整");
    expect(toChineseUppercase(123456)).toBe("壹仟贰佰叁拾肆元伍角陆分");
    expect(toChineseUppercase(1_000_000)).toBe("壹万元整");
    expect(toChineseUppercase(1_000_100)).toBe("壹万零壹元整");
    expect(toChineseUppercase(999_999_999)).toBe(
      "玖佰玖拾玖万玖仟玖佰玖拾玖元玖角玖分",
    );
  });
});

describe("travel calculations", () => {
  it("sums all 27 rows, extras, and payable", () => {
    const data = createTravelData();
    data.rows[0].vehicleAmount = "100.00";
    data.rows[0].travelAmount = "50.00";
    data.rows[26].vehicleAmount = "10.00";
    data.extras.taxi = "20.00";

    const totals = computeTravelTotals(data);
    expect(totals.vehicleSubtotal).toBe(11000);
    expect(totals.travelSubtotal).toBe(5000);
    expect(totals.extraTotal).toBe(2000);
    expect(totals.grandTotal).toBe(18000);
    expect(totals.payable).toBe(18000);
    expect(totals.uppercase).toBe("壹佰捌拾元整");
    expect(totals.hasInvalid).toBe(false);
  });

  it("flags invalid amounts", () => {
    const data = createTravelData();
    data.rows[0].vehicleAmount = "abc";
    expect(computeTravelTotals(data).hasInvalid).toBe(true);
  });
});

describe("general and summary calculations", () => {
  it("sums general rows and produces uppercase", () => {
    const data = createGeneralData();
    data.rows[0].amount = "100.10";
    data.rows[18].amount = "25.00";
    const totals = computeGeneralTotals(data);
    expect(totals.total).toBe(12510);
    expect(totals.uppercase).toBe("壹佰贰拾伍元壹角整");
  });

  it("sums summary rows", () => {
    const data = createSummaryData();
    data.rows[0].amount = "10.00";
    data.rows[1].amount = "20.00";
    expect(computeSummaryTotals(data).total).toBe(3000);
  });
});

describe("private-car calculations", () => {
  it("computes distances and fee with an editable rate", () => {
    const data = createPrivateCarData();
    data.trips[0].startOdometer = "1000";
    data.trips[0].endOdometer = "1234.5";
    data.trips[1].startOdometer = "2000";
    data.trips[1].endOdometer = "2100";
    data.rate = "1.50";

    const totals = computePrivateCarTotals(data);
    expect(totals.distances[0]).toBe(234.5);
    expect(totals.distances[1]).toBe(100);
    expect(totals.totalDistance).toBe(334.5);
    expect(totals.fee).toBe(501.75);
    expect(totals.hasInvalid).toBe(false);
  });

  it("flags a decreasing odometer", () => {
    const data = createPrivateCarData();
    data.trips[0].startOdometer = "100";
    data.trips[0].endOdometer = "50";
    expect(computePrivateCarTotals(data).hasInvalid).toBe(true);
  });

  it("flags a trip with only one odometer filled", () => {
    const data = createPrivateCarData();
    data.trips[0].startOdometer = "100";
    const totals = computePrivateCarTotals(data);
    expect(totals.hasInvalid).toBe(true);
    expect(totals.distances[0]).toBeNull();
    expect(totals.totalDistance).toBe(0);
  });
});

describe("PDF value mapping", () => {
  it("maps travel data to the template field tree", () => {
    const data = createTravelData();
    data.date = "2026-10-21";
    data.name = "曹铮";
    data.rows[0].departDate = "2026-10-01";
    data.rows[0].departHour = "09";
    data.rows[0].departPlace = "无锡";
    data.rows[0].vehicleAmount = "123.45";
    data.extras.taxi = "20";

    const values = buildPdfValues({
      id: "t1",
      type: "travel",
      title: "差旅报销单 1",
      data,
    }) as any;

    expect(values.dateYear).toBe("2026");
    expect(values.dateMonth).toBe("10");
    expect(values.dateDay).toBe("21");
    expect(values.rows[0].departMonth).toBe("10");
    expect(values.rows[0].departDay).toBe("1");
    expect(values.rows[0].departHour).toBe("09");
    expect(values.rows[0].vehicleAmount).toBe("123.45");
    expect(values.extraTaxi).toBe("20.00");
    expect(values.grandTotal).toBe("143.45");
    expect(values.payable).toBe("143.45");
  });

  it("maps general amounts into digit cells", () => {
    const data = createGeneralData();
    data.date = "2026-10-21";
    data.rows[0].date = "2026-10-05";
    data.rows[0].amount = "123.45";
    data.rows[0].description = "办公用品";
    data.attachmentCount = "2";

    const values = buildPdfValues({
      id: "g1",
      type: "general",
      title: "报销单 1",
      data,
    }) as any;

    expect(values.dateYear).toBe("2026");
    expect(values.rows[0].month).toBe("10");
    expect(values.rows[0].day).toBe("5");
    expect(values.rows[0].amountDigits.join("")).toBe("000012345");
    expect(values.totalDigits.join("")).toBe("000012345");
    expect(values.uppercase).toBe("壹佰贰拾叁元肆角伍分");
    expect(values.attachmentCount).toBe("2");
  });

  it("maps private-car dates, distances, and fee", () => {
    const data = createPrivateCarData();
    data.date = "2026-10-21";
    data.trips[0].departDate = "2026-10-01";
    data.trips[0].arriveDate = "2026-10-02";
    data.trips[0].startOdometer = "1000";
    data.trips[0].endOdometer = "1234.5";

    const values = buildPdfValues({
      id: "p1",
      type: "private-car",
      title: "私车公用报销单 1",
      data,
    }) as any;

    expect(values.dateText).toBe("2026 年 10 月 21 日");
    expect(values.trips[0].departMonth).toBe("10");
    expect(values.trips[0].departDay).toBe("1");
    expect(values.trips[0].distance).toBe("234.5");
    expect(values.totalDistance).toBe("234.5");
    expect(values.fee).toBe("234.50");
  });
});

describe("dates and validation", () => {
  it("validates ISO dates", () => {
    expect(isValidIsoDate("2026-10-21")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(splitIsoDate("2026-10-05")).toEqual({
      year: "2026",
      month: "10",
      day: "5",
    });
  });

  it("rejects invalid amounts and times", () => {
    const data = createTravelData();
    data.rows[0].vehicleAmount = "abc";
    data.rows[0].departHour = "24";
    const errors = validateInstance({
      id: "t1",
      type: "travel",
      title: "差旅报销单 1",
      data,
    });
    expect(errors.some((error) => error.includes("金额格式无效"))).toBe(true);
    expect(errors.some((error) => error.includes("00–23"))).toBe(true);
  });

  it("rejects decreasing private-car odometers", () => {
    const data = createPrivateCarData();
    data.trips[0].startOdometer = "100";
    data.trips[0].endOdometer = "50";
    const errors = validateInstance({
      id: "p1",
      type: "private-car",
      title: "私车公用报销单 1",
      data,
    });
    expect(errors.some((error) => error.includes("不能小于"))).toBe(true);
  });

  it("rejects a trip with only one odometer filled", () => {
    const data = createPrivateCarData();
    data.trips[0].endOdometer = "500";
    const errors = validateInstance({
      id: "p2",
      type: "private-car",
      title: "私车公用报销单 1",
      data,
    });
    expect(errors.some((error) => error.includes("需同时填写"))).toBe(true);
  });
});

describe("draft normalization", () => {
  it("pads missing rows and keeps valid values", () => {
    const instance = normalizeInstance({
      id: "g1",
      type: "general",
      title: "报销单 1",
      data: {
        date: "2026-10-21",
        attachmentCount: "3",
        rows: [{ date: "2026-10-01", description: "测试", amount: "12.34" }],
      },
    });

    expect(instance).not.toBeNull();
    if (instance?.type !== "general") {
      throw new Error("expected general");
    }
    expect(instance.data.rows).toHaveLength(19);
    expect(instance.data.rows[0].description).toBe("测试");
    expect(instance.data.rows[0].amount).toBe("12.34");
    expect(instance.data.rows[18].description).toBe("");
    expect(instance.data.attachmentCount).toBe("3");
  });

  it("rejects unknown form types", () => {
    expect(normalizeInstance({ type: "unknown" })).toBeNull();
  });
});
