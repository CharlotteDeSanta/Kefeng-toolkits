import { describe, expect, it } from "vitest";
import type { DayRecord } from "../types";
import {
  MonthlyStorage,
  STORAGE_KEYS,
  type KeyValueStore,
} from "./storage";

class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error("quota exceeded");
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function days(count: number): DayRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    location: "",
    workContent: "",
    startTime: "",
    endTime: "",
  }));
}

describe("MonthlyStorage", () => {
  it("round-trips profile", () => {
    const kv = new MemoryStore();
    const storage = new MonthlyStorage(kv);

    expect(storage.saveProfile({ employeeName: "曹铮", level: "新进工程师" }).ok).toBe(true);
    expect(storage.loadProfile()).toEqual({
      ok: true,
      value: { employeeName: "曹铮", level: "新进工程师" },
    });
    expect(kv.values.has(STORAGE_KEYS.profile)).toBe(true);
  });

  it("returns null for a missing draft and validates stored drafts", () => {
    const kv = new MemoryStore();
    const storage = new MonthlyStorage(kv);
    const period = { year: 2026, month: 9 };

    expect(storage.loadDraft(period)).toEqual({ ok: true, value: null });

    expect(storage.saveDraft(period, days(30)).ok).toBe(true);
    const loaded = storage.loadDraft(period);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value?.days).toHaveLength(30);
      expect(loaded.value?.year).toBe(2026);
      expect(loaded.value?.month).toBe(9);
    }
  });

  it("rejects wrong month, wrong day count, and corrupt JSON", () => {
    const kv = new MemoryStore();
    const storage = new MonthlyStorage(kv);
    const period = { year: 2026, month: 9 };

    kv.values.set(
      STORAGE_KEYS.draft(period),
      JSON.stringify({ schemaVersion: 1, year: 2026, month: 8, days: days(30) }),
    );
    expect(storage.loadDraft(period).ok).toBe(false);

    kv.values.set(
      STORAGE_KEYS.draft(period),
      JSON.stringify({ schemaVersion: 1, year: 2026, month: 9, days: days(29) }),
    );
    expect(storage.loadDraft(period).ok).toBe(false);

    kv.values.set(STORAGE_KEYS.draft(period), "{not-json");
    expect(storage.loadDraft(period).ok).toBe(false);
  });

  it("reports write failures instead of throwing", () => {
    const kv = new MemoryStore();
    const storage = new MonthlyStorage(kv);
    kv.failWrites = true;

    const result = storage.saveDraft({ year: 2026, month: 9 }, days(30));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("quota exceeded");
    }
  });

  it("round-trips the holiday cache", () => {
    const kv = new MemoryStore();
    const storage = new MonthlyStorage(kv);
    const data = { holidays: ["2027-10-01"], workdays: ["2027-10-09"] };

    expect(storage.saveHolidayCache(2027, data).ok).toBe(true);
    expect(storage.loadHolidayCache(2027)).toEqual({ ok: true, value: data });
  });
});
