#!/usr/bin/env bash
# private-terms.sh — Hook PreToolUse (matcher "Bash") de Claude Code para Busy Me (repo público).
# Bloquea (exit 2) los comandos que publican texto en GitHub cuando ese texto contiene un
# término de la lista privada (~/.config/busy-me/private-terms.txt):
#   gh pr|issue|release|gist|repo create|edit|comment|review · gh api con cuerpo o POST/PATCH/PUT ·
#   git commit · git checkout -b · git switch -c · git branch <nombre> · git push.
# Revisa el texto del comando y el contenido de los archivos pasados con -F/--body-file/
# --file/--title-file (que es como se escriben los cuerpos largos). Nunca imprime el término.
# Comparte la normalización y la lista con .githooks/private-terms.sh.
set -u
command -v jq >/dev/null 2>&1 || { echo "private-terms: falta jq; bloqueo por seguridad." >&2; exit 2; }
input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=.githooks/private-terms.sh
. "$ROOT/.githooks/private-terms.sh"

# Detección laxa a propósito (claude-review PR 3): no se ancla al subcomando exacto, porque las
# opciones globales (`gh --repo o/r pr create`, `git -C dir commit`, `git -c k=v push`) lo evadían.
# Un falso positivo solo obliga a reescribir el texto; un falso negativo publica un término.
B='(^|[^A-Za-z0-9_./-])'
publishes=0
# gh … pr|issue|release|gist|repo … create|edit|comment|review, con cualquier cosa en medio;
# y gh api con cuerpo (-f/-F/--field/--raw-field/--input) o método de escritura.
printf '%s' "$cmd" | grep -qE "${B}gh +([^ ]+ +)*(pr|issue|release|gist|repo) +([^ ]+ +)*(create|edit|comment|review)( |$)" && publishes=1
printf '%s' "$cmd" | grep -qE "${B}gh +([^ ]+ +)*api( |$)" && printf '%s' "$cmd" | grep -qE "(^| )(-f|-F|--field|--raw-field|--input)[ =]|(^| )(-X|--method)[ =]*(POST|PATCH|PUT)( |$)" && publishes=1
# git … commit|push|switch|checkout|branch, con opciones globales y sus argumentos en medio.
printf '%s' "$cmd" | grep -qE "${B}git +([^ ]+ +)*(commit|push|switch|checkout|branch)( |$)" && publishes=1
[ "$publishes" = 1 ] || exit 0

pt_load_terms || exit 2

deny() { echo "private-terms: BLOQUEADO — $1 contiene un término privado. Reescribe con descripciones genéricas (área, solicitante, tarea)." >&2; exit 2; }

# 1. El texto del comando (con separadores de rama convertidos a espacios para -w).
printf '%s\n' "$cmd" | tr '/_.-' '    ' | pt_text_has_term && deny "el comando"
printf '%s\n' "$cmd" | pt_text_has_term && deny "el comando"

# 2. Archivos referenciados (-F x, --body-file x, --file x, -F=x, --body-file=x).
files="$(printf '%s\n' "$cmd" | grep -oE '(^| )(-F|--body-file|--file|--title-file|-t|--title|-b|--body)[ =]+("[^"]+"|'"'"'[^'"'"']+'"'"'|[^ ]+)' \
  | sed -E 's/^ ?(-F|--body-file|--file|--title-file|-t|--title|-b|--body)[ =]+//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in /*) path="$f" ;; *) path="${cwd:-$PWD}/$f" ;; esac
  if [ -f "$path" ] && [ -r "$path" ]; then
    pt_text_has_term < "$path" && deny "el archivo $f"
  fi
done <<< "$files"
exit 0
