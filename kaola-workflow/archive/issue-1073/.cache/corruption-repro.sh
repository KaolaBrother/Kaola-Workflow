#!/usr/bin/env bash
# #1073 finalization evidence: a one-byte mutation of an INSTALLED role profile must still be
# detected after the in-body receipt hashes were removed. Fully isolated: every write lands under
# a fresh mktemp HOME/project; nothing touches ~/.claude, ~/.codex, or the repository tree.
#
# Usage: bash corruption-repro.sh <worktree-root> <log-dir>
# Exit 0 when every expectation below holds; non-zero (with the failing step named) otherwise.
set -u
ROOT="${1:?worktree root}"; LOG="${2:?log dir}"
mkdir -p "$LOG"
# macOS TMPDIR ends with '/', which would leave a '//' in the project path; the preflight
# normalizes --project-root, so the trust key written below must be the normalized form too.
TMP="${TMPDIR:-/tmp}"; TMP="${TMP%/}"
HOME_ROOT="$(mktemp -d "$TMP/kaola-1073-home.XXXXXX")"
PROJECT_ROOT="$(mktemp -d "$TMP/kaola-1073-project.XXXXXX")"
PLUGIN="$ROOT/plugins/kaola-workflow"
INSTALLER="$PLUGIN/scripts/install-codex-agent-profiles.js"
PREFLIGHT="$PLUGIN/scripts/kaola-workflow-codex-preflight.js"
fail=0
step() { printf '\n### %s\n' "$1" | tee -a "$LOG/summary.log"; }
expect() { # expect <label> <actual> <expected>
  if [ "$2" = "$3" ]; then printf 'OK   %s: exit=%s (expected %s)\n' "$1" "$2" "$3" | tee -a "$LOG/summary.log";
  else printf 'FAIL %s: exit=%s (expected %s)\n' "$1" "$2" "$3" | tee -a "$LOG/summary.log"; fail=1; fi
}
{
  echo "worktree=$ROOT"; echo "head=$(git -C "$ROOT" rev-parse HEAD)"; echo "status=$(git -C "$ROOT" status --porcelain | wc -l | tr -d ' ') dirty paths"
  echo "HOME_ROOT=$HOME_ROOT"; echo "PROJECT_ROOT=$PROJECT_ROOT"; echo "node=$(node --version)"; date -u +%Y-%m-%dT%H:%M:%SZ
} | tee "$LOG/summary.log"

# ---------------------------------------------------------------- Codex (installer + preflight)
step "codex-1 install global+project into isolated HOME"
(cd "$PLUGIN" && HOME="$HOME_ROOT" node "$INSTALLER" --global) >"$LOG/codex-install-global.log" 2>&1; expect codex-install-global $? 0
mkdir -p "$HOME_ROOT/.codex"
printf '[features.multi_agent_v2]\nenabled = true\n\n[projects.%s]\ntrust_level = "trusted"\n' "\"$PROJECT_ROOT\"" >> "$HOME_ROOT/.codex/config.toml"
(cd "$PLUGIN" && HOME="$HOME_ROOT" node "$INSTALLER" "$PROJECT_ROOT") >"$LOG/codex-install-project.log" 2>&1; expect codex-install-project $? 0
PROFILE="$PROJECT_ROOT/.codex/agents/kaola-workflow/code-reviewer.toml"
MANIFEST="$PROJECT_ROOT/.codex/agents/kaola-workflow/.kaola-managed-profiles.json"
echo "installed_profile=$PROFILE" | tee -a "$LOG/summary.log"
cp "$PROFILE" "$LOG/code-reviewer.toml.canonical"; cp "$MANIFEST" "$LOG/kaola-managed-profiles.json"
grep -c -E '[0-9a-f]{64}' "$PROFILE" >"$LOG/codex-hex-lines.txt" 2>&1; expect "codex-installed-profile-has-no-64hex-line (grep -c exit 1 == zero matches)" $? 1
node -e 'const m=require(process.argv[1]); if ("profile_contracts" in m) process.exit(2); process.exit(0)' "$MANIFEST"; expect codex-manifest-has-no-profile_contracts $? 0

