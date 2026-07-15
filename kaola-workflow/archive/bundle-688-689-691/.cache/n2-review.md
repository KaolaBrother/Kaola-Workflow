evidence-binding: n2-review 35b7f9e283d0
verdict: pass
findings_blocking: 0
upstream_read: n1-harden f9a8f0a8faa9

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=#691 micro-TOCTOU: a state file deleted between statSync and readFileSync (clean ENOENT at read) is now reaped where the old code kept it; unreachable via shipped atomic-replace (rename leaves no absent window), requires an out-of-band delete mid-sweep, and the issue's prescribed fix mandates exactly this clean-ENOENT-reapable shape — nit, nothing to change.

# n2-review — bundle #688/#689/#691 (33-file diff), 40 adversarial probes + 3 mutation kills

## #688.1 fail-closed absent ledger — tighten-only
Sole real call site (adaptive-node.js:4937) always threads ledgerStatuses=proofLedger from readLedgerStatuses
(returns an object on every path, never null). 10 probes: omitted/null/undefined/{} ledger → refuse
candidate_delta_unattributed, no crash. new-true ⇒ old-true, so it can only shrink repairWriters (admits→refusals).

## #688.2 n/a exclusion — live co-repair still recovers
Quantifier {pending,in_progress} newly excludes n/a + corrupt/missing lookups (fail-closed). Probes: n/a/complete/
missing/bogus refuse; pending/in_progress still attribute via P3b. N11 seven-step regression (real CLI, frozen
plan) — co-repair of gb:1 while ga folded-pending STILL absorbs ax.js via live P3b — green in the 2166 run.

## #688.3 reserved node-id refusal — at freeze, plan_invalid
__proto__/constructor/toString/hasOwnProperty/valueOf node ids → refuse plan_invalid "reserved Object.prototype
key"; ordinary ids + reserved-substring ids (proto-review) still freeze in-grammar. In validatePlan:1595
(revalidateForResume has no validatePlan call → legacy frozen plans still resume, mirrors the dup-id precedent).
Object.getOwnPropertyNames(Object.prototype) avoids a drifting hand-list.

## #688.4 isCanonicalBlobMap — HIGHEST RISK, NOT WEAKENED
22 probes: every genuinely-invalid map STILL rejected (39/41-hex sha, non-octal/5-digit mode, sha-only, non-hex,
numeric/null/nested value, empty-string key, array/string/null/undefined, one-good-one-bad, trailing-garbage).
Valid maps (incl. integer-keyed {'.env','10'}, {'2024','a.js'}, null-proto) pass. Only the enumeration-order
comparison dropped; shape check (CANONICAL_TREE_ENTRY_RE + truthy key) untouched. The dropped check protected
nothing — candidate_declared enumeration order is never hashed/byte-compared (digest hashes the sorted ls-tree
`lines`; transaction_key hashes {plan_hash,gate,candidate_digest,generations}). Decisive: the production builder
computeReviewCandidateDigest builds sortedDeclared by sorted-key insertion — the exact map JS re-orders on an
integer key — so the old check rejected the production code's OWN output. Mutation kill: re-insert the
enumeration comparison → 1 RED (the #688.4 assertion), restore cmp byte-identical, 2166 green.

## #689 parent-dir fsync (fast/full/phase4) — fail-soft airtight
All 3 blocks byte-identical, strictly AFTER the rename try/catch that rethrows (real rename/ENOSPC still
propagates). Block: try open+fsync, catch swallows all, finally closes fd (guarded) — no path rethrows or alters
the true return; idempotent no-write early-return skips it. Each test its own script + order-tracking spy
(fsync(tmp)→rename→open(dir)→fsync(dirFd)→close(dirFd)) + EISDIR/EACCES fault injection (no throw, true return,
durable content). Mutation kill: remove open+fsync from fast → 3 RED, restore cmp byte-identical, 136 green.
Suites fast 136 / full 78 / phase4 57 green.

## #691 statSync ENOENT keep — sweep-local, mutation-killed
keep-pass (c) (claim.js:3270-3280): one try over statSync+readFileSync, keep on e.code !== 'ENOENT'. chmod-000
DIRECTORY (EACCES-through-parent) now KEPT; no-folder + clean-ENOENT still reaped (all 3 in ONE end-to-end CLI
sweep, root-skip guarded, perms restored). readActiveFolders untouched. Mutation kill: gate keep behind existsSync
→ 2 RED (live tag reaped), restore cmp byte-identical, 251 green.

## Parity + no over-reach
Schema shasum 7ef17db5 identical ×4; edition-sync --check green (10 ports, 24 mirrors, 27 byte-identical groups);
validate-script-sync OK; hand-ported forge claim.js hunks byte-identical to canonical (diff-of-diffs clean).
Diff scope: adaptive-node = repairWriters predicate + additive test export; schema = isCanonicalBlobMap only
(writeFileAtomicReplace + roadmap.js untouched); plan-validator = reserved-id check in validatePlan only; claim =
keep-pass (c) only; advance = fsync block + additive export; tests additive. No #683 rebind semantics/partition
proof/live refusal/#685 adaptive helper touched. Walkthrough green; gitea chain spot-checked green with
KAOLA_RUN_CHAINS_CONCURRENCY=serial; accept n1's FOUR_CHAIN_EXIT=0 for the rest given clean code reading + parity.

APPROVE — six hardening fixes correct, strictly tightening, 40 probes + 3 mutation kills, parity clean; no
weakened check, no fail-soft hole, no over-tightening of live #683 co-repair, no regression.
