# CLAUDE.md — Busy Me

Este archivo gobierna a Claude Code en este repo. Las reglas globales de Mindscope Analytics
(idioma, flujo rama + PR, handoff) están en `~/.claude/CLAUDE.md`; estas las complementan y
nunca las relajan.

## Qué es este repo

Tablero personal de tareas con cronómetros en paralelo. Expo (web + Android) + Supabase.
**Repo público.** Fases: 1a local (migraciones, tablero, detalle, ajustes); 1b despliegue
(Supabase cloud, Cloudflare Pages, APK, notificaciones Android).

## Regla de privacidad (la más importante aquí)

Todo texto que llega a GitHub usa **descripciones genéricas** (área, solicitante, tarea),
nunca nombres reales de empresas, clientes, personas o proyectos del dueño. Aplica a mensajes
de commit, nombres de rama y de archivo, títulos y cuerpos de PR e issues, comentarios, README
y handoffs citados. **Las descripciones de PR se escriben a partir del diff, no del contexto
de la conversación.**

- La lista de términos vive fuera del repo (`~/.config/busy-me/private-terms.txt`). No la
  leas, no la cites, no la copies. Los hooks la consultan por ti.
- Si un hook rechaza "contiene un término privado", reescribe el texto con descripciones
  genéricas; no intentes averiguar cuál fue el término.
- Datos reales solo en la base de datos. Seeds, fixtures, tests, capturas y docs usan datos
  ficticios genéricos ("Área A", "Solicitante 1", "Tarea de ejemplo").

```bash
# Esperado: pass=N fail=0 (hooks con lista ficticia)
bash scripts/test-private-terms.sh
```

## Comandos

```bash
pnpm install && supabase start && supabase db reset
pnpm lint && pnpm typecheck && pnpm test     # jest + guard + privacy
supabase test db                             # pgTAP
pnpm export:web && pnpm e2e:web              # Playwright
```

Comandos de Claude Code: `/plan-phase`, `/ship-pr`, `/audit`, `/handoff`.
Agentes: `planner`, `db-guardian`, `test-engineer`, `security-auditor`, `independent-reviewer`.

## Reglas del dominio

- Zona horaria de negocio: `America/Mexico_City` (SQL con `at time zone`, cliente con
  `Intl`/`toLocaleString` en esa zona). Nunca la zona del dispositivo para "vence en N días".
- El cliente **nunca** hace `update` directo de `tasks.status` ni de `time_entries` abiertos:
  todo pasa por las RPC (`start_task`, `activate_task`, `pause_task`, `pause_all`,
  `complete_task`, `reopen_task`). Un trigger lo impone en la base.
- Máximo un timer abierto por tarea (índice único parcial); varias tareas activas en paralelo
  sí. El tiempo en paralelo se reparte en `v_time_allocated`.
- `user_id` lo pone un trigger desde `auth.uid()`; el cliente no lo envía.

## Reglas verificables (heredadas de la Factory)

1. **Sin source maps en producción web.** `find dist -name "*.map" | wc -l` → 0.
2. **RLS desde el día uno.** `bash scripts/check-rls.sh` → OK; toda función `SECURITY DEFINER`
   con `set search_path` y `revoke ... from public`.
3. **Todo por rama y PR.** `git config core.hooksPath` → `.githooks`. Nunca `main`.
4. **Auth validada en el servidor.** `service_role` solo server-only (aquí: ninguno).
   `grep -rnE "(EXPO_PUBLIC|NEXT_PUBLIC|VITE)_[A-Z_]*SERVICE" --exclude-dir=node_modules . | grep -v CLAUDE.md | wc -l` → 0.
5. **Secretos fuera del repo.** `git ls-files | grep -E "(^|/)\.env" | grep -v "\.env\.example$" | wc -l` → 0;
   `eas.json` y `app.config.ts` sin valores.
6. **Rate limiting.** `grep -n '"rate_limit"' supabase/config.jsonc` existe.
7. **Caché sin datos personales.** No se cachea nada que dependa de la sesión.
8. **Sin SQL con strings.** Solo PostgREST (`.from().select()`), RPC con argumentos; Zod antes
   de tocar la base. `grep -rnE 'from\(`|select\(`|rpc\(`' --include=*.ts --include=*.tsx --exclude-dir=node_modules . | wc -l` → 0.

## Reglas del proyecto

- Toda feature trae tests; todo cambio de base trae un test pgTAP con dos usuarios.
- Antes de abrir PR: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `/security-review`.
- Nunca `gh pr merge`, `git push --force`, `gh api` con PUT/DELETE/PATCH, `supabase db reset
  --linked`, ni la etiqueta `human-approved`. Son decisiones humanas.
- Si el diff toca rutas de `.factory/risk-policy.yml` (migraciones, `.claude/`, `.githooks/`,
  workflows, `eas.json`, `app.config.*`, lockfile…), dilo en el PR con el riesgo y la reversa.
  `risk-gate` fallará hasta que el owner etiquete `human-approved`; el siguiente bloque sigue
  en una rama que parte de la anterior.
- Decisiones no triviales → ADR en `docs/adr/`.
- No leas `.env` (salvo `.env.example`) ni archivos de datos; la deny-list y `guard-bash.sh`
  lo bloquean (ver `.factory/` y ADR-0005 de la Factory).
- Supabase solo local hasta la Fase 1b: no crees proyectos remotos.
