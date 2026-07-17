---
name: kaola-workflow-review
description: Use when Phase 4 tasks are complete and Kaola-Workflow for Codex, also called kaola-workflow, needs quality review, optional security review, and review-fix routing.
---

<!-- PIN: codex-profile-preflight -->
## Codex Profile Freshness Gate

On every entry or resume into this skill, before any role probe, retry, re-plan,
or real dispatch, run the normal preflight gate, not `--doctor`. Resolve exactly
one enabled installed Kaola edition from `codex plugin list --json`, then execute
the bundled `kaola-workflow-codex-preflight.js` from that edition's exact
marketplace/name/version cache tuple.
Never search `$PWD/plugins` or select the lexically first cache entry:

```bash
if ! KAOLA_CODEX_PLUGIN_LIST_OUT="$(codex plugin list --json 2>&1)"; then
  printf 'profile_preflight_refused: plugin metadata unavailable: %s\n' "$KAOLA_CODEX_PLUGIN_LIST_OUT" >&2
  exit 1
fi
if ! KAOLA_CODEX_PLUGIN_META="$(node -e '
const value=JSON.parse(process.argv[1]);
const allowed=new Set(["kaola-workflow","kaola-workflow-gitlab","kaola-workflow-gitea"]);
const rows=(Array.isArray(value.installed)?value.installed:[]).filter(row => row && row.installed === true && row.enabled === true && allowed.has(row.name));
if(rows.length!==1)throw new Error(`expected exactly one enabled installed Kaola edition; got ${rows.length}`);
const row=rows[0];
for(const [label,item] of [["marketplace",row.marketplaceName],["name",row.name],["version",row.version]])if(typeof item!=="string"||item==="."||item===".."||!/^[A-Za-z0-9._-]+$/.test(item))throw new Error(`unsafe ${label}`);
if(row.pluginId!==`${row.name}@${row.marketplaceName}`)throw new Error("plugin identity mismatch");
process.stdout.write([row.marketplaceName,row.name,row.version].join("\t"));
' "$KAOLA_CODEX_PLUGIN_LIST_OUT" 2>&1)"; then
  printf 'profile_preflight_refused: invalid plugin metadata: %s\n' "$KAOLA_CODEX_PLUGIN_META" >&2
  exit 1
fi
IFS=$'\t' read -r KAOLA_CODEX_MARKETPLACE KAOLA_CODEX_PLUGIN_NAME KAOLA_CODEX_PLUGIN_VERSION <<< "$KAOLA_CODEX_PLUGIN_META"
KAOLA_CODEX_CACHE_ROOT="$HOME/.codex/plugins/cache"
if ! KAOLA_CODEX_PREFLIGHT="$(node -e '
const fs=require("fs"),path=require("path");
const [home,base,marketplace,name,version]=process.argv.slice(1);
const resolvedHome=path.resolve(home),resolvedBase=path.resolve(base);
if(resolvedBase!==path.join(resolvedHome,".codex","plugins","cache"))throw new Error("plugin cache root escapes HOME");
let cursor=resolvedHome;
const homeStat=fs.lstatSync(cursor);
if(homeStat.isSymbolicLink()||!homeStat.isDirectory())throw new Error("HOME is unsafe");
const parts=[".codex","plugins","cache",marketplace,name,version,"scripts","kaola-workflow-codex-preflight.js"];
for(let index=0;index<parts.length;index+=1){
  cursor=path.join(cursor,parts[index]);
  const stat=fs.lstatSync(cursor);
  if(stat.isSymbolicLink())throw new Error(`symlink cache component: ${cursor}`);
  if(index<parts.length-1&&!stat.isDirectory())throw new Error(`non-directory cache component: ${cursor}`);
  if(index===parts.length-1&&!stat.isFile())throw new Error(`preflight is not a regular file: ${cursor}`);
}
process.stdout.write(cursor);
' "$HOME" "$KAOLA_CODEX_CACHE_ROOT" "$KAOLA_CODEX_MARKETPLACE" "$KAOLA_CODEX_PLUGIN_NAME" "$KAOLA_CODEX_PLUGIN_VERSION" 2>&1)"; then
  printf 'profile_preflight_refused: exact active preflight unavailable: %s\n' "$KAOLA_CODEX_PREFLIGHT" >&2
  exit 1
fi
KAOLA_CODEX_PREFLIGHT_ARGS=(--project-root "$PWD" --no-autofix --json)
if [ -n "${KAOLA_CODEX_PREFLIGHT_PLAN:-}" ]; then
  KAOLA_CODEX_PREFLIGHT_ARGS+=(--plan "$KAOLA_CODEX_PREFLIGHT_PLAN")
fi
if ! KAOLA_CODEX_PREFLIGHT_OUT="$(node "$KAOLA_CODEX_PREFLIGHT" "${KAOLA_CODEX_PREFLIGHT_ARGS[@]}" 2>&1)"; then
  printf 'profile_preflight_refused: %s\n' "$KAOLA_CODEX_PREFLIGHT_OUT" >&2
  exit 1
fi
if ! KAOLA_CODEX_PREFLIGHT_STATUS="$(node -e 'const v=JSON.parse(process.argv[1]);if(typeof v.status!=="string")throw new Error("missing status");process.stdout.write(v.status)' "$KAOLA_CODEX_PREFLIGHT_OUT" 2>&1)"; then
  printf 'profile_preflight_refused: malformed preflight result: %s\n' "$KAOLA_CODEX_PREFLIGHT_STATUS" >&2
  exit 1
fi
if [ "$KAOLA_CODEX_PREFLIGHT_STATUS" != ok ]; then
  printf 'profile_preflight_refused: %s\n' "$KAOLA_CODEX_PREFLIGHT_OUT" >&2
  exit 1
fi
```

