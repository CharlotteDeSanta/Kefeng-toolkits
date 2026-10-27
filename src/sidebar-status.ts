import { formatHundredths } from "./tools/monthly-report/calculations/fixed-point";
import { computeSummary } from "./tools/monthly-report/calculations/summary";
import { WorkCalendarRegistry } from "./tools/monthly-report/calculations/work-calendar";
import { MonthlyStorage } from "./tools/monthly-report/services/storage";
import type {
  Hundredths,
  Period,
  Profile,
} from "./tools/monthly-report/types";

export const MONTHLY_SUMMARY_EVENT = "kefeng:monthly-summary";
export const PROFILE_EVENT = "kefeng:profile-update";

export interface MonthlySummaryDetail {
  year: number;
  month: number;
  /** 月报“总工作时长”，整数百分位（5268 = 52.68 小时）。 */
  workHours: Hundredths;
  /** 公司调休/休息折算小时数，整数百分位（800 = 8.00 小时）。 */
  restHours: Hundredths;
}

/** 月报工具更新汇总时通知侧边栏状态区。 */
export function publishMonthlySummary(detail: MonthlySummaryDetail): void {
  window.dispatchEvent(
    new CustomEvent<MonthlySummaryDetail>(MONTHLY_SUMMARY_EVENT, { detail }),
  );
}

/** 姓名/等级变化时通知侧边栏状态区更新品牌行。 */
export function publishProfile(profile: Profile): void {
  window.dispatchEvent(
    new CustomEvent<Profile>(PROFILE_EVENT, { detail: profile }),
  );
}

const BEIJING_TIME_ZONE = "Asia/Shanghai";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: BEIJING_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "long",
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: BEIJING_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const periodFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BEIJING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

function requireElement(role: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-role="${role}"]`);
  if (!node) {
    throw new Error(`侧边栏状态区缺少 DOM 节点: ${role}`);
  }
  return node;
}

function formatDate(now: Date): string {
  const parts = dateFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}年${value("month")}月${value("day")}日 ${value("weekday")}`;
}

function beijingPeriod(now: Date): Period {
  const parts = periodFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(value("year")), month: Number(value("month")) };
}

function periodKey(period: Period): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

/** 姓名首字符：中文取第一个汉字，拉丁字母转大写。 */
function firstCharacter(name: string): string {
  const first = Array.from(name.trim())[0] ?? "K";
  return /^[a-z]$/i.test(first) ? first.toUpperCase() : first;
}

export function initSidebarStatus(): void {
  const logoEl = requireElement("status-logo");
  const nameEl = requireElement("status-name");
  const dateEl = requireElement("status-date");
  const timeEl = requireElement("status-time");
  const hoursEl = requireElement("status-hours");
  const restHoursEl = requireElement("status-rest-hours");
  const storage = new MonthlyStorage(window.localStorage);

  let liveSummary: {
    key: string;
    workHours: Hundredths;
    restHours: Hundredths;
  } | null = null;

  const renderBrand = (profile: Profile | null): void => {
    const name = profile?.employeeName.trim() ?? "";
    if (!profile || name.length === 0) {
      logoEl.textContent = "K";
      logoEl.classList.remove("sidebar-status__logo--engineer");
      nameEl.textContent = "科烽智能科技";
      nameEl.removeAttribute("title");
      return;
    }

    logoEl.textContent = firstCharacter(name);
    logoEl.classList.add("sidebar-status__logo--engineer");
    const label = `${name}•${profile.level}`;
    nameEl.textContent = label;
    nameEl.title = label;
  };

  const loadedProfile = storage.loadProfile();
  renderBrand(loadedProfile.ok ? loadedProfile.value : null);

  window.addEventListener(PROFILE_EVENT, (event) => {
    renderBrand((event as CustomEvent<Profile>).detail);
  });

  const buildCalendar = (year: number): WorkCalendarRegistry => {
    const calendar = new WorkCalendarRegistry();
    const cached = storage.loadHolidayCache(year);
    if (cached.ok && cached.value) {
      calendar.register(year, cached.value);
    }
    return calendar;
  };

  const readDraftSummary = (
    period: Period,
  ): { workHours: Hundredths; restHours: Hundredths } => {
    const result = storage.loadDraft(period);
    if (!result.ok || !result.value) {
      return { workHours: 0, restHours: 0 };
    }

    const summary = computeSummary(
      result.value.days,
      buildCalendar(period.year),
    );
    return {
      workHours: summary.totalWorkHours,
      // usedRestDays 是“天”的百分位，×8 后即“小时”的百分位。
      restHours: summary.usedRestDays * 8,
    };
  };

  const setMetric = (
    target: HTMLElement,
    label: string,
    value: Hundredths,
  ): void => {
    const strong = document.createElement("strong");
    strong.textContent = formatHundredths(value, 2);
    target.replaceChildren(label, strong, " 小时");
  };

  const updateHours = (now: Date): void => {
    const period = beijingPeriod(now);
    const key = periodKey(period);
    const summary =
      liveSummary?.key === key ? liveSummary : readDraftSummary(period);

    setMetric(hoursEl, "本月已工作 ", summary.workHours);
    setMetric(restHoursEl, "本月已休息 ", summary.restHours);
  };

  const tick = (): void => {
    const now = new Date();
    dateEl.textContent = formatDate(now);
    timeEl.textContent = `北京时间 ${timeFormatter.format(now)}`;
    updateHours(now);
  };

  window.addEventListener(MONTHLY_SUMMARY_EVENT, (event) => {
    const detail = (event as CustomEvent<MonthlySummaryDetail>).detail;
    liveSummary = {
      key: periodKey({ year: detail.year, month: detail.month }),
      workHours: detail.workHours,
      restHours: detail.restHours,
    };
    updateHours(new Date());
  });

  tick();
  window.setInterval(tick, 1000);
}
