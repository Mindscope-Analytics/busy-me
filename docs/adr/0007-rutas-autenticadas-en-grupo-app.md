# ADR-0007: Rutas autenticadas bajo un grupo `(app)` con un único BoardProvider

- Estado: aceptado
- Fecha: 2026-11-25
- Decisores: owner del proyecto (vía P-009) y Claude Code

## Contexto

`BoardProvider` (estado del tablero + suscripción Realtime) envolvía solo el layout de `(tabs)`.
Las rutas `task/new` y `task/[id]` eran hermanas de `(tabs)` en el Stack raíz, así que
`useBoard()` lanzaba "useBoard debe usarse dentro de <BoardProvider>" al abrir "+ Tarea".
Además, esas dos rutas no pasaban por el gate de sesión: una URL directa las montaba sin usuario.

## Decisión

Todas las rutas que requieren sesión viven en el grupo de rutas `app/(app)/`:

```
app/_layout.tsx            AuthProvider + Stack { (app), auth/login, auth/verify }
app/(app)/_layout.tsx      gate de sesión (loading → spinner, sin user → /auth/login)
                           + BoardProvider + Stack { (tabs), task/new (modal), task/[id] }
app/(app)/(tabs)/_layout   solo Tabs
```

Hay **una** instancia de `BoardProvider` (una suscripción Realtime) para pestañas y modales.
Las URL públicas no cambian (`/`, `/done`, `/settings`, `/task/new`, `/task/:id`): los grupos
entre paréntesis no aparecen en la ruta.

## Alternativas descartadas

- `BoardProvider` en el layout raíz: funciona, pero deja `task/*` sin gate y monta el provider
  también en las pantallas de login.
- Un `BoardProvider` por ruta: duplicaría suscripciones Realtime y estado.

## Consecuencias

- Toda ruta nueva que use `useBoard()` o requiera sesión se crea dentro de `app/(app)/`.
- `tests/routes.test.tsx` y `tests/routes-guest.test.tsx` montan cada ruta dentro del árbol
  real de layouts (expo-router/testing-library) con y sin sesión; cualquier hook de contexto
  fuera de su provider vuelve a fallar ahí.
- El e2e del tablero corre en CI contra Supabase local (job `e2e` de `ci.yml`), con login OTP
  real leyendo el buzón Mailpit; antes dependía de `E2E_SUPABASE=1` y nunca se ejecutaba.
