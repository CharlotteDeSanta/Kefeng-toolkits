import type {
  HolidayInfo,
  HolidayStatus,
  HolidayYearData,
} from "../types";
import {
  isBuiltInYear,
  WorkCalendarRegistry,
} from "../calculations/work-calendar";
import type { MonthlyStorage } from "./storage";

const HOLIDAY_API = "https://timor.tech/api/holiday/year";
const TIMEOUT_MS = 8000;

export interface HolidayLoadResult {
  year: number;
  status: Exclude<HolidayStatus, "loading">;
  message: string;
  reliable: boolean;
}

export type HolidayFetcher = (
  input: string,
  init?: RequestInit & { connectTimeout?: number },
) => Promise<Response>;

async function tauriFetch(input: string, init?: RequestInit): Promise<Response> {
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch(input, init);
}

function messageFor(
  year: number,
  status: Exclude<HolidayStatus, "loading">,
): string {
  switch (status) {
    case "builtin":
      return `${year} 年节假日：程序内置数据`;
    case "network":
      return `${year} 年节假日：已联网获取`;
    case "cache":
      return `${year} 年节假日：网络不可用，使用本地缓存`;
    case "unavailable":
      return (
        `${year} 年法定节假日数据缺失（联网获取失败且无本地缓存），` +
        "加班时长与项目出勤将按“仅周末”计算，结果可能不准"
      );
  }
}

function toResult(
  year: number,
  status: Exclude<HolidayStatus, "loading">,
): HolidayLoadResult {
  return {
    year,
    status,
    message: messageFor(year, status),
    reliable: status !== "unavailable",
  };
}

/** 解析 timor.tech 的响应；结构不符、年份不符或一条有效数据都没有时返回 null。 */
export function parseHolidayResponse(
  year: number,
  payload: unknown,
): HolidayYearData | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const map = (payload as { holiday?: unknown }).holiday;
  if (typeof map !== "object" || map === null || Array.isArray(map)) {
    return null;
  }

  const holidays = new Set<string>();
  const workdays = new Set<string>();
  const datePattern = /^(\d{4})-\d{2}-\d{2}$/;

  for (const entry of Object.values(map)) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const value = entry as { date?: unknown; holiday?: unknown };
    if (
      typeof value.date !== "string" ||
      typeof value.holiday !== "boolean"
    ) {
      continue;
    }
    const match = datePattern.exec(value.date);
    if (!match || Number(match[1]) !== year) {
      continue;
    }
    (value.holiday ? holidays : workdays).add(value.date);
  }

  if (holidays.size === 0 && workdays.size === 0) {
    return null;
  }

  return {
    holidays: [...holidays].sort(),
    workdays: [...workdays].sort(),
  };
}

export class HolidayService {
  readonly calendar = new WorkCalendarRegistry();
  private readonly sources = new Map<number, "network" | "cache">();
  private readonly inflight = new Map<number, Promise<HolidayLoadResult>>();

  constructor(
    private readonly storage: MonthlyStorage,
    private readonly fetcher: HolidayFetcher = tauriFetch,
  ) {}

  isBuiltIn(year: number): boolean {
    return isBuiltInYear(year);
  }

  has(year: number): boolean {
    return this.calendar.has(year);
  }

  peek(year: number): HolidayYearData | undefined {
    return this.calendar.get(year);
  }

  /** 同步描述当前能确定的状态，用于首屏渲染。 */
  describeInitial(year: number): HolidayInfo {
    if (isBuiltInYear(year)) {
      return {
        year,
        status: "builtin",
        message: messageFor(year, "builtin"),
        reliable: true,
        loading: false,
      };
    }

    const source = this.sources.get(year);
    if (source) {
      return {
        year,
        status: source,
        message: messageFor(year, source),
        reliable: true,
        loading: false,
      };
    }

    return {
      year,
      status: "loading",
      message: "",
      reliable: false,
      loading: true,
    };
  }

  /** 内置 → 内存 → 联网 → 本地缓存 → 不可用。并发请求按年份去重。 */
  ensure(year: number): Promise<HolidayLoadResult> {
    if (isBuiltInYear(year)) {
      return Promise.resolve(toResult(year, "builtin"));
    }

    const source = this.sources.get(year);
    if (source) {
      return Promise.resolve(toResult(year, source));
    }

    const pending = this.inflight.get(year);
    if (pending) {
      return pending;
    }

    const promise = this.load(year).finally(() => {
      this.inflight.delete(year);
    });
    this.inflight.set(year, promise);
    return promise;
  }

  private async load(year: number): Promise<HolidayLoadResult> {
    try {
      const data = await this.fetchNetwork(year);
      this.calendar.register(year, data);
      this.sources.set(year, "network");
      // 缓存写入失败不影响本次使用。
      this.storage.saveHolidayCache(year, data);
      return toResult(year, "network");
    } catch {
      const cached = this.storage.loadHolidayCache(year);
      if (cached.ok && cached.value) {
        this.calendar.register(year, cached.value);
        this.sources.set(year, "cache");
        return toResult(year, "cache");
      }
      return toResult(year, "unavailable");
    }
  }

  private async fetchNetwork(year: number): Promise<HolidayYearData> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await this.fetcher(`${HOLIDAY_API}/${year}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        connectTimeout: TIMEOUT_MS,
      });
      if (!response.ok) {
        throw new Error(`节假日接口返回 HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      const data = parseHolidayResponse(year, payload);
      if (!data) {
        throw new Error("节假日接口返回的数据无效");
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
}
