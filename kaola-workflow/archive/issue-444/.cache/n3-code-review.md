evidence-binding: n3-code-review c20c3197073e
verdict: pass
findings_blocking: 0

# n3-code-review — G1 post-dominance gate over n2 (#444, D-421 P1+P2)

Reviewed the n2 changes to scripts/kaola-workflow-adaptive-node.js and its x4 generated
ports (codex twin + gitlab/gitea forge ports) plus scripts/test-adaptive-node.js.
Diff is surgical: +217 lines per port, +395 test lines; no unrelated edits.

## (a) Single-builder invariant — the #411 defect kill — PASS
- buildDispatch is defined EXACTLY ONCE, at column 0 (module level, L745). Not nested
  inside any opener. Exported in module.exports.
- runOpenNext (L1394): const openedDispatch = buildDispatch(targetNode, {...}); assigned
  to opened.dispatch (L1416). No subsequent dispatch-field mutation.
- runCloseAndOpenNext fused advance (L1771): const fusedDispatch = buildDispatch(nextNode,
  {...}); assigned to opened.dispatch (L1801). No subsequent dispatch-field mutation.
- runOpenReady (L2657): dispatch = buildDispatch({...},{...}) per opened node; placed on
  the returned object (L2661). No subsequent dispatch-field mutation.
- grep for `dispatch.` field mutation across the file finds only a comment, never a write.
- The back-compat sibling fields (id/role/model/declared_write_set/evidence_file/
  required_tokens) live on the WRAPPING `opened` object, NOT inside the `dispatch`
  sub-object, and are documented as additive duplicates kept for one release. The
  descriptor itself is assembled solely by buildDispatch — invariant holds.
- Dispatch shape is field-complete and identical across all three openers: node_id, role,
  model, working_dir, declared_write_set, evidence_file, nonce, required_tokens,
  forge_rider, guards (+ optional goal_line). Test D444-DISPATCH-PARITY asserts serial vs
  fused field-identity for the same node.
- NOTE (non-blocking, consistent): main() does not thread working_dir into any of the three
  openers, so dispatch.working_dir resolves to null uniformly across all three paths. No
  shape divergence; the field is wired through the signatures for future use.

## (b) x4 port byte-identity (post sync:editions) — PASS
- --self-test: 28/28 passed (exit 0).
- buildDispatch / deriveGuards / runVerifyEvidence present (count=1) in all four ports.
- canonical vs codex twin: BYTE-IDENTICAL (diff empty).
- canonical vs gitlab / gitea: diffs are EXCLUSIVELY the expected edition-noun
  substitutions (the @generated header, script-name prefixes, require() paths). Zero logic
  drift (29 raw diff lines each, all noun-only).
- gitlab forbidden-only validator: passed (exit 0).
- gitea forbidden-only validator: passed (exit 0). The codexPrefix split-literal trick
  ('plugins/kaola-workflow' + '/scripts/') correctly avoids the forge source-text check.

## (c) --verify reads from disk, no stdin transit, binds nonce — PASS
- runVerifyEvidence (L786) reads the file via readFile(cachePath) where
  cachePath = .cache/<node-id>.md. NO stdin reference in the function body (verified).
- Nonce bound via readNonce(planPath, nodeId, readFile) -> first 12 chars of the on-disk
  barrier-base SHA, passed as expectedNonce to checkEvidenceShape.
- Refuses evidence_stale on nonce mismatch (maps shapeCheck.evidenceStale) and
  evidence_unbound when the binding header names a different node (maps
  shapeCheck.evidenceUnbound) — same mapping the close path uses.
- Uses checkEvidenceShape (the canonical close-path checker) for token shape; required
  tokens derive from ROLE_TOKEN_REGISTRY (via deriveRequiredTokens / checkEvidenceShape
  role logic). No second inline token list.
- Tests D444-VERIFY-ACCEPT / VERIFY-REFUSE-TOKEN (evidence_stale) / VERIFY absent / receipt
  passes close all green.

## (d) --stdin compat path survives one release — PASS
- main() record-evidence branch order: --verify (read-only) -> --stdin (runRecordEvidence,
  unchanged) -> refuse. The stdin path falls through untouched; only the refuse message
  changed to "--stdin or --verify required". No regression.

## (e) Test chains (sequential) + simulation
- test:kaola-workflow:claude  : pass (exit 0)
- test:kaola-workflow:codex   : pass (exit 0)
- test:kaola-workflow:gitlab  : pass (exit 0)
- test:kaola-workflow:gitea   : pass (exit 0)
- scripts/test-adaptive-node.js : pass (579 assertions)
- scripts/simulate-workflow-walkthrough.js : pass (exit 0, "Workflow walkthrough simulation passed")

## Verdict
APPROVE. All five critical correctness properties hold. The #411 single-builder invariant
is enforced by construction (one module-level buildDispatch, three call-only openers, no
hand-set fields). x4 byte-identity confirmed modulo forge nouns. --verify is disk-only with
correct nonce/binding refusals. --stdin compat preserved. All four chains green sequentially.

findings_blocking: 0