The exact active cache root is
`$HOME/.codex/plugins/cache/$KAOLA_CODEX_MARKETPLACE/$KAOLA_CODEX_PLUGIN_NAME/$KAOLA_CODEX_PLUGIN_VERSION`.
The base invocation is `--project-root "$PWD" --no-autofix --json`; the gate
merges persisted config from HOME through the repository root to `"$PWD"`. When this
skill owns a frozen adaptive plan, set `KAOLA_CODEX_PREFLIGHT_PLAN` to that
exact plan before running the block so `--plan` is also enforced. Continue only
after exit 0 and parsed `status: "ok"`. Exact-byte drift such as
`profile_bytes_mismatch` is `profile_preflight_refused`: STOP before any
`agents.spawn_agent` call, never record `subagent-invoked`, and do not relabel
profile/config drift as tool unavailability or local fallback. Re-run the gate if the installed profile set changes.
<!-- /PIN -->

# Kaola-Workflow Review

Phase 5 reviews completed work. Review findings come first; fixes are implemented only after classification.


## Goal Contract

Continue until quality review, conditional security review, review-fix routing,
and `phase5-review.md` are complete, then update `workflow-state.md` with
`next_skill: kaola-workflow-finalize {project}`. Stop only for true external
authorization, materially user-owned choices, or ambiguity that blocks
correctness.

## Inputs


Read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase3-plan.md
kaola-workflow/{project}/phase4-progress.md
```

<!-- PIN: full-review-fix-loop-parity -->
## Review/Fix Loop Contract

Before any resume action, require `phase4-progress.md` to exist and inspect its
`## Tasks` table. The table must contain at least one task row and every task
status must be `complete`. If the file is missing, the table is empty, or any
task is not complete, refuse Phase 5 and route back to
`kaola-workflow-execute {project}`.

### Evidence-Bound Role Dispatch

The generated reviewer and fix profiles are durable-result roles. Before every
initial review, delegated fix, or re-review, seed only the evidence-binding
header in the exact canonical target; the orchestration must never synthesize
reviewer evidence or copy a compact agent return into that file. The seeded
first line is exactly `evidence-binding: <node-id> <nonce>`, where the node id
identifies this Phase 5 action and the nonce is freshly generated for this
dispatch. Reject an existing symlink, directory, or target outside
`kaola-workflow/{project}/.cache/`; do not follow or replace it.

Use these exact evidence targets:

