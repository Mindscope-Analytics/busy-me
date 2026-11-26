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
const EMAIL = `e2e-${Date.now()}@example.com`;

test.describe('tablero', () => {
  test.skip(!process.env.E2E_SUPABASE, 'requiere Supabase local (E2E_SUPABASE=1)');

  test('crear → activar → cronómetro → pausar → pendientes → finalizar → completadas', async ({ page }) => {
    await login(page);

    // Primer uso: áreas por defecto
    const firstUse = page.getByTestId('create-default-areas');
    if (await firstUse.isVisible({ timeout: 5_000 }).catch(() => false)) await firstUse.click();

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

    // Pausar → sale de Activas y aparece en Pendientes con reloj acumulado (Xm)
    await active.getByTestId('pause').click();
    const pending = inSection('section-pending');
    await expect(pending).toBeVisible();
    await expect(inSection('section-active')).toHaveCount(0);
    await expect(pending.getByTestId('clock')).toHaveText(/^\d+m$/);

    // Finalizar → desaparece de Ahora y aparece en Completadas
    await pending.getByTestId('complete').click();
    await expect(page.getByTestId(/^task-/).filter({ hasText: 'Tarea de ejemplo e2e' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Completadas' }).or(page.getByText('Completadas', { exact: true })).first().click();
    await expect(page.getByTestId('done-screen')).toBeVisible();
    const done = page.getByTestId('done-screen').getByTestId(/^task-/).filter({ hasText: 'Tarea de ejemplo e2e' });
    await expect(done).toBeVisible();

    // Reabrir → vuelve a Pendientes en Ahora
    await done.getByTestId('reopen').click();
    await expect(done).toHaveCount(0);
    await page.getByRole('tab', { name: 'Ahora' }).or(page.getByText('Ahora', { exact: true })).first().click();
    await expect(inSection('section-pending')).toBeVisible();
  });
});

async function login(page: Page) {
  await page.goto('/');
  await page.getByTestId('email').fill(EMAIL);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByTestId('otp')).toBeVisible();
  const code = await otpFromMailpit(EMAIL);
  await page.getByTestId('otp').fill(code);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('home')).toBeVisible({ timeout: 15_000 });
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
