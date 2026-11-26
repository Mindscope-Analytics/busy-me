#!/usr/bin/env bash
# private-terms.sh — biblioteca compartida de la compuerta de términos privados de Busy Me.
# La usan .githooks/commit-msg, pre-commit, pre-push y .claude/hooks/private-terms.sh.
#
# Este repo es PÚBLICO. Todo texto que llega a GitHub (mensajes de commit, nombres de rama
# y de archivo, contenido commiteado, títulos y cuerpos de PR/issue) se compara contra una
# lista PRIVADA que vive fuera del repo: ~/.config/busy-me/private-terms.txt
# (ruta alternativa por BUSYME_PRIVATE_TERMS; lo usan los tests con una lista ficticia).
#
# Reglas de comparación:
#   · palabra completa (grep -w), sin distinguir mayúsculas (-i) ni acentos: términos y texto
#     se normalizan con iconv -f utf-8 -t ascii//TRANSLIT ("Andrés" cubre "Andres" y viceversa).
#   · patrones fijos (-F): un término no es una expresión regular.
#   · se ignoran líneas vacías y las que empiezan con #.
#   · fail-closed: si la lista no existe, se rechaza con un mensaje claro, salvo
#     BUSYME_ALLOW_NO_TERMS=1 (CI y entornos sin la lista).
#   · nunca se imprime el término encontrado, solo "contiene un término privado".
set -u

PRIVATE_TERMS_FILE="${BUSYME_PRIVATE_TERMS:-$HOME/.config/busy-me/private-terms.txt}"

pt_red()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }

# Normaliza stdin: sin acentos (translit a ASCII), en minúsculas y con espacios repetidos colapsados.
pt_normalize() {
  # -c: descarta bytes que no son UTF-8 válido y SIGUE (sin -c iconv se detiene ahí y el
  # resto del texto quedaría sin comparar; hallazgo de claude-review en el PR 3).
  LC_ALL=C.UTF-8 iconv -c -f utf-8 -t ascii//TRANSLIT 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -s ' \t' ' '
}

# Devuelve 0 si la lista está disponible (o si se permite seguir sin ella), 1 si hay que
# rechazar. Deja la lista normalizada en $PT_TERMS (archivo temporal) o vacía si no hay lista.
PT_TERMS=""
pt_load_terms() {
  if [ ! -r "$PRIVATE_TERMS_FILE" ]; then
    if [ "${BUSYME_ALLOW_NO_TERMS:-0}" = "1" ]; then
      PT_TERMS=""
      return 0
    fi
    pt_red "private-terms: BLOQUEADO. No existe la lista privada de términos."
    pt_red "  Esperada en: $PRIVATE_TERMS_FILE (un término por línea; # comenta). Ver README → 'Términos privados'."
    pt_red "  Solo en CI o entornos sin lista: BUSYME_ALLOW_NO_TERMS=1."
    return 1
  fi
  PT_TERMS="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$PT_TERMS'" EXIT
  tr -d '\r' < "$PRIVATE_TERMS_FILE" | grep -vE '^[[:space:]]*(#|$)' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | pt_normalize | grep -v '^$' > "$PT_TERMS" || true
  return 0
}

# pt_text_has_term: lee texto por stdin; 0 si contiene algún término, 1 si no.
pt_text_has_term() {
  [ -n "$PT_TERMS" ] && [ -s "$PT_TERMS" ] || { cat >/dev/null; return 1; }
  pt_normalize | grep -qiwFf "$PT_TERMS"
}

# pt_check <etiqueta> : lee stdin; si hay término, imprime el rechazo (sin el término) y
# devuelve 1.
pt_check() {
  local label="$1"
  if pt_text_has_term; then
    pt_red "private-terms: BLOQUEADO. $label contiene un término privado."
    pt_red "  Este repo es público: usa descripciones genéricas (área, solicitante, tarea)."
    return 1
  fi
  return 0
}
