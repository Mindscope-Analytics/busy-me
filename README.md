# Busy Me

Tablero personal de trabajo (web + Android con el mismo código): qué estás haciendo ahora,
qué tienes pendiente y qué está por vencer, con cronómetros por tarea que pueden correr en
paralelo. Creado desde la [Mindscope Analytics Software Factory](https://github.com/Mindscope-Analytics/mindscope-software-factory)
con el preset `expo-supabase` y el módulo `supabase-base`.

> Este repositorio es **público**. Los datos reales viven solo en la base de datos; aquí no
> hay nombres de personas, empresas, clientes ni proyectos reales (ver "Términos privados").

## Stack

| Capa | Qué |
|---|---|
| App | Expo SDK 54, expo-router, TypeScript, React Native Web |
| Backend | Supabase (Postgres + Auth por email/OTP + Realtime). Local con `supabase start`; el proyecto remoto llega en la Fase 1b. |
| Calidad | jest (lógica de cliente), pgTAP (RLS y RPCs), Playwright (web), Maestro (Android) |
| Gobernanza | CI, `risk-gate`, `security`, `claude-review`; hooks locales de git y de Claude Code |

## Correr en local

```bash
pnpm install                 # instala deps y activa los hooks de git
supabase start               # Postgres + Auth + Realtime locales (requiere Docker)
supabase db reset            # aplica migraciones y seed
cp .env.example .env         # luego pega la URL y la anon key que imprime `supabase status`
pnpm web                     # http://localhost:8081
```

El código OTP del login llega al buzón local: http://127.0.0.1:54324 (Mailpit). Para
Android, `pnpm android` con un emulador o dispositivo conectado.

```bash
pnpm lint && pnpm typecheck && pnpm test   # jest + guard + términos privados
supabase test db                           # pgTAP
pnpm export:web && pnpm e2e:web            # Playwright sobre dist/
```

## Términos privados (repo público)

Todo texto que llega a GitHub (mensajes de commit, nombres de rama y de archivo, contenido
commiteado, títulos y cuerpos de PR e issues) se compara contra una lista **privada** que vive
fuera del repo y que solo tú llenas:

```
~/.config/busy-me/private-terms.txt
```

Formato: un término por línea; las líneas vacías y las que empiezan con `#` se ignoran. La
comparación es por **palabra completa**, sin distinguir mayúsculas ni acentos (escribe el
término como quieras: con o sin acento cubre ambas formas). Un término puede ser una frase de
varias palabras. Ejemplo de estructura (los valores son inventados):

```
# empresas
<nombre de empresa>
# personas
<nombre y apellido>
# siglas y proyectos
<sigla>
```

Qué lo aplica:

| Dónde | Qué revisa |
|---|---|
| `.githooks/commit-msg` | el mensaje del commit |
| `.githooks/pre-commit` | nombres de archivo y contenido staged (texto; los binarios no se inspeccionan) |
| `.githooks/pre-push` | el nombre de la rama |
| `.claude/hooks/private-terms.sh` | en Claude Code: `gh pr/issue create|edit|comment`, `git commit`, `git checkout -b`, `git switch -c`, `git push`, incluidos los archivos pasados con `-F`/`--body-file` |

Si la lista no existe, los hooks **rechazan** (fail-closed). Solo en CI o en una máquina sin
lista se puede continuar con `BUSYME_ALLOW_NO_TERMS=1`. El rechazo nunca imprime el término:
solo dice que el texto "contiene un término privado". Los tests (`pnpm test:privacy`) usan una
lista ficticia en un directorio temporal, nunca la real.

## Auth

Email + código OTP de 6 dígitos (sin contraseña). Busy Me es de **usuario único**: en el
proyecto remoto de Supabase (Fase 1b) se deshabilitará el registro público
(`enable_signup = false`) después de crear la cuenta del dueño; en local el registro queda
abierto para poder probar.

## Zona horaria

Todas las fechas de negocio ("vence en N días", corte de día del tiempo trabajado) se calculan
en `America/Mexico_City`, tanto en la base de datos como en el cliente.

## Documentación

- `docs/PRESET-expo-supabase.md`, `docs/MODULE-supabase-base.md`: lo que trae la plantilla.
- `docs/android-local-build.md`: APK local con `eas build --local`.
- `docs/adr/`: decisiones.
- `CLAUDE.md`: reglas para Claude Code en este repo.
