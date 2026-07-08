evidence-binding: n1-architect 416c5fde30b3
## Architecture: bundle-642-643-644 — durable node channel (#642) + per-role evidence contract (#643) + two #641 scheduler residuals (#644)

This blueprint is authoritative for every downstream node. It carries verified file/line anchors against the CURRENT worktree tree (line refs re-confirmed post-#641; several drifted from the issue text — corrections noted inline). Every downstream node reads ONLY this blueprint plus the frozen Plan Notes.

files_to_create: docs/decisions/D-642-01.md, docs/decisions/D-643-01.md, docs/decisions/D-644-01.md (n10; no new scripts — every mechanism extends an existing file)
files_to_modify: see "Files to Modify (by node)" table below
build_sequence: n2 (validator grammar+registry) → n3 (adaptive-node channel+close gates+#644) with n4 (agents) ∥ n5 (routing prose) alongside → n6 (enforcement walls) → n7/n8/n9 gates → n10 docs → n11 finalize

---

### Design Decisions

**DD-1 — `## Node Briefs` is a new hash-covered plan section; back-compat is by CONDITIONAL hash-append.** `computePlanHash` (`plan-validator.js:1302-1307`) currently hashes `norm('Meta') + '\n---NODES---\n' + norm(NODES_HEADING)`. Extend it to append `'\n---BRIEFS---\n' + norm('Node Briefs')` **only when the `## Node Briefs` heading is present**. A briefless plan produces a byte-identical hash body → every existing frozen/in-flight plan resume-checks unchanged (AC1 back-compat, and the reason THIS bundle's own frozen plan — which has NO `## Node Briefs` — keeps hashing identically). Presence is detected by a fence-safe column-0 heading probe, not by `sectionBody` (which returns `''` for both absent and empty).

**DD-2 — The brief IS the `goal_line`; upstream_evidence is derived from `depends_on`.** The pre-built unwired `ctx.goal_line` socket (`adaptive-node.js:1262-1264`) is populated from the node's brief; a new conditionally-attached `dispatch.upstream_evidence` array is derived from `depends_on`. Both follow the exact `leg_path` conditional-attach discipline (`adaptive-node.js:1270-1275`) so briefless/root envelopes stay byte-identical.

**DD-3 — The consumed-proof reuses the evidence-binding nonce as an anti-fabrication read-proof.** The card carries `{node_id, role, path}` — **never** the nonce. The nonce lives ONLY on line 1 of the upstream evidence file (`evidence-binding: <id> <nonce>`, re-injected by record-evidence). A correct `upstream_read: <up-id> <nonce>` echo in the consumer's evidence proves the consumer opened the upstream file this open. Recomputed at close from the frozen plan's `depends_on`.

**DD-4 — #643's close-gate enforcement lives in `checkEvidenceShape`, which is in `adaptive-node.js` (n3), NOT the validator (n2).** This is the single most important routing correction (see Per-node routing). Adding `ROLE_TOKEN_REGISTRY` rows (n2) auto-flows to SEEDING + `required_tokens` + `--verify` (all registry-driven), but `checkEvidenceShape` (`adaptive-node.js:929`, the CLOSE gate) has hardcoded role branches with an `else` "non-empty" fallback (`adaptive-node.js:1088-1092`) that does NOT consume the registry for producer roles. #643 V6 (truncated code-architect evidence must REFUSE at close) therefore requires generalizing `checkEvidenceShape` — an `adaptive-node.js` edit = **n3**. n2's rows alone cannot make the close refuse.

**DD-5 — Back-compat for both new close gates: "keys off the seeded stub set," made non-fabricable by record-evidence re-injection.** Generalized `checkEvidenceShape` and `checkUpstreamConsumed` enforce a token ONLY when its column-0 `<key>:` line is PRESENT in the evidence. New-code opens guarantee the keys are present (seed writes them, record-evidence re-injects any the agent dropped, empty). Old in-flight nodes (recorded pre-reinstall) have no such keys and record-evidence won't re-run → exempt. A truncated new-node evidence gets an empty re-injected key → non-empty check fails → refuse. No fabrication hole (V6 holds), no in-flight breakage (AC6). Recorded in D-642-01/D-643-01.

**DD-6 — A live `kind:'gate'` (main-session-gate running-set marker) is an observer for co-open/merge purposes (#644 A1).** The relaxed `write_awaits_drain` else-branch, `tryR2bLeglessCoopen`, and the G4 merge fence must all count a live `kind:'gate'` alongside `kind:'read'` — hold the writer co-open and the last-member merge while a gate is live.

**DD-7 — No new special-case lanes.** Everything composes existing seams: the brief is a plan section (like `## Meta`), the channel fields are conditional dispatch fields (like `leg_path`/`optimize`), the consumed-proof reuses the evidence-binding nonce, the wall reuses the existing agent-validator seam, the prose reuses the routing-generation skeleton/slots.

---

### #642 — Channel design (concrete)

**(a) `## Node Briefs` grammar.** One h3 sub-block per node under the `## Node Briefs` h2:

```
## Node Briefs

### n1-code-architect
Design X. Read the issue + code. Deliverable must contain files_to_create + build_sequence.

### n2-implementer
Implement X per n1's blueprint. Read n1-code-architect's evidence file first. Files: a.js.
```

- **Parser (new validator export `parseNodeBriefs(content)`):** slice the section via `classifier.sectionBody(content, 'Node Briefs')` (fence-aware for the h2 boundary; h3 does not break the section). Scan for `^###\s+(\S+)\s*$` headers (fence-aware, mirroring `sectionBody`'s `fenceRe` so a fenced `### x` inside a brief code block is skipped). For each header, collect body lines until the next `### ` or end. Returns `[{ nodeId, brief }]` where `brief` = block body with leading/trailing blank lines trimmed, internal newlines preserved. `goal_line = brief`. Returns `[]` when the section is absent (byte-for-byte V1 pin depends on this deterministic trimming).
- **Presence helper (new export `nodeBriefsPresent(content)`):** `/^##\s+Node Briefs\s*$/m.test(content)`. Used by `computePlanHash` (conditional append) and as the parse guard.
- **`computePlanHash` extension (`plan-validator.js:1302`):** append `'\n---BRIEFS---\n' + norm('Node Briefs')` iff `nodeBriefsPresent(content)`. Hash coverage picks up briefs automatically for freeze (`validatePlan`→`computePlanHash`), resume (`revalidateForResume:2073`), and governance-ack — a post-freeze brief edit → `revalidateForResume` `plan_hash_mismatch` → the adaptive-node integrity guard (`adaptive-node.js:3717-3719`) emits `plan_integrity_failed` (V4). **Back-compat: briefless plans hash byte-identically to today.**
- **`brief_unknown_node` freeze refusal:** in `validatePlan`, immediately AFTER `const ids = new Set(nodes.map(n => n.id))` (`plan-validator.js:1356`), add an EARLY typed refusal mirroring `speculative_policy_unsupported` (`:1328`): for each `parseNodeBriefs(content)` entry, `if (!ids.has(b.nodeId)) return { result:'refuse', reason:'brief_unknown_node', operator_hint: getOperatorHint('brief_unknown_node',{nodeId:b.nodeId}), errors:['## Node Briefs names unknown node id "'+b.nodeId+'"'], planHash: computePlanHash(content) }`. Add a `REASON`/operator-hint entry (`plan-validator.js:60-113` block). Freeze-only (NOT added to `revalidateForResume` — briefs are hash-covered, so a frozen plan can never carry an unknown-node brief; mirrors the dup-id freeze-only pattern). The handoff (`adaptive-handoff.js:302`) maps validator `result !== 'in-grammar'` → `handoff_status:'plan_invalid'` carrying `validator_verdict.reason='brief_unknown_node'`.

**(b) `buildDispatch` population + new field.** `buildDispatch` (`adaptive-node.js:1228`): `ctx.goal_line` already conditionally attaches (`:1262-1264`) — no change to the builder for goal_line. ADD one conditional-attach block after the `leg_path` block (`:1275`):
```js
if (Array.isArray(ctx.upstream_evidence) && ctx.upstream_evidence.length) {
  d.upstream_evidence = ctx.upstream_evidence;
}
```
ADD a helper `deriveDispatchChannel(planContent, node, project)` → `{ goal_line?, upstream_evidence? }`:
- `goal_line`: `parseNodeBriefs(planContent).find(b => b.nodeId === node.id)?.brief` when non-empty.
- `upstream_evidence`: for each id in the node's `dependsOn` (re-looked-up from `parseNodesFromContent(planContent)` so it never relies on next-action carrying deps), emit `{ node_id: id, role: upNode.role, path: qualifiedEvidenceFile(project, id) }`. `qualifiedEvidenceFile` (`adaptive-node.js:1375`) yields the project-qualified `kaola-workflow/<project>/.cache/<id>.md` — the barrier-exempt band. Absent when `dependsOn` is empty (root node → field not attached).

Wire `...deriveDispatchChannel(planContent, targetNode, project)` into the buildDispatch ctx at all THREE opener call sites:
- `runOpenNext` (`adaptive-node.js:2104-2115`) — `planContent` in scope (`:2061`).
- fused advance in `runCloseAndOpenNext` (`:2612-2623`) — uses `planForAdvance`.
- `runOpenReady` batch (`:4904-4909`) — per-member (each member gets its OWN brief + its OWN upstream list, not shared). Read plan content once for the batch.

**(c) `seedEvidenceFile` upstream pointers.** `seedEvidenceFile` (`adaptive-node.js:589`) already writes registry stubs (registry-driven; n2's rows auto-produce the new content-token stubs). ADD: when the node's role ∈ `IMPLEMENT_ROLES` and it has ≥1 producer-role upstream, append one `upstream_read: <up-id>` stub line per producer upstream (EMPTY — **no nonce**, anti-fabrication). `seedEvidenceFile` has `planPath` → parse nodes + `dependsOn`, import `IMPLEMENT_ROLES`/`PRODUCER_ROLES` from the validator. Mirror the `forceRotate` re-seed path (`:609-625`) so reopen re-emits the stubs.

**(d) Close-time consumed-proof (new `checkUpstreamConsumed`, n3).** After `shapeCheck` passes and BEFORE the barrier shell — in BOTH close paths (`runCloseAndOpenNext:2291-2312` and `runCloseNode:5111-5116`) — call a new helper:
```
checkUpstreamConsumed({ role, nodeId, evidenceContent, nodes, ledgerStatuses, planPath, project, readFile })
  → { ok, hard, reason:'upstream_not_consumed', offending:<up-id>, expectedPath }
```
Logic:
- Compute the node's upstream set from the FROZEN plan's `dependsOn`. **Exemptions:** upstream rows whose ledger status is `n/a` (skipped); root nodes (empty deps → nothing required); non-producer upstreams (no token required).
- For each producer upstream (role ∈ `PRODUCER_ROLES`, status `complete`): read line 1 of `<up-id>.md` → `evidence-binding: <up-id> <nonce>`. Require the consumer evidence to carry a column-0 `upstream_read: <up-id> <nonce>` line matching that nonce.
- **HARD-gate scope:** `role ∈ IMPLEMENT_ROLES` (implementer, tdd-guide, build-error-resolver, metric-optimizer) AND ≥1 producer upstream → missing/mismatched echo ⇒ `{ hard:true }` → close returns `result:'refuse', reason:'upstream_not_consumed', nodeId, offending:<up-id>, expected:<path>` with ZERO ledger mutation (placement before the barrier guarantees this).
- **Advisory:** any other pair (e.g. a gate depending on a producer) → `{ hard:false }`; never blocks — attach a non-blocking `upstream_advisory` field to the success returns (spread like `verdictWarn`) and/or the provenance log.
- **Back-compat (DD-5):** enforce a producer's token only when the `upstream_read: <up-id>` KEY is present in the evidence. record-evidence re-injection (below) guarantees new-code presence; old in-flight consumers lack the key → exempt.
- **reopen/nonce-rotation:** `reopen-node` (`adaptive-node.js:3148`) re-seeds the reopened node with `forceRotate=true` → its line-1 nonce rotates. A consumer that echoed the upstream's OLD nonce → close recompute reads the NEW line-1 nonce → mismatch → `upstream_not_consumed` (V2 neg-2). Reopening the CONSUMER discards its own echo (forceRotate) → the agent must re-read+re-echo.
- **Anti-fabrication invariant:** the card, all three openers, `deriveDispatchChannel`, the seed, and the cached envelope MUST NEVER emit the upstream nonce (V2 neg-3: grep the serialized open envelope for the upstream nonce → absent). Only line 1 of the upstream file carries it.

**(e) record-evidence re-injection (non-droppability, n3).** `runRecordEvidence` (`adaptive-node.js:2196-2202`) currently re-injects only the `evidence-binding` line when absent. EXTEND it to also re-inject MISSING required stub keys as empty lines, SCOPED to: (i) the content-bearing registry tokens for generic-branch roles (NOT tdd-guide/implementer/metric-optimizer/gate roles — re-injecting `RED:`/`GREEN:` empty would false-satisfy their `\bRED\b` presence regexes), and (ii) `upstream_read: <up-id>` keys for producer upstreams of IMPLEMENT_ROLE consumers. This makes the keys non-droppable so the close gates are non-fabricable, while old in-flight nodes (whose record-evidence already ran under old code) stay exempt.

**(f) Resume re-hydration.** NO new opener code beyond the dispatch fields. The `--summary` open path already caches the full result envelope at `.cache/<subcommand>-envelope.json` (`adaptive-node.js:6513-6515`). Once the dispatch card carries `goal_line` + `upstream_evidence`, the in-progress node's re-dispatch materials are durable at `.cache/open-next-envelope.json` / `.cache/close-and-open-next-envelope.json` / `.cache/open-ready-envelope.json` (`result.opened.dispatch`). A fresh-shell `orient --json` finds the in-progress node in the ledger; the resume prose (n5 skeleton + n10 resume card) points the orchestrator at the cached envelope as the AUTHORITATIVE context — do not reconstruct from memory. The walkthrough resume scenario (n3) asserts re-derivation of the same card from the envelope cache (V3).

---

### #643 — Registry + contract design (concrete)

**(a) `ROLE_TOKEN_REGISTRY` rows (n2, `plan-validator.js:198-211`).** Add:
```
'code-architect':       ['evidence-binding', 'files_to_create|files_to_modify', 'build_sequence'],
'code-explorer':        ['evidence-binding', 'findings'],
'knowledge-lookup':     ['evidence-binding', 'findings', 'sources'],
'planner':              ['evidence-binding', 'recommendation'],
'issue-scout':          ['evidence-binding', 'recommendation'],
'build-error-resolver': ['evidence-binding', 'build-green'],
'synthesizer':          ['evidence-binding', 'merge_outcome'],
'doc-updater':          ['evidence-binding', 'docs_updated'],
```
Vocabulary confirmed against code: `files_to_create|files_to_modify` is an ALTERNATION (`|`) → `checkEvidenceShape` semantics = ANY one alternative present satisfies (mirrors implementer's `regression-green|build-green|smoke-integration` and the seed's alternation handling at `seedEvidenceFile:614-622`). The seed writes the first alternative (`files_to_create`) as the stub key. All eight roles reach ≥2 tokens, satisfying the wall's ≥2-token rule with no `PRESENCE_ONLY_RATIONALE` entry.

**(b) `checkEvidenceShape` generalization (n3, `adaptive-node.js:1088-1092`).** Replace the bare "other roles: non-empty" `else` with a registry-driven branch: read `ROLE_TOKEN_REGISTRY[role]`; for each token class beyond `evidence-binding` whose KEY is present (DD-5 back-compat gate) — a single token requires a column-0 `<token>:` line with a non-empty value (the `metric-optimizer` loop at `:1078-1084` is the template), an alternation requires ANY one alternative present (the `implementer` branch at `:1054-1060` is the template). Keep the non-empty fallback for a role with no registry row / no keys present. The tdd-guide/implementer/metric-optimizer/gate branches are UNTOUCHED. This makes V6 (truncated producer evidence → `evidence_shape_failed`) hold at close, `--verify` (`:1421`), and every batch close.

**(c) Canonical evidence-contract TEXT (n4 renders verbatim ×4 editions per role — root `.md` prose + `.toml` inside `developer_instructions = """..."""`; byte-identical ×3 across the plugin editions; forge-neutral; NO issue refs/decision IDs in agent-facing text).**

READ-PRODUCER roles (`code-architect`, `code-explorer`, `knowledge-lookup`, `planner`, `issue-scout`):
> Evidence contract — you are a READ-ONLY role. You CANNOT self-write `.cache` evidence. RETURN your FULL structured deliverable as your final message; the orchestrator persists it verbatim to `kaola-workflow/{project}/.cache/{node-id}.md` via `record-evidence --stdin`, which re-injects this node's `evidence-binding: <node-id> <nonce>` header — never add, alter, or strip that header yourself. Include every content-bearing token your role produces (`<role-tokens>`) with a non-empty value; a lossy one-line paraphrase of a rich deliverable is refused at close.

WRITE roles (`build-error-resolver` → `build-green`; `doc-updater` → `docs_updated`):
> Evidence contract — you are a WRITE-role agent. SELF-WRITE your evidence directly into your seeded `.cache/{node-id}.md`. The seeded file already carries an `evidence-binding: <node-id> <nonce>` header line — read it, preserve it verbatim, never add/alter/strip it, and append your content below. Include every content-bearing token your role produces (`<role-tokens>`) with a non-empty value (a lossy one-line record is refused at close).

The `<role-tokens>` placeholder is filled from the registry row per role. The `upstream_read` consumer instruction is NOT in these files — it rides the n5 routing prose (the orchestrator carries it into every consumer dispatch).

**(d) workflow-planner compact-plan posture (n4, `agents/workflow-planner.md` + 3 `.toml`).** Add:
> Compact-plan posture. Decide per issue whether design needs a dedicated node. Simple issue: author NO `planner`/`code-architect` node — act as the architect yourself and write the implementation direction (files, approach, constraints, gotchas) INTO the implement node's `## Node Briefs` entry so the standard-tier implementer still receives durable reasoning-tier direction. Complex issue: author the design node; the downstream implement node's brief says "read `<design-node>`'s evidence file before starting," and the design node's brief states what its deliverable must contain. Author `## Node Briefs` per node (intent, approach, key constraints, which upstream evidence to read); the section is frozen with the plan.

**(e) Future-agent wall (n6, `validate-vendored-agents.js`).** Add two checks over every node-role agent (its existing `allAgents` list minus orchestration roles `contractor`/`workflow-planner`; import `ROLE_TOKEN_REGISTRY` from the validator — already exported at `plan-validator.js:3337`):
1. **Registry ≥2 tokens** OR membership in a new `PRESENCE_ONLY_RATIONALE` allowlist (map of `role → one-line reason string`; empty after this change).
2. **Role-kind needle**, kind DERIVED from the tool manifest (parse the agent's front-matter `tools:` — Write OR Edit present ⇒ write-kind, else read-kind, NEVER a hand-list): a write-kind `.md` must contain `SELF-WRITE` + `evidence-binding`; a read-kind `.md` must contain the return-for-persistence needle (`RETURN` + `record-evidence`).

Mirror the `.toml` needles in the codex/gitlab/gitea contract validators (they already iterate `pluginRoot + '/agents'` `.toml` files — `validate-kaola-workflow-gitlab-contracts.js:160`). `docs/conventions.md` new-agent checklist gains both items (n10).

**(f) ×6 role-kind enumeration re-derivation (n5 skeleton, `templates/routing/plan-run.skeleton.md:394-403`).** Replace the two stale hardcoded lists (READ-ONLY: `code-explorer, knowledge-lookup, adversarial-verifier, planner`; WRITE: `implementer, tdd-guide, metric-optimizer`) with a manifest-derived sentence: "**any node role without `Write` in its tool manifest** RETURNS its deliverable for orchestrator persistence; **Write-manifest roles SELF-WRITE**," listing the current roster as EXAMPLES only. This is raw skeleton text (renders identically ×6 after forge renames). n6 grep-asserts NO surface still carries the stale 3-role-WRITE / 4-role-READ enumerations.

**AUDIT — exactly which of n4's declared files need edits (verified against the tree):**

| Role (× root `.md` + 3 `.toml`) | Kind (by manifest) | Status | Action |
|---|---|---|---|
| code-architect | read (Read,Grep,Glob,Bash) | NO contract | **ADD read-producer** |
| code-explorer | read | NO contract | **ADD read-producer** |
| knowledge-lookup | read | weak ("Return the" only) | **ADD read-producer** |
| planner | read | NO contract | **ADD read-producer** |
| issue-scout | read | weak ("Return your" only) | **ADD read-producer** |
| build-error-resolver | write (Write,Edit) | NO contract | **ADD write SELF-WRITE** |
| doc-updater | write (Write,Edit) | NO contract | **ADD write SELF-WRITE** |
| synthesizer | write (Write,Edit) | COMPLIANT (has SELF-WRITE + evidence-binding) | **SKIP** (declare with skip-reason) |
| workflow-planner | write/orchestration | n/a (not a node-role evidence contract) | **ADD compact-plan posture** |

→ 8 roles × 4 editions need edits (32 files) + synthesizer × 4 skipped (already compliant). NOT edited by n4 (already compliant, wall-covered): `implementer`, `tdd-guide`, `metric-optimizer`, `code-reviewer`, `security-reviewer`, `adversarial-verifier`.

---

### #644 — A1/A2 exact edits (line refs re-confirmed against the CURRENT tree)

**A1 — count `kind:'gate'` at the three seams (n3, `adaptive-node.js`):**
1. **`liveReadsAtMerge`** — CONFIRMED at **line 5393** (issue: ~5393, exact). Change `.filter(n => n.kind === 'read')` → `.filter(n => n.kind === 'read' || n.kind === 'gate')`. Keep the typed reason `merge_awaits_read_drain` stable (a live gate is treated as a live observer for the merge fence); generalize the `detail` string to mention the held gate. Holds the last-member merge while a gate is live.
2. **Relaxed `write_awaits_drain` else-branch** — the `else {` block at **lines 4580-4644**; `holdDrain` defined at `:4603`. Add, at the TOP of the else-branch (after `holdDrain` is defined at `:4611`, BEFORE `if (!legCoupled)` at `:4612`):
```js
if ((liveNodes || []).some(n => n.kind === 'gate')) return holdDrain('gate_live');
```
This holds the writer co-open while a main-session-gate is live, closing the A1 repro (`{main-session-gate ∥ doc-updater docs/api.md}` → `open-ready` must NOT co-open the writer).
3. **`tryR2bLeglessCoopen`'s live-reads filter** — CONFIRMED at **line 3848** (issue A1 cites `~:4845` — STALE; the function is `3841-3865`, the filter is `3848`). Add a defensive fail-closed at the top of `tryR2bLeglessCoopen` (after `:3844`): `if ((liveNodes||[]).some(n => n.kind === 'gate')) return null;` so the co-open precondition independently sees the gate.

**A2 — thread `testConsumedExtra` into `tryR2bLeglessCoopen`'s `scratchObservableWriteSet` call (n3):** the call is at **line 3863** (issue: ~3861, drift +2). Extend the require destructure (`:3843`) to also pull `parseValidationTestConsumes` (exported at `plan-validator.js:3323`), capture the plan content once (`tryR2bLeglessCoopen` already reads it at `:3846`), and pass the widening:
```js
const testConsumedExtra = (typeof parseValidationTestConsumes === 'function') ? parseValidationTestConsumes(planContent) : [];
if (!scratchObservableWriteSet(ws, { project, ownerNodeId: writer.id, testConsumedExtra })) return null;
```
`scratchObservableWriteSet` (`plan-validator.js:322`) already honors `opts.testConsumedExtra`; this one-arg thread-through closes the A2 gap where a fork declaring `validation_test_consumes: docs/fork-guide.md` still R2b-co-opened a `docs/fork-guide.md` writer over a dirty parent.

**Pinned tests (n3, `test-adaptive-node.js`) + regression matrix (n9):**
- A1 co-open-hold: freeze `{main-session-gate ∥ doc-updater docs/api.md}` → `open-next`→gate → `open-ready` returns `write_awaits_drain` + `serialDegradeReason:'gate_live'` (writer NOT opened).
- A1 merge-fence-hold: with a leg-group writer live and the gate live, `close-node` (last member) refuses `merge_awaits_read_drain` while the gate is `in_progress`.
- A1 byte-identical serial fallback preserved (no running set → unchanged).
- A2 fork-widening RED: a plan with `validation_test_consumes: docs/fork-guide.md` → `tryR2bLeglessCoopen` returns null for a `docs/fork-guide.md` writer over a dirty parent (holds `parent_dirty`).

---

### Files to Modify (by node — full anchors)

| File | Change | Node |
|------|--------|------|
| `plan-validator.js` (×4 editions) | `parseNodeBriefs`+`nodeBriefsPresent` (new+exported); `computePlanHash` conditional briefs-append (`:1302`); `brief_unknown_node` early refusal + operator-hint (`:1356`, `:60-113`); 8 `ROLE_TOKEN_REGISTRY` rows (`:198`); export `IMPLEMENT_ROLES` + new `PRODUCER_ROLES` const (`:176`, `:3307`) | n2 |
| `test-adaptive-node.js` | #643 SEED/`required_tokens` matrix (rows work with n2's registry only) | n2 |
| `test-adaptive-handoff.js` | `brief_unknown_node` freeze refusal; post-freeze brief-edit → hash-tamper (V4) | n2 |
| `adaptive-node.js` (×4 editions) | `deriveDispatchChannel`; `buildDispatch` `upstream_evidence` conditional-attach (`:1275`); goal_line+upstream wiring at 3 call sites (`:2104`,`:2612`,`:4904`); `seedEvidenceFile` upstream stubs (`:589`); `runRecordEvidence` re-injection (`:2196`); `checkUpstreamConsumed` in both close paths (`:2291`,`:5111`); **generalize `checkEvidenceShape`** (`:1088`); #644 A1 (`:5393`,`:4612`,`:3848`) + A2 (`:3863`) | n3 |
| `test-adaptive-node.js` | #642 V1/V2/V3 + **#643 V6 close-refusal** + #644 A1/A2 pins | n3 |
| `simulate-workflow-walkthrough.js` | brief→goal_line, upstream_evidence derivation, briefless back-compat, unknown-node refusal, resume re-hydration | n3 |
| 9 root `agents/*.md` + 27 plugin `.toml` (see FLAG 1) | 7 evidence contracts + workflow-planner posture; synthesizer skipped | n4 |
| `templates/routing/plan-run.skeleton.md` + `slots.js` (+`required-blocks.js` if a new required block) → regenerate 6 surfaces | 2 step-3 relay lines (carry `goal_line`; READ `upstream_evidence` + record `upstream_read`), resume re-hydration line, `<!-- PIN: node-briefs-relay -->`, manifest-derived role-kind enumeration | n5 |
| `validate-vendored-agents.js`; `validate-workflow-contracts.js` (×2: root+codex); `validate-kaola-workflow-contracts.js`; gitlab+gitea contract validators; `test-route-reachability.js` | future-agent wall; `.toml` needle mirrors; ×6 relay/enumeration pins + stale-enumeration grep-refusal | n6 |
| `CHANGELOG.md`, `docs/api.md` (dispatch sub-object + role-kind contract), `docs/conventions.md` (new-agent checklist), `docs/plan-run-cards/resume.md` (re-hydration) | user-visible docs | n10 |

---

### WRITE-SET FLAGS (surface NOW, not at the barrier)

**FLAG 1 (CRITICAL — n4 mis-declaration).** n4's declared write set lists the 27 plugin agent paths with a **`.md`** extension (`plugins/kaola-workflow/agents/code-architect.md`, …), but the actual files on disk are **`.toml`** (`plugins/kaola-workflow/agents/code-architect.toml` — verified; no `.md` plugin agent files exist). edition-sync does NOT generate agent profiles (only the aggregators + COMMON_SCRIPTS + byte groups), so n4 must hand-edit the `.toml` files. Every `.toml` edit lands OUTSIDE the declared `.md` set and is NOT barrier-invisible (agent profiles are behavioral, not docs/**) → `write_set_overflow` at n4's barrier. **Resolution: the plan must be repaired to replace the 27 `.md` plugin paths with `.toml` before n4 opens.** The 9 root `agents/*.md` paths are correct.

**FLAG 2 (routing correction — #643 close-enforcement, DD-4).** The plan's n2 RED description ("`close-and-open-next` REFUSES `evidence_shape_failed` on an empty content-bearing token") over-reaches: the CLOSE enforcement lives in `checkEvidenceShape` (`adaptive-node.js`), which is n3's file and CANNOT be split into n2 (generated_port_split forbids splitting `adaptive-node.js` across nodes). n2's registry rows drive SEEDING + `required_tokens` + `--verify` only. **V6 (the close-refusal) belongs to n3**; n2 tests only the seed/required_tokens half of V1. `test-adaptive-node.js` is shared (n2→n3 serial edge), so both halves land in one file without a write-set change.

**FLAG 3 (no under-declaration elsewhere).** n2 needs new validator EXPORTS (`parseNodeBriefs`, `nodeBriefsPresent`, `PRODUCER_ROLES`, `IMPLEMENT_ROLES`) — all in `plan-validator.js` (already in n2's set). n3 imports them (n2→n3 edge guarantees availability). n5's 9 files fully cover the skeleton+slots+6 surfaces. n6's 7 files cover the wall + `.toml` needle mirrors + reachability pins (`validate-workflow-contracts.js` is a COMMON_SCRIPT, so n6 declares both root+codex copies — correct). No further gaps.

---

### Edition-sync mechanics (confirmed)

- `node scripts/edition-sync.js --write` (`npm run sync:editions`) regenerates, for both aggregators n2/n3 touch: (a) the gitlab/gitea forge PORTS via the rename map (`GENERATED_AGGREGATORS` includes `kaola-workflow-adaptive-node.js` and `kaola-workflow-plan-validator.js`, `edition-sync.js:46-55`), and (b) the codex twin `plugins/kaola-workflow/scripts/*.js` via the COMMON_SCRIPTS byte-copy (both are in `COMMON_SCRIPTS`, `validate-script-sync.js:57,64`). So editing CANONICAL `scripts/X.js` + `--write` moves all FOUR editions atomically; `--check` (gitlab/gitea chains) proves parity. Same for `validate-workflow-contracts.js` (COMMON_SCRIPT → codex twin byte-synced; n6 declares both).
- **Test surfaces are claude-only** — `test-adaptive-node.js`, `test-adaptive-handoff.js`, `simulate-workflow-walkthrough.js`, `test-route-reachability.js`, and `validate-vendored-agents.js` are NOT in COMMON_SCRIPTS / GENERATED_AGGREGATORS / BYTE_IDENTICAL_GROUPS → edition-sync leaves them untouched; they run only in the claude chain.
- **Agent `.toml` profiles are NOT synced by edition-sync** — they are hand-mirrored ×3 (byte-identical), checked by `test-agent-profile-parity.js`; n4 edits all three by hand (reinforcing FLAG 1). The forge contract validators' `--forbidden-only` mode (`validate-kaola-workflow-gitlab-contracts.js:122`) is the standalone per-file forge-neutrality check n4 uses.
- Routing surfaces are generated by `generate-routing-surfaces.js --write` from `templates/routing/` (independent of edition-sync); the 6 plan-run surfaces are the n5-committed outputs.

---

### Data Flow

Freeze: planner authors `## Node Briefs` → `validatePlan` (n2) refuses `brief_unknown_node` on a bad id, else `computePlanHash` covers the briefs → frozen. Open (n3): the opener parses briefs + `depends_on` → `deriveDispatchChannel` → `buildDispatch` attaches `goal_line` (the brief) + `upstream_evidence` `[{node_id,role,path}]` (never a nonce) → `seedEvidenceFile` writes registry stubs + `upstream_read:` stubs → the full envelope caches at `.cache/<op>-envelope.json`. Dispatch (orchestrator, per n5 prose): carries `goal_line` verbatim + instructs the role to READ each `upstream_evidence` file and record `upstream_read: <id> <nonce>` (nonce copied from line 1 of the upstream file). Record: `runRecordEvidence` writes verbatim + re-injects any missing required/upstream keys (empty). Close (n3): `checkEvidenceShape` enforces registry content tokens (present-key ⇒ non-empty); `checkUpstreamConsumed` recomputes producer upstreams from the frozen `depends_on`, reads each upstream's line-1 nonce, and HARD-refuses `upstream_not_consumed` for an IMPLEMENT_ROLE consumer with a missing/stale echo (zero mutation), advisory elsewhere. Resume: a fresh orient finds the in-progress node; the cached envelope (with `goal_line`+`upstream_evidence`) is the authoritative re-dispatch context. Scheduler (n3, #644): a live `kind:'gate'` now holds the relaxed write co-open (`gate_live`) and the G4 merge fence; `testConsumedExtra` threads into the R2b legless predicate. Walls (n6): the future-agent wall + ×6 prose pins keep the contract from rotting on the next agent addition.

---

### Build Sequence

1. **n2 (`plan-validator.js` ×4 + tests):** `parseNodeBriefs`/`nodeBriefsPresent`; `computePlanHash` conditional briefs-append; `brief_unknown_node`; 8 registry rows; export `PRODUCER_ROLES`/`IMPLEMENT_ROLES`. `edition-sync --write`. RED-first in `test-adaptive-handoff.js` (unknown-node + hash-tamper) and `test-adaptive-node.js` (seed/required_tokens).
2. **n3 (`adaptive-node.js` ×4 + tests + walkthrough):** channel (`deriveDispatchChannel`, `buildDispatch` field, 3 call sites, seed stubs, record re-injection, `checkUpstreamConsumed`); generalize `checkEvidenceShape`; #644 A1/A2. `edition-sync --write`. RED-first for V1/V2/V3/V6/A1/A2.
3. **n4 agents + n5 routing — parallel with n2/n3 (antichain), file-disjoint:** n4 renders the 8 evidence contracts + planner posture (×4 editions each — on `.toml`, per FLAG 1); n5 edits the skeleton/slots + regenerates the 6 surfaces.
4. **n6 (after n2+n4+n5):** future-agent wall + `.toml` needle mirrors + ×6 prose pins + stale-enumeration grep-refusal.
5. **Gates (n7 engine, n8 surface, n9 adversary) → docs (n10) → finalize (n11).**

---

### Per-node routing (exact deliverable set)

- **n2-validator** (`plan-validator.js` ×4 + `test-adaptive-node.js` + `test-adaptive-handoff.js`): `parseNodeBriefs`/`nodeBriefsPresent` (exported); `computePlanHash` conditional briefs-coverage; `brief_unknown_node` early typed refusal + operator-hint; the 8 `ROLE_TOKEN_REGISTRY` rows; export `PRODUCER_ROLES` (new) + `IMPLEMENT_ROLES`. Tests: `test-adaptive-handoff.js` = unknown-node refusal + post-freeze brief-edit hash-tamper (V4); `test-adaptive-node.js` = open-next SEEDS the new stubs + emits new `required_tokens` (works on registry rows alone). Run `edition-sync --write`. **Does NOT own the close-refusal (V6) — see FLAG 2.**
- **n3-adaptive** (`adaptive-node.js` ×4 + `test-adaptive-node.js` + `simulate-workflow-walkthrough.js`): the ENTIRE #642 channel (`deriveDispatchChannel`, `buildDispatch` `upstream_evidence`, 3 call-site wirings, `seedEvidenceFile` upstream stubs, `runRecordEvidence` re-injection, `checkUpstreamConsumed` in both close paths); **the `checkEvidenceShape` generalization (#643 close enforcement)**; #644 A1 (`liveReadsAtMerge:5393`, else-branch `gate_live:4612`, `tryR2bLeglessCoopen:3848`) + A2 (`scratchObservableWriteSet` call `:3863`). Tests/walkthrough: V1 (card emission, byte-for-byte goal_line, absent-for-root), V2 (consumed-proof happy/neg-1 missing/neg-2 stale-via-reopen/neg-3 nonce-grep-absent/advisory), V3 (resume re-hydration from envelope cache), **V6 (truncated producer evidence → `evidence_shape_failed`)**, briefless back-compat, #644 A1 co-open-hold + merge-fence-hold + serial-fallback, A2 fork-widening RED. Run `edition-sync --write`.
- **n4-agents** (root `agents/*.md` + plugin `agents/*.toml` ×3 — PLAN DECLARES `.md` FOR THE 27 PLUGIN PATHS; MUST BE `.toml`, FLAG 1): render the READ-PRODUCER contract into code-architect / code-explorer / knowledge-lookup / planner / issue-scout; the WRITE SELF-WRITE contract into build-error-resolver (`build-green`) + doc-updater (`docs_updated`); the compact-plan posture into workflow-planner; SKIP synthesizer (already compliant) with a skip-reason. Byte-identical ×3 `.toml`, forge-neutral (verify via `--forbidden-only`).
- **n5-prose** (`templates/routing/{plan-run.skeleton.md, slots.js, required-blocks.js}` + 6 generated surfaces): add the two step-3 relay lines (carry `dispatch.goal_line` verbatim; READ each `dispatch.upstream_evidence` file + record `upstream_read: <id> <nonce>`), the resume re-hydration line, a `<!-- PIN: node-briefs-relay -->` anchor, and the manifest-derived role-kind enumeration (replacing the stale 3-role-WRITE/4-role-READ lists at skeleton `:394-403`). `generate-routing-surfaces.js --write`; confirm only the 6 plan-run surfaces changed.
- **n6-enforcement** (`validate-vendored-agents.js`, `validate-workflow-contracts.js` ×2, `validate-kaola-workflow-contracts.js`, gitlab+gitea contract validators, `test-route-reachability.js`): the future-agent wall (≥2-token registry rule + `PRESENCE_ONLY_RATIONALE` allowlist + manifest-derived role-kind needle) in `validate-vendored-agents.js`; mirrored `.toml` needles in the codex/gitlab/gitea contract validators; a new `test-route-reachability.js` T-test pinning the `node-briefs-relay` PIN + relay/enumeration literals across all 6 surfaces AND grep-refusing any surface that still carries the stale enumerations. RED-first: a scratch-dir fixture agent with a Write manifest but no registry row / no section → typed refusal; a mutation stripping one real agent's section → typed refusal.
- **n7-cr-engine / n8-cr-surface / n9-adversary / n10-docs / n11-finalize:** gates + docs + sink per the frozen Plan Notes; n10 records D-642-01 / D-643-01 (incl. the DD-5 back-compat choice) / D-644-01 and updates `docs/api.md` (dispatch sub-object), `docs/conventions.md` (new-agent checklist), `docs/plan-run-cards/resume.md` (re-hydration line).
