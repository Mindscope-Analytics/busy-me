#!/usr/bin/env bash
# test-private-terms.sh — casos de la compuerta de términos privados (hooks de git + hook de
# Claude Code). Usa una lista FICTICIA en un directorio temporal: jamás la lista real.
# Uso: bash scripts/test-private-terms.sh   (exit 1 si algún caso falla)
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok()   { pass=$((pass+1)); printf '  ok    %-6s %s\n' "$1" "$2"; }
bad()  { fail=$((fail+1)); printf '  FAIL  %-6s %s (exit=%s, esperado %s)\n' "$1" "$2" "$3" "$4"; }
expect() { # expect <esperado> <etiqueta> <descripción> <exit real>
  if [ "$4" = "$1" ]; then ok "$2" "$3"; else bad "$2" "$3" "$4" "$1"; fi
}

# Lista ficticia (términos inventados; incluye acento, frase de dos palabras y una sigla corta).
cat > "$TMP/terms.txt" <<'TERMS'
# comentario: se ignora
Zorblax

Quintessa Corp
Fulanito Pérez
XQ
TERMS
export BUSYME_PRIVATE_TERMS="$TMP/terms.txt"
unset BUSYME_ALLOW_NO_TERMS

echo "== commit-msg =="
cm() { printf '%s\n' "$1" > "$TMP/msg"; bash "$ROOT/.githooks/commit-msg" "$TMP/msg" 2>/dev/null; echo $?; }
expect 1 deny  'término exacto'                      "$(cm 'feat: add Zorblax integration')"
expect 1 deny  'mayúsculas'                          "$(cm 'feat: ZORBLAX')"
expect 1 deny  'acento en texto, sin acento en lista (y viceversa)' "$(cm 'fix: reunión con Fulanito Perez')"
expect 1 deny  'frase de dos palabras'               "$(cm 'docs: nota para quintessa   corp' | head -1)"
expect 1 deny  'sigla corta como palabra'            "$(cm 'fix: pantalla XQ')"
expect 0 allow 'sigla dentro de otra palabra'        "$(cm 'fix: pantalla XQL y SXQ')"
expect 0 allow 'término como prefijo de otra palabra' "$(cm 'feat: zorblaxes no cuenta')"
expect 0 allow 'mensaje limpio'                      "$(cm 'feat(board): group tasks by status')"
expect 0 allow 'término solo en comentario del editor' "$(cm '# Zorblax
feat: limpio')"
printf 'feat: ok \xff\xfe y Zorblax\n' > "$TMP/msg"; bash "$ROOT/.githooks/commit-msg" "$TMP/msg" 2>/dev/null; expect 1 deny 'mensaje con bytes no UTF-8 antes del término' "$?"

echo "== fail-closed =="
BUSYME_PRIVATE_TERMS="$TMP/no-existe.txt" bash "$ROOT/.githooks/commit-msg" "$TMP/msg" 2>/dev/null; expect 1 deny 'sin lista → rechaza' "$?"
BUSYME_PRIVATE_TERMS="$TMP/no-existe.txt" BUSYME_ALLOW_NO_TERMS=1 bash "$ROOT/.githooks/commit-msg" "$TMP/msg" 2>/dev/null; expect 0 allow 'sin lista + BUSYME_ALLOW_NO_TERMS=1' "$?"
out="$(BUSYME_PRIVATE_TERMS="$TMP/terms.txt" bash -c 'printf "feat: Zorblax\n" > "$0/m"; bash "$1/.githooks/commit-msg" "$0/m" 2>&1' "$TMP" "$ROOT")"
if printf '%s' "$out" | grep -qi zorblax; then bad deny 'el rechazo NO imprime el término' 'imprimió' 'oculto'; else ok deny 'el rechazo no imprime el término'; fi

echo "== pre-commit (repo temporal, stubs de gitleaks/semgrep/actionlint) =="
mkdir -p "$TMP/bin"; for t in gitleaks semgrep actionlint; do printf '#!/bin/sh\nexit 0\n' > "$TMP/bin/$t"; chmod +x "$TMP/bin/$t"; done
export PATH="$TMP/bin:$PATH"
R="$TMP/repo"; git init -q "$R"; git -C "$R" config user.email t@example.com; git -C "$R" config user.name t
pc() { (cd "$R" && bash "$ROOT/.githooks/pre-commit" >/dev/null 2>&1; echo $?); }
stage() { # stage <ruta> <contenido>
  mkdir -p "$R/$(dirname "$1")"; printf '%s' "$2" > "$R/$1"; git -C "$R" add -A >/dev/null
}
reset_index() { git -C "$R" rm -rqf --cached . >/dev/null 2>&1 || true; find "$R" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +; }
stage 'notes/zorblax.md' 'texto limpio';           expect 1 deny  'nombre de archivo con término' "$(pc)"; reset_index
stage 'notes/a.md' 'reunión con Quintessa Corp';   expect 1 deny  'contenido staged con frase'   "$(pc)"; reset_index
stage 'notes/a.md' 'FULANITO PÉREZ';               expect 1 deny  'contenido con acento y mayúsculas' "$(pc)"; reset_index
stage 'notes/a.md' 'xql sxq xq1';                  expect 0 allow 'sigla solo dentro de palabras' "$(pc)"; reset_index
stage 'src/board.ts' 'export const a = 1;';        expect 0 allow 'contenido limpio'              "$(pc)"; reset_index
printf '\x00\x01Zorblax\x02' > "$R/img.bin"; git -C "$R" add -A; expect 0 allow 'binario: no se inspecciona' "$(pc)"; reset_index
printf 'ok \xff\xfe luego Zorblax\n' > "$R/latin.txt"; git -C "$R" add -A; expect 1 deny 'texto con bytes no UTF-8 antes del término' "$(pc)"; reset_index
stage 'notas/año nuevo.md' 'limpio'; git -C "$R" -c core.hooksPath=/dev/null commit -qm base >/dev/null; git -C "$R" mv 'notas/año nuevo.md' 'notas/plan.md'; printf 'ahora con Zorblax' > "$R/notas/plan.md"; git -C "$R" add -A
expect 1 deny 'archivo renombrado (ruta con acento) con término' "$(pc)"; reset_index

