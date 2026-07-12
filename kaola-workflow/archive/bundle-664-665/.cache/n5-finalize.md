evidence-binding: n5-finalize b8c7ffac301b

## sink
role: finalize (main-session-direct); bundle closure all-or-nothing for #664 + #665.
change: Added CHANGELOG.md [Unreleased] Fixed entries for #664 (repair-node collective adversarial fan-out fold) and #665 (fence semantics in locateSection + release unreleasedSection). Docs/state only — no code writes on the sink.

## docs_decision
Both fixes complete already-shipped decisions (#658 collective fold / #660 fence-aware scanner) with no new public interface, schema, env var, or architectural contract — consistent with #658/#660 shipping without ADRs. CHANGELOG entries are the durable record; no docs/ page or ADR required.

## in_run_repairs
Two in-run repair loops fired this run (all resolved + re-verified before finalize):
- n3 code-review found R1 (repair-node CLI dispatch omitted readdir → legacy purge dead) + R2 (4c dedupe by label only, second same-label group survived) — both fixed in-run (readdir wired mirroring reopen-node; per-receipt-name dedupe), re-reviewed clean.
- n4 adversarial-verifier REFUTED on A1 (unreleasedSection fence used ln.trim() not ^\s{0,3} anchor → indented backtick run swallowed release headings → demonstrated fail-open passing an undocumented issue) — fixed in-run (^\s{0,3} raw-line anchor ×4 + both-direction tests), re-verified NOT-REFUTED (17-case matrix + 5000-doc fuzz, 0 mismatches).

## run_gaps
Deferred follow-ups to be filed/justified at gap-sweep: A2/R3 (locateSection ln.trim() indent divergence vs classifier ^\s{0,3} — pre-existing, out of #665 AC, real hash-wedge residual → file); A3 (legacy-purge fs-seam caller-sensitivity — no reachable production caller omits readdir → noise); R4 (#437-lane EISDIR fail-open in task-mirror — pre-existing test-fixture-triggered → file); R5 (cosmetic "#665" label on #664 repair tests → noise).

## four_chain
Cross-edition diff (adaptive-node GENERATED ×4, adaptive-schema byte-identical ×4, release canonical+codex byte + rename-normalized forge ports). Finalization runs all four npm chains sequentially before the bundle sink.
