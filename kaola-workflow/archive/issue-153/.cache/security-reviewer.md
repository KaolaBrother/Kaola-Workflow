# security-reviewer — issue-153 (agent a160099e9963b8611, model=opus, 2026-05-22)

## Verdict: NO security issues introduced. All surfaces PASS. 0 CRITICAL/HIGH/MEDIUM/LOW.

Trigger for running: install.sh filesystem writes + new temp-file handling (mktemp/awk/mv).

## Surfaces checked (all PASS, verified empirically)
- Temp file handling: `tmp="$(mktemp)"` (install.sh:265) — unpredictable name in $TMPDIR, O_EXCL + 0600
  perms. `awk > "$tmp" && mv "$tmp" "$dest" || { rm -f "$tmp"; exit 1; }` atomic + correct; awk failure
  leaves $dest intact + removes $tmp. &&/|| correctly pre-empts set -euo pipefail so explicit exit runs.
- Command/path injection: every new expansion double-quoted (cp 264, mv/rm 275, agent_source_file 254-257,
  resolver substitution 391). Agent names from hardcoded REQUIRED_AGENTS (line 39), not user input;
  $SOURCE_AGENTS_DIR from $SCRIPT_DIR (vendored repo, line 36); $PROFILE whitelist-validated common|higher (97-104).
- awk program: fixed inline program; agent file passed as DATA arg, not -f. Content never interpreted as awk.
  Verified: content with system("rm -rf /"), backticks, $(touch /tmp/PWNED) copied verbatim, no execution.
  Rewrite structurally constrained to one model: line inside frontmatter (in_fm && !closed, capped !replaced).
  Managed marker + source-sha256 preserved (F2 test re-asserts marker).
- Privilege/filesystem: writes stay in $AGENTS_DIR (~/.claude/agents) + $TMPDIR. Result perms 0600 (from mktemp)
  — equal-or-more-restrictive than cp of 0644 source, no weakening. Non-findings: cross-fs tmp inherits 0600
  (more restrictive); pre-existing symlink at $dest followed by cp/mv requires prior write access (pre-existing
  risk shape, not introduced).
- Secrets: none in diff. Only literal hashes are SHA256 provenance markers in fixtures, not credentials.
- Node validators / F2 test: regex over fs.readFileSync content; no eval, no shell-out, no injection. Defensive only.

## No findings to report.