echo "== pre-push (nombre de rama) =="
pp() { printf '%s\n' "$1" | bash "$ROOT/.githooks/pre-push" origin >/dev/null 2>&1; echo $?; }
Z="0000000000000000000000000000000000000000"; S="1111111111111111111111111111111111111111"
expect 1 deny  'rama con término (separador -)'   "$(pp "refs/heads/feat/zorblax-login $S refs/heads/feat/zorblax-login $Z")"
expect 1 deny  'rama con término (separador _)'   "$(pp "refs/heads/fix/xq_screen $S refs/heads/fix/xq_screen $Z")"
expect 1 deny  'push a main sigue bloqueado'      "$(pp "refs/heads/main $S refs/heads/main $S")"
# Rama limpia: pasa el filtro de términos y llega a gitleaks (stub → 0).
expect 0 allow 'rama limpia'                      "$(pp "refs/heads/feat/board-ui $S refs/heads/feat/board-ui $Z")"

echo "== hook de Claude Code (PreToolUse Bash) =="
ch() { printf '{"tool_input":{"command":%s},"cwd":"%s"}' "$(printf '%s' "$1" | jq -Rs .)" "$TMP" | CLAUDE_PROJECT_DIR="$ROOT" bash "$ROOT/.claude/hooks/private-terms.sh" >/dev/null 2>&1; echo $?; }
printf 'Resumen\n\nHabla de Quintessa Corp.\n' > "$TMP/body.md"
printf 'Resumen limpio.\n' > "$TMP/clean.md"
expect 2 deny  'gh pr create --title con término'  "$(ch 'gh pr create --title "feat: Zorblax" --body x')"
expect 2 deny  'gh pr comment con término'         "$(ch 'gh pr comment 3 --body "visto con fulanito perez"')"
expect 2 deny  'gh issue create con término'       "$(ch 'gh issue create -t "XQ roto" -b "detalle"')"
expect 2 deny  'gh pr edit -R con término'         "$(ch 'gh pr edit -R org/repo 3 --title "Zorblax"')"
expect 2 deny  'git commit -m con término'         "$(ch 'git commit -m "feat: add zorblax"')"
expect 2 deny  'git checkout -b con término'       "$(ch 'git checkout -b feat/zorblax-sync')"
expect 2 deny  'git switch -c con término'         "$(ch 'git switch -c fix/xq-crash')"
expect 2 deny  'git push de rama con término'      "$(ch 'git push -u origin feat/zorblax')"
expect 2 deny  'gh pr create -F archivo con término' "$(ch 'gh pr create --title "feat: tablero" -F body.md')"
expect 2 deny  'git commit -F archivo con término' "$(ch 'git commit -F body.md')"
expect 0 allow 'gh pr create -F archivo limpio'    "$(ch 'gh pr create --title "feat: tablero" -F clean.md')"
expect 0 allow 'gh pr create limpio'               "$(ch 'gh pr create --title "feat(board): tablero Ahora" --body "Agrupa tareas por estado"')"
expect 0 allow 'git commit limpio'                 "$(ch 'git commit -m "fix(ui): botones de 44 px"')"
expect 0 allow 'comando que no publica (ls)'       "$(ch 'ls zorblax')"
expect 0 allow 'comando que no publica (grep)'     "$(ch 'grep -rn "Zorblax" .')"
expect 0 allow 'gh pr view (lectura)'              "$(ch 'gh pr view 3')"
BUSYME_PRIVATE_TERMS="$TMP/no-existe.txt" bash -c 'printf "{\"tool_input\":{\"command\":\"git commit -m x\"}}" | CLAUDE_PROJECT_DIR="$0" bash "$0/.claude/hooks/private-terms.sh" >/dev/null 2>&1' "$ROOT"; expect 2 deny 'sin lista → bloquea (fail-closed)' "$?"
out="$(ch 'git commit -m "feat: Zorblax"' 2>&1; printf '{"tool_input":{"command":"git commit -m \"feat: Zorblax\""}}' | CLAUDE_PROJECT_DIR="$ROOT" bash "$ROOT/.claude/hooks/private-terms.sh" 2>&1)"
if printf '%s' "$out" | grep -qi zorblax; then bad deny 'el hook no imprime el término' 'imprimió' 'oculto'; else ok deny 'el hook no imprime el término'; fi

echo; echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