- quality review and every quality re-review:
  `kaola-workflow/{project}/.cache/code-reviewer.md`
- security review and every security re-review:
  `kaola-workflow/{project}/.cache/security-reviewer.md`
- delegated fix number `{n}`:
  `kaola-workflow/{project}/.cache/review-fix-{n}.md`

Pass the exact `dispatch.evidence_file` in the isolated spawn prompt. Quality
review and every quality re-review use this control-plane shape:

```yaml
agents.spawn_agent:
  task_name: "phase5_code_review_{iteration}"
  agent_type: "code-reviewer"
  fork_turns: "none"
  message: "Repository root: <absolute-root>. Project: {project}. Review only; do not edit product files. Read and preserve the seeded evidence-binding header and write the FULL structured review below it. Compatibility context: for approval, the durable body MUST contain the approval receipt with exactly one column-zero domain_outcome: approved, exactly one column-zero verdict: pass, exactly one column-zero findings_blocking: 0, exactly one column-zero review_summary: no_blocking_findings, exactly one column-zero review_attestation: full_review_completed, and exactly one final column-zero review_conclusion: <substantive prose>. Emit the attestation and conclusion only after completing the full review; the conclusion text after the prefix must contain at least 24 Unicode letter/number characters and four word tokens. The entire durable body must not contain control, format, Unicode line/paragraph separator, or default-ignorable code points, and every machine label and finding gate key must use exact ASCII spelling and delimiters. Every finding token must use a lowercase ASCII key and ASCII = delimiter with a non-whitespace value. Emit every finding as a canonical column-zero finding: row; use the corresponding failing receipt values plus review_summary: blocking_findings_present when changes are requested. Return only the compact profile summary. dispatch.evidence_file=kaola-workflow/{project}/.cache/code-reviewer.md"
```

When the file-risk scan requires security review, the initial pass and every
security re-review use:

```yaml
agents.spawn_agent:
  task_name: "phase5_security_review_{iteration}"
  agent_type: "security-reviewer"
  fork_turns: "none"
  message: "Repository root: <absolute-root>. Project: {project}. Review only; do not edit product files. Read and preserve the seeded evidence-binding header and write the FULL structured security review below it. Compatibility context: for approval, the durable body MUST contain the approval receipt with exactly one column-zero domain_outcome: approved, exactly one column-zero verdict: pass, exactly one column-zero findings_blocking: 0, exactly one column-zero review_summary: no_blocking_findings, exactly one column-zero review_attestation: full_review_completed, and exactly one final column-zero review_conclusion: <substantive prose>. Emit the attestation and conclusion only after completing the full review; the conclusion text after the prefix must contain at least 24 Unicode letter/number characters and four word tokens. The entire durable body must not contain control, format, Unicode line/paragraph separator, or default-ignorable code points, and every machine label and finding gate key must use exact ASCII spelling and delimiters. Every finding token must use a lowercase ASCII key and ASCII = delimiter with a non-whitespace value. Emit every finding as a canonical column-zero finding: row; use the corresponding failing receipt values plus review_summary: blocking_findings_present when changes are requested. Return only the compact profile summary. dispatch.evidence_file=kaola-workflow/{project}/.cache/security-reviewer.md"
```

Route each behavior, implementation, test, or coverage correction with:

```yaml
agents.spawn_agent:
  task_name: "phase5_review_fix_{n}"
  agent_type: "tdd-guide"
  fork_turns: "none"
  message: "Repository root: <absolute-root>. Project: {project}. Fix the assigned admitted review finding inside the approved write set, run narrow RED -> GREEN validation, preserve the seeded evidence-binding header, and write the FULL structured fix result below it. dispatch.evidence_file=kaola-workflow/{project}/.cache/review-fix-{n}.md"
```

Route each build, type, lint, dependency, or tooling correction with the same
canonical fix target and:

```yaml
agents.spawn_agent:
  task_name: "phase5_review_fix_{n}"
  agent_type: "build-error-resolver"
  fork_turns: "none"
  message: "Repository root: <absolute-root>. Project: {project}. Fix the assigned admitted tooling finding inside the approved write set, run narrow validation, preserve the seeded evidence-binding header, and write the FULL structured fix result below it. dispatch.evidence_file=kaola-workflow/{project}/.cache/review-fix-{n}.md"
```

