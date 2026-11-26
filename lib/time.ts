/**
 * Fechas y tiempos de negocio. Zona horaria fija: America/Mexico_City (nunca la del dispositivo).
 * Funciones puras, sin dependencias: se prueban con jest.
 */
export const BUSINESS_TZ = 'America/Mexico_City';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const hmFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: BUSINESS_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 'YYYY-MM-DD' del instante dado en America/Mexico_City. */
export function toBusinessDate(at: Date): string {
  return ymdFormatter.format(at); // en-CA produce YYYY-MM-DD
}

/** Hora local de negocio (0-23) del instante dado. */
export function businessHour(at: Date): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric', hour12: false }).format(at);
  return Number(h) % 24;
}

/** 'HH:mm' en America/Mexico_City. */
export function formatBusinessTime(at: Date): string {
  return hmFormatter.format(at).replace(/^24/, '00');
}

/** Días calendario entre hoy (negocio) y due ('YYYY-MM-DD'). Negativo = vencida. */
export function daysToDue(due: string | null | undefined, now: Date): number | null {
  if (!due) return null;
  const [y, m, d] = due.split('-').map(Number);
  const [ty, tm, td] = toBusinessDate(now).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

/** Suma días a una fecha 'YYYY-MM-DD' (calendario, sin zona). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** 'vence en 2 d' · 'vence hoy' · 'vencida hace 1 d' · '' si no hay fecha. */
export function dueLabel(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'vence hoy';
  if (days === 1) return 'vence mañana';
  if (days > 0) return `vence en ${days} d`;
  return `vencida hace ${-days} d`;
}

export type DueTone = 'overdue' | 'soon' | 'ok' | 'none';
/** Semáforo: vencida (rojo), ≤ 3 días (ámbar), resto. */
export function dueTone(days: number | null): DueTone {
  if (days === null) return 'none';
  if (days < 0) return 'overdue';
  if (days <= 3) return 'soon';
  return 'ok';
}

/** Segundos → 'H:MM:SS' (cronómetro en vivo). */
export function formatHms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Segundos → 'Xh Ym' (acumulados). 0 → '0m'. */
export function formatHm(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Segundos transcurridos desde un ISO hasta `now` (nunca negativos). */
export function secondsSince(iso: string | null, now: Date): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
}
