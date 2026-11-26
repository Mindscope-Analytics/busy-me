import { expect, test, type Page } from '@playwright/test';

/**
 * Flujo del tablero contra Supabase LOCAL (supabase start) y un export web construido con
 * EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321. El código OTP se lee del buzón local
 * (Mailpit, http://127.0.0.1:54324). Se omite si no está E2E_SUPABASE=1 (en CI el export usa
 * placeholders y no hay base).
 *
 *   E2E_SUPABASE=1 pnpm export:web && E2E_SUPABASE=1 pnpm e2e:web
 */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324';
// Un correo por login: auth.email.max_frequency (1 min) rechazaría un segundo OTP al mismo buzón.
const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

test.describe('tablero', () => {
  test.skip(!process.env.E2E_SUPABASE, 'requiere Supabase local (E2E_SUPABASE=1)');

  test('crear → activar → cronómetro → pausar → pendientes → finalizar → completadas', async ({ page }) => {
    await login(page);
    await createDefaultAreas(page);

    // Crear tarea sin iniciar
    await page.getByTestId('new-task').click();
    await page.getByTestId('title').fill('Tarea de ejemplo e2e');
    await page.getByTestId('area-Personal').click();
    await page.getByTestId('start-now').click(); // apaga "Iniciar al guardar"
    await page.getByTestId('save-task').click();

    const inSection = (section: string) => page.getByTestId(section).getByTestId(/^task-/).filter({ hasText: 'Tarea de ejemplo e2e' });
    // Sin "Iniciar al guardar" la tarea nace en Por iniciar
    await expect(inSection('section-backlog')).toBeVisible();

    // Activar → aparece en Activas con cronómetro corriendo (H:MM:SS que avanza)
    await inSection('section-backlog').getByTestId('activate').click();
    const active = inSection('section-active');
    await expect(active).toBeVisible();
    await expect(inSection('section-backlog')).toHaveCount(0);
    const clock = active.getByTestId('clock');
    await expect(clock).toHaveText(/^0:00:\d\d$/);
    const first = await clock.textContent();
    await expect(clock).not.toHaveText(first ?? '', { timeout: 5_000 });

    // Pausar → aparece en Pendientes con reloj acumulado (Xm). Sin activas, la sección "Activas"
    // muestra "Nada activo" + sugeridas (la misma tarea puede aparecer ahí como sugerencia).
    await active.getByTestId('pause').click();
    const pending = inSection('section-pending');
    await expect(pending).toBeVisible();
    await expect(page.getByTestId('nothing-active')).toBeVisible();
    await expect(pending.getByTestId('clock')).toHaveText(/^\d+m$/);

    // Finalizar → desaparece de Ahora y aparece en Completadas
    await pending.getByTestId('complete').click();
    await expect(page.getByTestId(/^task-/).filter({ hasText: 'Tarea de ejemplo e2e' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Completadas' }).click();
    await expect(page.getByTestId('done-screen')).toBeVisible();
    const done = page.getByTestId('done-screen').getByTestId(/^task-/).filter({ hasText: 'Tarea de ejemplo e2e' });
    await expect(done).toBeVisible();

    // Reabrir → vuelve a Pendientes en Ahora
    await done.getByTestId('reopen').click();
    await expect(done).toHaveCount(0);
    await page.getByRole('tab', { name: 'Ahora' }).click();
    await expect(inSection('section-pending')).toBeVisible();
  });

  test('"+ Tarea" abre el alta; solicitante y tipo en línea; detalle con tramo manual; pausar, finalizar y reabrir', async ({ page }) => {
    await login(page);
    await createDefaultAreas(page);

    // Regresión P-009: la ruta modal task/new debe montarse dentro del BoardProvider.
    await page.getByTestId('new-task').click();
    await expect(page.getByTestId('new-task-form')).toBeVisible();
    await page.getByTestId('title').fill('Tarea con solicitante e2e');
    await page.getByTestId('area-Trabajo').click(); // track_by_type = true → pide tipo

    await page.getByTestId('new-requester').click();
    await page.getByTestId('requester-name').fill('Solicitante 1');
    await page.getByTestId('save-requester').click();
    await expect(page.getByTestId('requester-name')).toHaveCount(0);

    await page.getByTestId('new-work-type').click();
    await page.getByTestId('work-type-name').fill('Tipo A');
    await page.getByTestId('save-work-type').click();
    await expect(page.getByTestId('work-type-name')).toHaveCount(0);

    // "Iniciar al guardar" queda encendido → nace activa con cronómetro
    await page.getByTestId('save-task').click();
    const card = page.getByTestId('section-active').getByTestId(/^task-/).filter({ hasText: 'Tarea con solicitante e2e' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Solicitante 1');
    await expect(card).toContainText('Tipo A');
    await expect(card.getByTestId('clock')).toHaveText(/^0:00:\d\d$/);

    // Detalle: un tramo abierto; agregar tramo manual (1 h por defecto) → dos tramos y reloj ≥ 1 h
    await card.getByTestId('open-task').click();
    await expect(page.getByTestId('task-detail')).toBeVisible();
    await expect(page.getByTestId('task-status')).toContainText('activa');
    await expect(page.getByTestId('time-entry')).toHaveCount(1);
    await page.getByTestId('add-entry').click();
    await page.getByTestId('entry-note').fill('Tramo manual e2e');
    await page.getByTestId('entry-add').click();
    await expect(page.getByTestId('time-entry')).toHaveCount(2);
    await expect(page.getByTestId('totals')).toHaveText(/^Reloj 1:0\d:\d\d · Asignado/);

    // Pausar → pendiente; Finalizar → completada; Reabrir → pendiente (desde el detalle)
    const detail = page.getByTestId('task-detail');
    await detail.getByRole('button', { name: 'Pausar' }).click();
    await expect(page.getByTestId('task-status')).toContainText('pendiente');
    await detail.getByRole('button', { name: 'Finalizar' }).click();
    await expect(page.getByTestId('task-status')).toContainText('completada');
    await detail.getByRole('button', { name: 'Reabrir' }).click();
    await expect(page.getByTestId('task-status')).toContainText('pendiente');

    // De vuelta en "Ahora" la tarea está en Pendientes con el reloj acumulado
    await page.goBack();
    await expect(page.getByTestId('home')).toBeVisible();
    const pending = page.getByTestId('section-pending').getByTestId(/^task-/).filter({ hasText: 'Tarea con solicitante e2e' });
    await expect(pending).toBeVisible();
    await expect(pending.getByTestId('clock')).toHaveText(/^1h/);
  });
});

async function login(page: Page) {
  const EMAIL = uniqueEmail();
  await page.goto('/');
  await page.getByTestId('email').fill(EMAIL);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByTestId('otp')).toBeVisible();
  const code = await otpFromMailpit(EMAIL);
  await page.getByTestId('otp').fill(code);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('home')).toBeVisible({ timeout: 15_000 });
}

/** Cada login es un usuario nuevo (correo único) → siempre pasa por el primer uso. */
async function createDefaultAreas(page: Page) {
  await page.getByTestId('create-default-areas').click();
  await expect(page.getByTestId('first-use')).toHaveCount(0);
  await expect(page.getByTestId('area-filter').getByText('Personal', { exact: true })).toBeVisible();
}

async function otpFromMailpit(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const data = (await res.json()) as { messages?: { ID: string }[] };
    const id = data.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
      const m = `${msg.Text ?? ''}\n${msg.HTML ?? ''}`.match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('No llegó el código OTP al buzón local');
}
