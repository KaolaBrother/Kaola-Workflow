#!/usr/bin/env bash
# Regenerate one additive runtime's released-render catalog (#1101; see ../PROVENANCE.md).
# Not run by any suite: the catalogs are frozen in scripts/kaola-workflow-retired-agents.js.
#
# Usage: render-edition-catalog.sh <repo> <runtime> <first-commit> [<last-commit>=46fbe12d] > rows.tsv
#   runtime: grok | cursor | zcode | devin | kimi | opencode
# Rows: runtime<TAB>tree<TAB>path-in-tree<TAB>sha256<TAB>commit
set -uo pipefail
REPO="$1"; RT="$2"; FIRST="$3"; LAST="${4:-46fbe12d}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/kw-render-catalog.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
for c in $(git -C "$REPO" rev-list --reverse "$FIRST^..$LAST"); do
  d="$WORK/t"; rm -rf "$d"; mkdir -p "$d"
  # Archive only the render inputs present at this commit: a missing pathspec fails the whole archive.
  paths=$(git -C "$REPO" ls-tree --name-only "$c" \
    | grep -E '^(scripts|agents|templates|commands|hooks|plugins|package\.json|opencode\.json|\.opencode)$' | tr '\n' ' ')
  git -C "$REPO" archive "$c" $paths | tar -x -C "$d"
  [[ -f "$d/scripts/sync-$RT-edition.js" ]] || { echo "skip $c (no sync-$RT-edition.js)" >&2; continue; }
  # Its own git root, so the generator's tree root is this scratch dir and never a real checkout.
  (cd "$d" && git init -q && git -c user.name=x -c user.email=x@x commit -q --allow-empty -m x) >/dev/null 2>&1
  for f in github gitlab gitea; do
    (cd "$d" && HOME="$WORK/home" node "scripts/sync-$RT-edition.js" --forge="$f" --write >/dev/null 2>&1) \
      || echo "render failed $c $f" >&2
  done
  (cd "$d" && find . -path './.git' -prune -o -type f \( -path '*/agents/*.md' -o -path '*/agent/*.md' \
      -o -path '*/skills/kaola-role-*/SKILL.md' \) -print) | while read -r a; do
    case "$a" in ./scripts/*|./agents/*|./plugins/*|./templates/*|./commands/*|./hooks/*) continue ;; esac
    rel="${a#./}"
    printf '%s\t%s\t%s\t%s\t%s\n' "$RT" "${rel%%/*}" "${rel#*/}" "$(shasum -a 256 "$d/$rel" | awk '{print $1}')" "$c"
  done
done