After each role returns, verify that the named profile self-wrote a nonempty
body below the unchanged header in the same regular, non-symlink canonical
file. A seed-only file, a changed/missing header, a compact return without the
durable body, or parent-authored review prose is not evidence and must leave the
action incomplete. Before every re-review, replace only the prior canonical
reviewer card with a newly seeded header and fresh nonce, then dispatch the same
named reviewer again; this makes reviewer evidence later than both
`phase4-progress.md` and the newest `.cache/review-fix-*.md`.

Record that exact seeded header in the invoked compliance row's `binding`
field. The transaction compares it byte-for-byte with evidence line 1 and
requires the full substantive role body below it. Every N/A security or fix row
must instead record `binding: n/a`; a missing/changed binding, seed-only file,
or compact-summary-only body is unresolved.

Resume from the first incomplete review action:

- `.cache/code-reviewer.md` missing -> `code-review`
- security-sensitive files touched and `.cache/security-reviewer.md` missing -> `security-review`
- CRITICAL/HIGH review findings unresolved -> `route-review-fixes`
- fix cache exists but reviewer not re-run -> `re-review`
- `phase5-review.md` missing -> `write-phase-file`
- `phase5-review.md` complete -> route to `kaola-workflow-finalize {project}`

The hard gates are invariant: `code-reviewer` is always required. The named
role must be available and invoked; if it is unavailable, stop. A local review is not a substitute,
and neither `local-fallback-explicit` nor
`local-fallback-tool-unavailable` permits Finalization. Conditional security
review is required for security-sensitive changes and its named reviewer must
likewise be invoked. Review fixes are subagent-executed, and CRITICAL and HIGH
findings block Finalization. Save raw review evidence in
`.cache/code-reviewer.md` and, when required, `.cache/security-reviewer.md`.
Do not synthesize reviewer compliance: the Phase 5 packet must include an
explicit compliance array with exactly one `code-reviewer` row. Its status must
be `invoked` or `subagent-invoked`, and its evidence must be the canonical
`.cache/code-reviewer.md`: a nonempty regular, non-symlink file that resolves
inside this project. The array must also contain exactly one
`security-reviewer` row. It must be `invoked`/`subagent-invoked` with the same
canonical `.cache/security-reviewer.md` evidence guarantees, or exact `n/a`/`na`
with a nonempty skip reason documenting the file-risk decision. Missing,
duplicate, undocumented N/A, empty, forged, absolute, traversal, directory, or
symlink evidence must stop Finalization.

The array must additionally contain exactly one `review-fix executors` row.
When fixes ran, record `subagent-invoked`, `local-fallback-explicit`, or
`local-fallback-tool-unavailable`. In that one row, comma-enumerate every
canonical `.cache/review-fix-1.md`, `.cache/review-fix-2.md`, and so on in
strictly ascending numeric order, and comma-enumerate the corresponding exact
bindings in the same order. Any coexisting noncanonical `review-fix-*` name,
including a leading-zero, empty, or nonnumeric suffix, refuses. When no fix ran, record
exact `n/a`/`na`, `binding: n/a`, and exactly `no blocking findings`, `no
CRITICAL/HIGH findings`, or `no CRITICAL/HIGH blocking findings`. Reviewer
evidence must have an mtime strictly greater than both `phase4-progress.md` and
every `.cache/review-fix-*.md`; equal time is stale. Terminal reviewer evidence
must contain exactly one column-zero `domain_outcome: approved`, exactly one
`verdict: pass`, exactly one `findings_blocking: 0`, and exactly one
`review_summary: no_blocking_findings`, exactly one
`review_attestation: full_review_completed`, and exactly one column-zero
`review_conclusion: <substantive prose>` as the final nonempty line. The attestation
and conclusion may be emitted only after the full review; conclusion text after the
prefix must contain at least 24 Unicode letter/number characters and four word tokens. The entire reviewer body must not contain control, format, Unicode line/paragraph separator, or default-ignorable code points. Reserved machine labels and finding gate keys reject unsafe/invisible, recognized compatibility/confusable, and single-Damerau-edit near-spoof variants; ordinary Unicode prose remains non-authoritative. Every canonical finding token must use a lowercase ASCII key and ASCII = delimiter with a non-whitespace value, and any noncanonical line carrying all three assignment-shaped gate keys, or a finding-like label followed by all three alternating key/value pairs, refuses. Reserved receipt
rows are the only mechanical outcome authority, and canonical `finding:` rows are
the only mechanical finding authority; malformed, indented, case-shifted, Unicode-obfuscated, duplicate,
or unknown-vocabulary rows refuse, and any canonical in-scope open fix finding
cannot Finalize. Conclusion presence, position, and minimum shape are mechanical,
but its prose content is retained only as orchestrator context and is not
mechanically classified. Named reviewer
invocation remains required when local fix fallback is authorized or agent
tooling is unavailable; otherwise re-review before Finalization.

