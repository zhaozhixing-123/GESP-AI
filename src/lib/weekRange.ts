/**
 * 北极星面板统一的"自然周"口径：Asia/Shanghai 时区，周一 00:00 – 周日 23:59:59.999。
 *
 * 所有涉及"本周/上周"的聚合都必须走这里，保证 P1/P2 卡、漏斗、下钻口径完全一致。
 */

const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 把 Date 转成 CST 墙上时间（返回一个 UTC Date，数值等同于 CST 墙上时分秒） */
function toCST(d: Date): Date {
  return new Date(d.getTime() + CST_OFFSET_MS);
}

/** 把 CST 墙上时间 Date 转回真实的 UTC Date */
function fromCST(cst: Date): Date {
  return new Date(cst.getTime() - CST_OFFSET_MS);
}

/** 给定某一时刻，返回它所在自然周的周一 00:00 CST（UTC Date） */
export function weekStartOf(now: Date = new Date()): Date {
  const cst = toCST(now);
  // JS getDay: 周日=0 周一=1 ... 周六=6
  // 我们要算到周一：周一=0 周二=1 ... 周日=6
  const dayFromMonday = (cst.getUTCDay() + 6) % 7;
  const mondayCst = new Date(cst.getTime());
  mondayCst.setUTCDate(mondayCst.getUTCDate() - dayFromMonday);
  mondayCst.setUTCHours(0, 0, 0, 0);
  return fromCST(mondayCst);
}

/** 给定自然周起点，返回下周一 00:00 CST */
export function nextWeekStart(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

/** 本周范围 [start, end)，end 是下周一 00:00 */
export function currentWeek(now: Date = new Date()) {
  const start = weekStartOf(now);
  return { start, end: nextWeekStart(start) };
}

/** 上周范围 [start, end) */
export function lastWeek(now: Date = new Date()) {
  const thisStart = weekStartOf(now);
  const lastStart = new Date(thisStart);
  lastStart.setUTCDate(lastStart.getUTCDate() - 7);
  return { start: lastStart, end: thisStart };
}

/**
 * 上周同期：上周一 00:00 到 上周的当前时刻对应点。
 * 例如今天是本周四 15:00，返回 [上周一 00:00, 上周四 15:00)。
 * 用于 WoW 对比，避免"本周至今 vs 上周完整"这种偏见比较。
 */
export function lastWeekSameProgress(now: Date = new Date()) {
  const thisStart = weekStartOf(now);
  const progressMs = now.getTime() - thisStart.getTime();
  const lastStart = new Date(thisStart);
  lastStart.setUTCDate(lastStart.getUTCDate() - 7);
  const lastEnd = new Date(lastStart.getTime() + progressMs);
  return { start: lastStart, end: lastEnd };
}

/** 近 4 周滚动：从 4 周前周一到本周一（不含本周） */
export function rolling4Weeks(now: Date = new Date()) {
  const thisStart = weekStartOf(now);
  const start = new Date(thisStart);
  start.setUTCDate(start.getUTCDate() - 28);
  return { start, end: thisStart };
}

/** 近 8 周（含本周）每周的起点，按时间正序，用于折线图 */
export function last8WeekStarts(now: Date = new Date()): Date[] {
  const thisStart = weekStartOf(now);
  const result: Date[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(thisStart);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    result.push(d);
  }
  return result;
}

/** 给定日期往前推 N 天（保留时分秒） */
export function daysAgo(n: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
