import { useEffect, useState } from 'react';

/** Instante actual, refrescado cada `ms` (por defecto 1 s). Alimenta cronómetros y "vence en". */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
