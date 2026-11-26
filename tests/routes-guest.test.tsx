/**
 * Sin sesión, ninguna ruta del grupo autenticado se monta: todas redirigen a /auth/login.
 * Antes de P-009, task/new y task/[id] no pasaban por el gate (solo (tabs) lo tenía).
 */
jest.mock('@/lib/supabase', () => {
  const { createAppSupabaseMock: create } = jest.requireActual<typeof import('./supabase-app-mock')>('./supabase-app-mock');
  return { supabase: create({ signedIn: false }).client };
});

import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { TEST_TASK_ID } from './supabase-app-mock';

describe('rutas autenticadas sin sesión', () => {
  it.each(['/', '/done', '/settings', '/task/new', `/task/${TEST_TASK_ID}`])('%s redirige a /auth/login', async (url) => {
    const r = renderRouter('./app', { initialUrl: url });
    await waitFor(() => expect(screen.getByTestId('login')).toBeTruthy());
    expect(r.getPathname()).toBe('/auth/login');
  });
});
