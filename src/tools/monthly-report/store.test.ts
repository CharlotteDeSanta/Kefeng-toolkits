import { describe, expect, it } from "vitest";
import { MonthlyStore } from "./store";
import { MonthlyStorage, STORAGE_KEYS, type KeyValueStore } from "./services/storage";
import { HolidayService, type HolidayFetcher } from "./services/holiday-service";
import type { StoreSnapshot } from "./types";

class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FlakyStorage extends MonthlyStorage {
  failDraft = false;
  failProfile = false;

  override saveDraft(
    period: { year: number; month: number },
    days: Parameters<MonthlyStorage["saveDraft"]>[1],
  ) {
    if (this.failDraft) {
      return { ok: false as const, error: "模拟草稿写入失败" };
    }
    return super.saveDraft(period, days);
  }

  override saveProfile(profile: Parameters<MonthlyStorage["saveProfile"]>[0]) {
    if (this.failProfile) {
      return { ok: false as const, error: "模拟配置写入失败" };
    }
    return super.saveProfile(profile);
  }
}

function createHarness(options?: {
  now?: Date;
  fetcher?: HolidayFetcher;
  storage?: MonthlyStorage;
  kv?: MemoryStore;
}) {
  const kv = options?.kv ?? new MemoryStore();
  const storage = options?.storage ?? new MonthlyStorage(kv);
  const fetcher =
    options?.fetcher ?? (() => Promise.reject(new Error("offline")));
  const holidays = new HolidayService(storage, fetcher);
  const now = options?.now ?? new Date(2026, 8, 19);
  const store = new MonthlyStore({
    storage,
    holidays,
    now: () => now,
  });
  let latest: StoreSnapshot | undefined;
  store.subscribe((event) => {
    latest = event.snapshot;
  });
  return { store, storage, holidays, kv, snapshot: () => latest ?? store.getSnapshot() };
}

function fillGolden(store: MonthlyStore): void {
  store.updateDay("2026-09-01", "location", "调休");

  const rows: Array<[string, string, string, string]> = [
    ["2026-09-02", "09:05", "18:51", "初到国药现场，熟悉项目，测量巷道中点，贴地码"],
    ["2026-09-03", "08:56", "17:33", "继续贴地码，测量货架ab面铅垂线"],
    ["2026-09-04", "09:02", "18:08", "测量货架ab面铅垂线"],
    ["2026-09-05", "09:00", "17:10", "安装STU供电单元，绘制货架仓位码定位线"],
    ["2026-09-07", "08:46", "17:47", "绘制货架仓位码定位线"],
    ["2026-09-08", "09:00", "17:00", ""],
  ];

  for (const [date, startTime, endTime, workContent] of rows) {
    store.updateDay(date, "location", "无锡国药");
    store.updateDay(date, "startTime", startTime);
    store.updateDay(date, "endTime", endTime);
    if (workContent) {
      store.updateDay(date, "workContent", workContent);
    }
  }
}