Delegate behavior, implementation, test, and coverage corrections to
`tdd-guide`. Delegate build, type, lint, dependency, and tooling corrections to
`build-error-resolver`. Save every fix-agent result to
`.cache/review-fix-{n}.md`. Run or delegate the narrow validation that proves
each correction, including validation after non-trivial review fixes, and
record the command, result, and evidence path. Avoid redundant validation when
unchanged-file evidence is still valid.

## Trivial Inline Edit Exception

The current session may make a one-line or mechanically obvious edit only when
it requires no behavior, API, security, architecture, test-intent, or design
judgment; stays inside the approved Phase 4 write set; fixes only formatting,
an unused import, a typo, import ordering, review-record friction, or an obvious
generated path/name mistake; is recorded; and has affected validation rerun or
valid prior evidence cited. Anything else must use the appropriate fix role.

Before quality review, record `step: code-review` in `workflow-state.md`. After
each CRITICAL fix, re-run relevant reviewer. After any security-sensitive
correction, re-run `security-reviewer`. A HIGH fix must also be re-reviewed
before Finalization. The loop is review -> classify -> delegated fix -> narrow
validation -> re-review -> reassess. After three fix-and-re-review iterations without convergence, stop and ask.
<!-- /PIN -->

## Review Steps

1. Inspect changed files and task evidence.
2. Use the named `code-reviewer` Codex agent role for a detached review pass and record `subagent-invoked` with `.cache/code-reviewer.md` evidence. If that role is unavailable, stop; do not review locally and do not finalize with a local-fallback status.
3. Check correctness, scope, naming, error handling, test coverage, debug statements, and validation evidence.
4. Run a security-sensitive file scan. If auth, payments, user data, filesystem access, external APIs, or secrets changed, use the named `security-reviewer` Codex agent role and record `subagent-invoked` with `.cache/security-reviewer.md` evidence. If that role is unavailable, stop; only a documented `N/A` file-risk decision may omit invocation.
5. Route CRITICAL/HIGH findings back to implementation before Finalization. MEDIUM/LOW findings may become follow-ups.
6. Save raw review output to `.cache/code-reviewer.md` and `.cache/security-reviewer.md` when used.

## Mechanical Review Finalization (script-owned transaction)

The **Review Status** verdict (`PASSED` / `PASSED WITH FOLLOW-UPS`) and the
CRITICAL/HIGH triage are the current session's **judgment**: the session reads
`.cache/code-reviewer.md`, `.cache/security-reviewer.md`, and every
`.cache/review-fix-*.md`, decides whether any CRITICAL or HIGH finding remains
unresolved, and decides the verdict. It also keeps the quality-review and
security-review dispatches and the review-fix routing to `tdd-guide` (behavior
and test fixes) or `build-error-resolver` (build, type, lint, and tooling
fixes). This script never judges severity, grades the review, or dispatches a
role. It mechanically refuses unless Phase 4 tasks are complete, code review
proves invocation, and the unique security row proves invocation or a documented
N/A risk decision; it also refuses a `review_status`
that is not `PASSED` or `PASSED WITH FOLLOW-UPS` (typed refusal, zero mutation).

