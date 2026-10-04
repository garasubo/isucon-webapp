const pad = (n: number) => String(n).padStart(2, "0");

const parse = (iso: string): Date | undefined => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "14:05:40", or "10/03 14:05" when it is not today. */
export const formatTime = (iso: string): string => {
  const date = parse(iso);
  if (!date) return iso;
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (!isSameDay(date, new Date())) {
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${hm}`;
  }
  return `${hm}:${pad(date.getSeconds())}`;
};

/** "2026-10-04 14:05:40" */
export const formatDateTime = (iso: string): string => {
  const date = parse(iso);
  if (!date) return iso;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
};

/** "たった今", "20分前", "1時間前", ... */
export const formatRelative = (iso: string): string => {
  const date = parse(iso);
  if (!date) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "たった今";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
};

/** "5分28秒" */
export const formatDuration = (fromIso: string, toIso: string): string => {
  const from = parse(fromIso);
  const to = parse(toIso);
  if (!from || !to) return "—";
  const total = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [h > 0 && `${h}時間`, m > 0 && `${m}分`, s > 0 && `${s}秒`];
  return parts.filter(Boolean).join("") || "0秒";
};

export const formatScore = (score: number | null | undefined): string =>
  score == null ? "—" : score.toLocaleString("en-US");
