/**
 * Regresión P-009: cada ruta autenticada debe montarse dentro del árbol REAL de layouts
 * (app/_layout → (app)/_layout → …) sin lanzar. El bug original: task/new y task/[id] quedaban
 * fuera del BoardProvider y useBoard() tronaba al abrir "+ Tarea".
 */
import type { createAppSupabaseMock } from './supabase-app-mock';

jest.mock('@/lib/supabase', () => {
  const { createAppSupabaseMock: create } = jest.requireActual<typeof import('./supabase-app-mock')>('./supabase-app-mock');
  const m = create({ signedIn: true });
  (globalThis as Record<string, unknown>).__supabaseAppMock = m;
  return { supabase: m.client };
});

import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
// Fuerza la fábrica del mock antes de leer el global (las rutas se cargan perezosamente).
import '@/lib/supabase';
import { TEST_TASK_ID } from './supabase-app-mock';

const mock = (globalThis as Record<string, unknown>).__supabaseAppMock as ReturnType<typeof createAppSupabaseMock>;

const routes: { url: string; testID: string }[] = [
  { url: '/', testID: 'home' },
  { url: '/done', testID: 'done-screen' },
  { url: '/settings', testID: 'settings-screen' },
  { url: '/task/new', testID: 'new-task-form' },
  { url: `/task/${TEST_TASK_ID}`, testID: 'task-detail' },
];

describe('rutas autenticadas dentro del layout real', () => {
  beforeEach(() => {
    mock.subscriptions.length = 0;
  });

  it.each(routes)('$url renderiza sin lanzar', async ({ url, testID }) => {
    renderRouter('./app', { initialUrl: url });
    await waitFor(() => expect(screen.getByTestId(testID)).toBeTruthy());
  });

  it('monta un solo BoardProvider (una suscripción Realtime) aunque la ruta sea un modal', async () => {
    renderRouter('./app', { initialUrl: '/task/new' });
    await waitFor(() => expect(screen.getByTestId('new-task-form')).toBeTruthy());
    await waitFor(() => expect(mock.subscriptions).toHaveLength(1));
  });
});