Once the verdict is decided, the deterministic bookkeeping below — authoring
`phase5-review.md` from the template (the **Review Status** verdict, the
CRITICAL/HIGH/MEDIUM/LOW finding lists, the `## Required Agent Compliance` rows,
fixes-applied, and validation evidence) and advancing the `workflow-state.md`
pointer to `next_skill: kaola-workflow-finalize {project}` (preserving any
existing `## Sink` block byte-for-byte) — is owned by the full-path transaction
script `kaola-workflow-full-advance.js`, not a subagent. The session
runs it directly, handing the decided Review Status and the resolved
CRITICAL/HIGH/MEDIUM/LOW finding lists as a JSON packet on stdin; the script
writes the durable bookkeeping files but copies the verdict and finding lists
exactly as the session hands them — it never restates, softens, upgrades, or
re-grades the verdict, never decides severity, never dispatches `code-reviewer`,
`security-reviewer`, `tdd-guide`, `build-error-resolver`, or any other role,
never routes or applies fixes, and never asks the user. It only enforces the
mechanical Phase 4-complete and reviewer-decision prerequisites before rendering
the phase file and advancing the pointer in crash-safe order, idempotent on
resume. The current session keeps the review judgment and verdict.

Freshly resolve `$KAOLA_SCRIPTS` from exact active plugin metadata in this
shell, then run the transaction:

```bash
if ! KAOLA_CODEX_PLUGIN_LIST_OUT="$(codex plugin list --json 2>&1)"; then
  printf 'profile_preflight_refused: plugin metadata unavailable: %s\n' "$KAOLA_CODEX_PLUGIN_LIST_OUT" >&2; exit 1
fi
if ! KAOLA_CODEX_PLUGIN_META="$(node -e 'const v=JSON.parse(process.argv[1]);const a=new Set(["kaola-workflow","kaola-workflow-gitlab","kaola-workflow-gitea"]);const r=(v.installed||[]).filter(x=>x&&x.installed===true&&x.enabled===true&&a.has(x.name));if(r.length!==1)throw Error("active edition count");const x=r[0];for(const y of [x.marketplaceName,x.name,x.version])if(typeof y!=="string"||y==="."||y===".."||!/^[A-Za-z0-9._-]+$/.test(y))throw Error("unsafe tuple");if(x.pluginId!==`${x.name}@${x.marketplaceName}`)throw Error("identity mismatch");process.stdout.write([x.marketplaceName,x.name,x.version].join("\t"))' "$KAOLA_CODEX_PLUGIN_LIST_OUT" 2>&1)"; then
  printf 'profile_preflight_refused: invalid plugin metadata: %s\n' "$KAOLA_CODEX_PLUGIN_META" >&2; exit 1
fi
IFS=$'\t' read -r KAOLA_CODEX_MARKETPLACE KAOLA_CODEX_PLUGIN_NAME KAOLA_CODEX_PLUGIN_VERSION <<< "$KAOLA_CODEX_PLUGIN_META"
KAOLA_CODEX_CACHE_ROOT="$HOME/.codex/plugins/cache"
case "$KAOLA_CODEX_PLUGIN_NAME" in
  kaola-workflow) KAOLA_FULL_ADVANCE_NAME="kaola-workflow-full-advance.js" ;;
  kaola-workflow-gitlab) KAOLA_FULL_ADVANCE_NAME="kaola-gitlab-workflow-full-advance.js" ;;
  kaola-workflow-gitea) KAOLA_FULL_ADVANCE_NAME="kaola-gitea-workflow-full-advance.js" ;;
  *) printf 'profile_preflight_refused: active Kaola edition is invalid\n' >&2; exit 1 ;;
esac
KAOLA_SCRIPTS="$KAOLA_CODEX_CACHE_ROOT/$KAOLA_CODEX_MARKETPLACE/$KAOLA_CODEX_PLUGIN_NAME/$KAOLA_CODEX_PLUGIN_VERSION/scripts"
KAOLA_FULL_ADVANCE="$KAOLA_SCRIPTS/$KAOLA_FULL_ADVANCE_NAME"
node -e 'const fs=require("fs"),path=require("path");const [home,base,market,name,version,file]=process.argv.slice(1),h=path.resolve(home),b=path.resolve(base);if(b!==path.join(h,".codex","plugins","cache"))process.exit(1);let p=h,s=fs.lstatSync(p);if(s.isSymbolicLink()||!s.isDirectory())process.exit(1);for(const [i,x] of [".codex","plugins","cache",market,name,version,"scripts",file].entries()){p=path.join(p,x);s=fs.lstatSync(p);if(s.isSymbolicLink()||(i<7&&!s.isDirectory())||(i===7&&!s.isFile()))process.exit(1)}' "$HOME" "$KAOLA_CODEX_CACHE_ROOT" "$KAOLA_CODEX_MARKETPLACE" "$KAOLA_CODEX_PLUGIN_NAME" "$KAOLA_CODEX_PLUGIN_VERSION" "$KAOLA_FULL_ADVANCE_NAME" \
  || { printf 'profile_preflight_refused: exact active full-path transaction unavailable\n' >&2; exit 1; }

node "$KAOLA_FULL_ADVANCE" phase5-finalize \
  --project {project} --stdin --json <<'PACKET'
{
  "review_status": "PASSED",
  "code_review_findings": "### CRITICAL\nnone\n### HIGH\nnone\n### MEDIUM/LOW\n<list>",
  "security_review": "ran: yes/no and reason\n### Findings\n<list or none>",
  "fixes_applied": "<list or none>",
  "validation_evidence": "<commands run/delegated/cited, result, evidence path>",
  "followups": "<MEDIUM/LOW deferred or none>",
  "compliance": [
    { "requirement": "code-reviewer", "status": "subagent-invoked", "evidence": ".cache/code-reviewer.md", "binding": "evidence-binding: phase5-code-review-1 <fresh-nonce>" },
    { "requirement": "security-reviewer", "status": "n/a", "binding": "n/a", "skip_reason": "no security-sensitive files in write set" },
    { "requirement": "review-fix executors", "status": "n/a", "binding": "n/a", "skip_reason": "no CRITICAL/HIGH findings" }
  ]
}
PACKET
```

