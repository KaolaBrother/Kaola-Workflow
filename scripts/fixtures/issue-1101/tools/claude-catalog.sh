#!/usr/bin/env bash
# Regenerate the Claude released-profile catalog (#1101; see ../PROVENANCE.md).
# Not run by any suite: the catalog is frozen in scripts/kaola-workflow-retired-agents.js.
#
# Usage: claude-catalog.sh <repo> [<last-commit>=46fbe12d] > rows.tsv
# Rows: claude<TAB>source<TAB>file<TAB>sha256<TAB>commit, where source is
#   blob       a git blob tracked at agents/<role>.md (the earliest installers copied it verbatim);
#   installed  a file that commit's own install.sh wrote into an empty sandbox ~/.claude/agents
#              (later installers rewrote frontmatter, e.g. `model: inherit`, while copying).
# Commits are every commit reachable from <last> that touched agents/, install.sh, or the
# profile generator and its sources, so every install.sh transform of every agents/ state is run.
set -uo pipefail
REPO="$1"; LAST="${2:-46fbe12d}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/kw-claude-catalog.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
NODE_DIR="$(dirname "$(command -v node)")"

for c in $(git -C "$REPO" rev-list --reverse "$LAST" -- agents); do
  git -C "$REPO" ls-tree "$c" agents/ | awk '$2 == "blob" && $4 ~ /\.md$/ {print $3 "\t" $4}' |
    while IFS=$'\t' read -r blob rel; do
      printf 'claude\tblob\t%s\t%s\t%s\n' "${rel#agents/}" \
        "$(git -C "$REPO" cat-file blob "$blob" | shasum -a 256 | awk '{print $1}')" "$c"
    done
done

for c in $(git -C "$REPO" rev-list --reverse "$LAST" -- agents install.sh scripts/generate-agent-profiles.js templates/agents); do
  d="$WORK/t"; h="$WORK/home"; rm -rf "$d" "$h"; mkdir -p "$d" "$h"
  git -C "$REPO" archive "$c" | tar -x -C "$d"
  [[ -f "$d/install.sh" && -d "$d/agents" ]] || { echo "skip $c (no install.sh or agents/)" >&2; continue; }
  (cd "$d" && git init -q && git -c user.name=x -c user.email=x@x commit -q --allow-empty -m x) >/dev/null 2>&1
  # A sandbox HOME and a cut PATH: nothing here can reach a real ~/.claude.
  (cd "$d" && yes | env -i HOME="$h" PATH="$NODE_DIR:/usr/bin:/bin:/usr/sbin:/sbin" \
      bash install.sh --yes >/dev/null 2>&1) || echo "install exited non-zero $c" >&2
  if [[ ! -d "$h/.claude/agents" ]]; then echo "no agents installed $c" >&2; continue; fi
  for f in "$h/.claude/agents/"*.md; do
    [[ -f "$f" ]] || continue
    printf 'claude\tinstalled\t%s\t%s\t%s\n' "$(basename "$f")" "$(shasum -a 256 "$f" | awk '{print $1}')" "$c"
  done
done
