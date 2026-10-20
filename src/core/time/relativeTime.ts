const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatCalendarDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${formatCalendarDate(timestamp)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 列表里用的相对时间：刚刚 / n 分钟前 / n 小时前 / 昨天 / n 天前 / 日期 */
export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  if (diff < 45_000) return "刚刚";
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / MINUTE))} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 2 * DAY) return "昨天";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  return formatCalendarDate(timestamp);
}