## Phase File

The script writes `kaola-workflow/{project}/phase5-review.md` in this shape
(rendered from the packet); it is reproduced here as the durable contract:

```markdown
# Phase 5 - Review: {project}

## Code Review Findings
### CRITICAL
none
### HIGH
none
### MEDIUM/LOW
...

## Security Review
ran yes/no and reason

## Required Agent Compliance
| Requirement | Status | Evidence | Binding | Skip Reason |
|-------------|--------|----------|---------|-------------|
| code-reviewer | subagent-invoked | .cache/code-reviewer.md | exact seeded binding | |
| security-reviewer | subagent-invoked/N/A | .cache/security-reviewer.md or file-risk scan | exact seeded binding or n/a | reason if N/A |
| review-fix executors | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable/N/A | .cache/review-fix-1.md, .cache/review-fix-2.md, ... | exact binding 1, exact binding 2, ... or n/a | exact allowed reason if N/A |

## Fixes Applied
[list]

## Validation Evidence
[commands run/delegated/cited, result, evidence path]

## Follow-Up Items
[MEDIUM/LOW deferred]

## Review Status
PASSED | PASSED WITH FOLLOW-UPS
```

The compliance rows are Codex role rows: pass an explicit `compliance` array
(one `{requirement,status,evidence,skip_reason}` object per row). Record exactly
one named `code-reviewer` as `subagent-invoked` with its cache evidence. Record
exactly one `security-reviewer` row: `subagent-invoked` with cache evidence when
active, otherwise `n/a` with the file-risk skip reason. Local fallback statuses
cannot complete either named reviewer prerequisite; stop if a required role is
unavailable.

The script then advances `workflow-state.md` to `phase: 5` / `step: complete` /
`next_skill: kaola-workflow-finalize {project}`, PRESERVING any existing
`## Sink` block byte-for-byte.