step "codex-2 baseline preflight on pristine install"
(cd "$PLUGIN" && HOME="$HOME_ROOT" KAOLA_CODEX_VERSION=0.145.0 node "$PREFLIGHT" --project-root "$PROJECT_ROOT" --home "$HOME_ROOT" --no-autofix --json) >"$LOG/codex-preflight-baseline.json" 2>"$LOG/codex-preflight-baseline.stderr"; expect codex-preflight-baseline $? 0

step "codex-3 mutate one byte in the installed body (R -> r in '# Code Reviewer')"
node -e 'const fs=require("fs");const p=process.argv[1];const t=fs.readFileSync(p,"utf8");const n=t.replace("# Code Reviewer","# Code reviewer");if(n===t)process.exit(3);fs.writeFileSync(p,n)' "$PROFILE"; expect codex-mutation-applied $? 0
cmp -s "$PROFILE" "$LOG/code-reviewer.toml.canonical"; expect "codex-mutated-differs-from-canonical (cmp exit 1)" $? 1
cp "$PROFILE" "$LOG/code-reviewer.toml.mutated"

step "codex-4 preflight must fail closed (expected exit 1, status profiles_stale, both reasons)"
(cd "$PLUGIN" && HOME="$HOME_ROOT" KAOLA_CODEX_VERSION=0.145.0 node "$PREFLIGHT" --project-root "$PROJECT_ROOT" --home "$HOME_ROOT" --no-autofix --json) >"$LOG/codex-preflight-mutated.json" 2>"$LOG/codex-preflight-mutated.stderr"; expect codex-preflight-mutated $? 1
node -e '
const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const reasons=(r.stale_profiles||[]).flatMap(e=>e.reasons||[]);
console.log("status="+r.status); console.log("reasons="+JSON.stringify(reasons));
if(r.status!=="profiles_stale")process.exit(4);
if(!reasons.some(x=>x.startsWith("profile_bytes_mismatch")))process.exit(5);
if(!reasons.some(x=>x.startsWith("manifest_file_hash_mismatch")))process.exit(6);
' "$LOG/codex-preflight-mutated.json" | tee -a "$LOG/summary.log"; expect codex-preflight-mutated-reasons ${PIPESTATUS[0]} 0

step "codex-5 default preflight (autofix) restores canonical bytes"
(cd "$PLUGIN" && HOME="$HOME_ROOT" KAOLA_CODEX_VERSION=0.145.0 node "$PREFLIGHT" --project-root "$PROJECT_ROOT" --home "$HOME_ROOT" --json) >"$LOG/codex-preflight-autofix.json" 2>"$LOG/codex-preflight-autofix.stderr"; expect codex-preflight-autofix $? 0
cmp -s "$PROFILE" "$LOG/code-reviewer.toml.canonical"; expect codex-autofix-restored-canonical $? 0

# ---------------------------------------------------------------- Claude (install.sh)
step "claude-1 install into isolated HOME"
(cd "$ROOT" && HOME="$HOME_ROOT" bash install.sh --yes --forge=github --no-settings-merge) >"$LOG/claude-install-1.log" 2>&1; expect claude-install-1 $? 0
CPROFILE="$HOME_ROOT/.claude/agents/code-reviewer.md"
CMANIFEST="$HOME_ROOT/.claude/agents/.kaola-workflow-agent-manifest"
echo "installed_profile=$CPROFILE" | tee -a "$LOG/summary.log"
cp "$CPROFILE" "$LOG/code-reviewer.md.canonical"; cp "$CMANIFEST" "$LOG/kaola-workflow-agent-manifest.tsv"
grep -c -E '[0-9a-f]{64}' "$CPROFILE" >"$LOG/claude-hex-lines.txt" 2>&1; expect "claude-installed-profile-has-no-64hex-line (grep -c exit 1 == zero matches)" $? 1
grep -q 'filesystem bytes only; runtime prompt loading is not attested' "$LOG/claude-install-1.log"; expect claude-proof-boundary-line $? 0
node -e '
const fs=require("fs");const gen=require(process.argv[1]);const tsv=fs.readFileSync(process.argv[2],"utf8").trim().split("\n");
const row=tsv.find(l=>l.startsWith("code-reviewer.md\t")).split("\t");
const e=gen.manifestProfileEntry("claude","code-reviewer");
const installed=fs.readFileSync(process.argv[3]);
console.log("tsv_installed_sha256="+row[1]); console.log("tsv_version="+row[2]); console.log("tsv_behavior_sha256="+row[3]); console.log("tsv_source_sha256="+row[4]);
if(row[1]!==gen.sha256(installed))process.exit(7);
if(row[3]!==e.behavior_sha256||row[4]!==e.resolved_profile_sha256||row[2]!==String(e.behavior_contract_version))process.exit(8);
' "$ROOT/scripts/generate-agent-profiles.js" "$CMANIFEST" "$CPROFILE" | tee -a "$LOG/summary.log"; expect claude-tsv-binds-installed-and-sidecar ${PIPESTATUS[0]} 0

