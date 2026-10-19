import { describe, expect, it, vi } from "vitest";
import {
  HolidayService,
  parseHolidayResponse,
  type HolidayFetcher,
} from "./holiday-service";
import { MonthlyStorage, type KeyValueStore } from "./storage";

class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const validPayload = {
  code: 0,
  holiday: {
    "10-01": { holiday: true, name: "国庆节", date: "2027-10-01" },
    "10-09": { holiday: false, name: "国庆节后补班", date: "2027-10-09" },
  },
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseHolidayResponse", () => {
  it("splits holidays and makeup workdays", () => {
    expect(parseHolidayResponse(2027, validPayload)).toEqual({
      holidays: ["2027-10-01"],
      workdays: ["2027-10-09"],
    });
  });

  it("rejects malformed, empty, and wrong-year payloads", () => {
    expect(parseHolidayResponse(2027, null)).toBeNull();
    expect(parseHolidayResponse(2027, "<html>challenge</html>")).toBeNull();
    expect(parseHolidayResponse(2027, { holiday: {} })).toBeNull();
    expect(
      parseHolidayResponse(2027, {
        holiday: { "01-01": { holiday: true, date: "2026-01-01" } },
      }),
    ).toBeNull();
  });
});

describe("HolidayService", () => {
  it("short-circuits built-in years", async () => {
    const storage = new MonthlyStorage(new MemoryStore());
    const fetcher = vi.fn<HolidayFetcher>();
    const service = new HolidayService(storage, fetcher);

    const result = await service.ensure(2026);
    expect(result.status).toBe("builtin");
    expect(result.reliable).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(service.peek(2026)?.holidays).toContain("2026-09-25");
  });

  it("fetches non-built-in years and caches the result", async () => {
    const kv = new MemoryStore();
    const storage = new MonthlyStorage(kv);
    const fetcher = vi.fn<HolidayFetcher>().mockResolvedValue(jsonResponse(validPayload));
    const service = new HolidayService(storage, fetcher);

    const result = await service.ensure(2027);
    expect(result.status).toBe("network");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(service.peek(2027)?.workdays).toEqual(["2027-10-09"]);

    const cached = storage.loadHolidayCache(2027);
    expect(cached.ok && cached.value?.holidays).toEqual(["2027-10-01"]);

    const second = await service.ensure(2027);
    expect(second.status).toBe("network");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to the local cache when the network fails", async () => {
    const storage = new MonthlyStorage(new MemoryStore());
    storage.saveHolidayCache(2027, {
      holidays: ["2027-10-01"],
      workdays: [],
    });
    const fetcher = vi.fn<HolidayFetcher>().mockRejectedValue(new Error("offline"));
    const service = new HolidayService(storage, fetcher);

    const result = await service.ensure(2027);
    expect(result.status).toBe("cache");
    expect(result.reliable).toBe(true);
    expect(service.peek(2027)?.holidays).toEqual(["2027-10-01"]);
  });

  it("reports unavailable when there is no network or cache", async () => {
    const storage = new MonthlyStorage(new MemoryStore());
    const fetcher = vi.fn<HolidayFetcher>().mockRejectedValue(new Error("offline"));
    const service = new HolidayService(storage, fetcher);

    const result = await service.ensure(2027);
    expect(result.status).toBe("unavailable");
    expect(result.reliable).toBe(false);
    expect(result.message).toContain("数据缺失");
  });

  it("deduplicates concurrent requests for the same year", async () => {
    const storage = new MonthlyStorage(new MemoryStore());
    let release: (response: Response) => void = () => undefined;
    const fetcher = vi.fn<HolidayFetcher>(
      () => new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    const service = new HolidayService(storage, fetcher);

    const first = service.ensure(2027);
    const second = service.ensure(2027);
    await Promise.resolve();
    release(jsonResponse(validPayload));

    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe("network");
    expect(b.status).toBe("network");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
