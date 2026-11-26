import { useState } from 'react';
import { Button, Banner } from '@/components/ui';
import { forgottenCutoff, forgottenTimers, isLateEveningWithActive } from '@/lib/board';
import * as q from '@/lib/queries';
import { formatBusinessTime } from '@/lib/time';
import type { BoardTask } from '@/lib/types';

/**
 * Avisos de cronómetro olvidado:
 *  · por tarea, a las 4 h activa: "¿Sigues en esto?" [Seguir] [Cortar a las HH:mm]
 *  · global, después de las 21:00 (America/Mexico_City) con activas: [Pausar todas] [Seguir]
 * "Seguir" descarta el aviso para ese tramo (tarea + active_since) o para esa noche.
 */
export function TimerBanners({ active, now, act }: { active: BoardTask[]; now: Date; act: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismiss = (key: string) => setDismissed((s) => new Set(s).add(key));

  const forgotten = forgottenTimers(active, now).filter((t) => !dismissed.has(`${t.id}:${t.active_since}`));
  const lateKey = `late:${now.toDateString()}`;
  const late = isLateEveningWithActive(active, now) && !dismissed.has(lateKey);

  return (
    <>
      {late ? (
        <Banner
          tone="warn"
          testID="banner-late"
          text={`Son más de las 21:00 y tienes ${active.length} ${active.length === 1 ? 'tarea activa' : 'tareas activas'}. ¿Pausamos todo?`}
          actions={
            <>
              <Button label="Pausar todas" variant="primary" onPress={() => void act(() => q.pauseAll())} />
              <Button label="Seguir" variant="ghost" onPress={() => dismiss(lateKey)} />
            </>
          }
        />
      ) : null}
      {forgotten.map((t) => {
        const cutoff = forgottenCutoff(t);
        return (
          <Banner
            key={t.id}
            tone="info"
            testID="banner-forgotten"
            text={`"${t.title}" lleva más de 4 h activa. ¿Sigues en esto?`}
            actions={
              <>
                <Button label="Seguir" onPress={() => dismiss(`${t.id}:${t.active_since}`)} />
                {cutoff ? <Button label={`Cortar a las ${formatBusinessTime(cutoff)}`} variant="primary" onPress={() => void act(() => q.cutTimerAt(t.id, cutoff))} /> : null}
              </>
            }
          />
        );
      })}
    </>
  );
}
