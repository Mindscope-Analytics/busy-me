import {
  addDays,
  businessHour,
  daysToDue,
  dueLabel,
  dueTone,
  formatBusinessTime,
  formatHm,
  formatHms,
  isValidYmd,
  secondsSince,
  toBusinessDate,
} from '../lib/time';

describe('toBusinessDate (America/Mexico_City)', () => {
  it('a las 23:30 de la CDMX todavía es el mismo día aunque en UTC ya sea el siguiente', () => {
    // 2026-01-15 23:30 CST (UTC-6) = 2026-01-16 05:30Z
    expect(toBusinessDate(new Date('2026-01-16T05:30:00Z'))).toBe('2026-01-15');
  });
  it('a las 00:10 de la CDMX ya es el día siguiente', () => {
    expect(toBusinessDate(new Date('2026-01-16T06:10:00Z'))).toBe('2026-01-16');
  });
  it('no usa horario de verano (CDMX fijo en UTC-6 desde 2022)', () => {
    expect(toBusinessDate(new Date('2026-07-16T05:30:00Z'))).toBe('2026-07-15');
  });
});

describe('daysToDue', () => {
  const now = new Date('2026-01-16T05:30:00Z'); // 15 de enero, 23:30 CDMX
  it('vence en 2 días', () => expect(daysToDue('2026-01-17', now)).toBe(2));
  it('vence hoy', () => expect(daysToDue('2026-01-15', now)).toBe(0));
  it('vencida hace 1 día', () => expect(daysToDue('2026-01-14', now)).toBe(-1));
  it('sin fecha → null', () => expect(daysToDue(null, now)).toBeNull());
});

describe('dueLabel y dueTone', () => {
  it('etiquetas', () => {
    expect(dueLabel(2)).toBe('vence en 2 d');
    expect(dueLabel(1)).toBe('vence mañana');
    expect(dueLabel(0)).toBe('vence hoy');
    expect(dueLabel(-1)).toBe('vencida hace 1 d');
    expect(dueLabel(null)).toBe('');
  });
  it('semáforo: vencida rojo, ≤3 ámbar, resto ok', () => {
    expect(dueTone(-1)).toBe('overdue');
    expect(dueTone(0)).toBe('soon');
    expect(dueTone(3)).toBe('soon');
    expect(dueTone(4)).toBe('ok');
    expect(dueTone(null)).toBe('none');
  });
});

describe('formato de tiempos', () => {
  it('formatHms', () => {
    expect(formatHms(0)).toBe('0:00:00');
    expect(formatHms(59)).toBe('0:00:59');
    expect(formatHms(3661)).toBe('1:01:01');
    expect(formatHms(-5)).toBe('0:00:00');
  });
  it('formatHm', () => {
    expect(formatHm(0)).toBe('0m');
    expect(formatHm(1799)).toBe('29m');
    expect(formatHm(3600)).toBe('1h 00m');
    expect(formatHm(5400)).toBe('1h 30m');
  });
  it('secondsSince nunca es negativo', () => {
    const now = new Date('2026-01-16T05:30:00Z');
    expect(secondsSince('2026-01-16T05:00:00Z', now)).toBe(1800);
    expect(secondsSince('2026-01-16T06:00:00Z', now)).toBe(0);
    expect(secondsSince(null, now)).toBe(0);
  });
});

describe('calendario', () => {
  it('addDays cruza mes y año', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('isValidYmd', () => {
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2028-02-29')).toBe(true);
    expect(isValidYmd('15/01/2026')).toBe(false);
  });
  it('businessHour y formatBusinessTime en CDMX', () => {
    const at = new Date('2026-01-16T03:05:00Z'); // 21:05 CDMX
    expect(businessHour(at)).toBe(21);
    expect(formatBusinessTime(at)).toBe('21:05');
  });
});