step "claude-2 mutate one byte in the installed body; reinstall must NOT overwrite (user-owned/modified preserved)"
node -e 'const fs=require("fs");const p=process.argv[1];const t=fs.readFileSync(p,"utf8");const n=t.replace("# Code Reviewer","# Code reviewer");if(n===t)process.exit(3);fs.writeFileSync(p,n)' "$CPROFILE"; expect claude-mutation-applied $? 0
cp "$CPROFILE" "$LOG/code-reviewer.md.mutated"
(cd "$ROOT" && HOME="$HOME_ROOT" bash install.sh --yes --forge=github --no-settings-merge) >"$LOG/claude-install-2.log" 2>&1; expect claude-install-2 $? 0
grep -F "Skipped agent with existing user-owned or modified file: $CPROFILE" "$LOG/claude-install-2.log" | tee -a "$LOG/summary.log"; expect claude-modified-profile-skipped ${PIPESTATUS[0]} 0
cmp -s "$CPROFILE" "$LOG/code-reviewer.md.mutated"; expect claude-modified-bytes-preserved $? 0

step "claude-3 corrupted SOURCE must fail closed at install (agent_source_digest_mismatch)"
SRC_COPY="$(mktemp -d "$TMP/kaola-1073-src.XXXXXX")"
git -C "$ROOT" archive HEAD | tar -x -C "$SRC_COPY"
cp "$ROOT/agents/generated-agent-manifest.json" "$SRC_COPY/agents/generated-agent-manifest.json"
node -e 'const fs=require("fs");const p=process.argv[1];const t=fs.readFileSync(p,"utf8");const n=t.replace("# Code Reviewer","# Code reviewer");if(n===t)process.exit(3);fs.writeFileSync(p,n)' "$SRC_COPY/agents/code-reviewer.md"; expect claude-source-mutation-applied $? 0
HOME2="$(mktemp -d "$TMP/kaola-1073-home2.XXXXXX")"
(cd "$SRC_COPY" && HOME="$HOME2" bash install.sh --yes --forge=github --no-settings-merge) >"$LOG/claude-install-corrupt-source.log" 2>&1; rc=$?
expect "claude-install-corrupt-source (non-zero)" "$([ "$rc" -ne 0 ] && echo nonzero || echo 0)" nonzero
grep -E 'Agent source profile verification failed|agent_source_digest_mismatch|agent profile drift' "$LOG/claude-install-corrupt-source.log" | head -3 | tee -a "$LOG/summary.log"; expect claude-corrupt-source-reason-logged ${PIPESTATUS[0]} 0

echo | tee -a "$LOG/summary.log"
echo "isolated roots (left in place for inspection): $HOME_ROOT $PROJECT_ROOT $SRC_COPY $HOME2" | tee -a "$LOG/summary.log"
echo "overall=$([ "$fail" -eq 0 ] && echo PASS || echo FAIL)" | tee -a "$LOG/summary.log"
exit "$fail"