function delay(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("MonthlyStore", () => {
  it("initializes the current month with built-in holidays", () => {
    const { store, snapshot } = createHarness();
    store.initialize();

    const state = snapshot();
    expect(state.period).toEqual({ year: 2026, month: 9 });
    expect(state.days).toHaveLength(30);
    expect(state.days[0].date).toBe("2026-09-01");
    expect(state.holiday.status).toBe("builtin");
    expect(state.holiday.reliable).toBe(true);
    expect(state.canExport).toBe(true);
    expect(state.years).toContain(2036);
  });

  it("loads the saved profile", () => {
    const kv = new MemoryStore();
    kv.values.set(
      STORAGE_KEYS.profile,
      JSON.stringify({
        schemaVersion: 1,
        employeeName: "曹铮",
        level: "中级工程师",
      }),
    );
    const { store, snapshot } = createHarness({ kv });
    store.initialize();

    expect(snapshot().profile).toEqual({
      employeeName: "曹铮",
      level: "中级工程师",
    });
  });

  it("reproduces the golden totals through the store", () => {
    const { store } = createHarness();
    store.initialize();
    store.updateProfile({ employeeName: "曹铮" });
    fillGolden(store);

    expect(store.getSnapshot().summary).toEqual({
      actualWorkDays: 600,
      projectAttendanceDays: 600,
      totalWorkHours: 5268,
      totalOvertimeHours: 1268,
      accruedRestDays: 158,
      usedRestDays: 100,
    });

    const payload = store.getExportPayload();
    expect(payload.fileName).toBe("AGV月报_曹铮_2026_9.xlsx");
    expect(payload.lines).toHaveLength(40);
    store.dispose();
  });

  it("saves the old month before switching and restores it later", () => {
    const { store, storage } = createHarness();
    store.initialize();
    store.updateDay("2026-09-02", "location", "无锡国药");

    store.switchPeriod({ year: 2026, month: 10 });
    expect(store.getSnapshot().period).toEqual({ year: 2026, month: 10 });
    expect(store.getSnapshot().days).toHaveLength(31);

    const september = storage.loadDraft({ year: 2026, month: 9 });
    expect(september.ok && september.value?.days[1].location).toBe("无锡国药");

    const october = storage.loadDraft({ year: 2026, month: 10 });
    expect(october.ok && october.value).toBeNull();

    store.switchPeriod({ year: 2026, month: 9 });
    expect(store.getSnapshot().days[1].location).toBe("无锡国药");
    expect(store.getSnapshot().notice).toContain("已恢复");
  });

  it("keeps dirty and retries after a failed draft save", () => {
    const storage = new FlakyStorage(new MemoryStore());
    const { store } = createHarness({ storage });
    store.initialize();
    store.updateDay("2026-09-02", "location", "无锡国药");

    storage.failDraft = true;
    store.saveNow(true);
    expect(store.getSnapshot().dirty).toBe(true);
    expect(store.getSnapshot().saveError).toContain("模拟草稿写入失败");
    expect(store.getSnapshot().warningLevel).toBe("critical");

    storage.failDraft = false;
    store.saveNow(true);
    expect(store.getSnapshot().dirty).toBe(false);
    expect(store.getSnapshot().saveError).toBeNull();
  });

  it("keeps an unsaved old month in memory when switching while saves fail", () => {
    const storage = new FlakyStorage(new MemoryStore());
    const { store } = createHarness({ storage });
    store.initialize();
    store.updateDay("2026-09-02", "location", "无锡国药");

    storage.failDraft = true;
    store.switchPeriod({ year: 2026, month: 10 });
    expect(store.getSnapshot().saveError).toContain("模拟草稿写入失败");
    expect(storage.loadDraft({ year: 2026, month: 9 }).ok).toBe(true);
    const september = storage.loadDraft({ year: 2026, month: 9 });
    expect(september.ok && september.value).toBeNull();

    store.switchPeriod({ year: 2026, month: 9 });
    expect(store.getSnapshot().days[1].location).toBe("无锡国药");
    expect(store.getSnapshot().notice).toContain("未保存");
    expect(store.getSnapshot().dirty).toBe(true);

    storage.failDraft = false;
    store.saveNow(true);
    const saved = storage.loadDraft({ year: 2026, month: 9 });
    expect(saved.ok && saved.value?.days[1].location).toBe("无锡国药");
    expect(store.getSnapshot().dirty).toBe(false);
  });

  it("clears the month and recomputes empty summaries", () => {
    const { store } = createHarness();
    store.initialize();
    fillGolden(store);
    store.clearMonth();

    const state = store.getSnapshot();
    expect(state.days.every((day) => day.location === "")).toBe(true);
    expect(state.summary.totalWorkHours).toBe(0);
    expect(state.locations).toEqual([]);
    expect(state.dirty).toBe(true);
  });

  it("disables export when holiday data is unavailable", async () => {
    const { store } = createHarness({
      now: new Date(2027, 0, 10),
      fetcher: () => Promise.reject(new Error("offline")),
    });
    store.initialize();
    expect(store.getSnapshot().holiday.loading).toBe(true);
    expect(store.getSnapshot().canExport).toBe(false);

    await delay();

    const state = store.getSnapshot();
    expect(state.holiday.status).toBe("unavailable");
    expect(state.holiday.reliable).toBe(false);
    expect(state.warningLevel).toBe("critical");
    expect(state.canExport).toBe(false);
  });

  it("uses a cached holiday year when the network fails", async () => {
    const kv = new MemoryStore();
    const storage = new MonthlyStorage(kv);
    storage.saveHolidayCache(2027, {
      holidays: ["2027-01-01"],
      workdays: [],
    });

    const { store } = createHarness({
      storage,
      now: new Date(2027, 0, 10),
      fetcher: () => Promise.reject(new Error("offline")),
    });
    store.initialize();
    await delay();

    const state = store.getSnapshot();
    expect(state.holiday.status).toBe("cache");
    expect(state.holiday.reliable).toBe(true);
    expect(state.canExport).toBe(true);
  });

  it("saves profile changes immediately on saveNow", () => {
    const { store, storage } = createHarness();
    store.initialize();
    store.updateProfile({ employeeName: "曹铮", level: "高级工程师" });
    store.saveNow(true);

    expect(storage.loadProfile()).toEqual({
      ok: true,
      value: { employeeName: "曹铮", level: "高级工程师" },
    });
    store.dispose();
  });
});
