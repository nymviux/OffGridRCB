const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD HH:mm:ss` in local time (no Intl dependency). */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function formatRelative(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000);
  if (s < 0) return 'w przyszłości';
  if (s < 45) return 'przed chwilą';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min temu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} godz. temu`;
  return `${Math.round(h / 24)} dni temu`;
}

/** Node ids are u32 on the wire; hex reads better. */
export function formatNodeId(id: number | undefined): string {
  return id ? `0x${id.toString(16).padStart(8, '0')}` : 'nieznany';
}
