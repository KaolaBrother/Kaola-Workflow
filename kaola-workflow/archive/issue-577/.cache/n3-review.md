evidence-binding: n3-review 71344f2d050f
verdict: pass
findings_blocking: 0

## Code Review — n3-review (issue #577, opencode-edition plugin canonical-source fix)

### Scope
Six surfaces, all opencode-edition-only: `docs/opencode-edition.md`, `install-opencode.sh`,
`scripts/sync-opencode-edition.js`, `scripts/test-opencode-edition.js`, new tracked
`templates/opencode/plugins/kaola-workflow-hooks.js`, new `docs/decisions/D-577-01.md`. No
plugin-edition / forge-validator / npm-chain files → no #307 four-chain obligation (D-530-02).

### Falsifiable proof (hard oracle)
Simulated a clean clone by moving the gitignored/untracked `.opencode/` aside (fully ABSENT), then ran
with no manual seeding:

```
cd .../issue-577 && node scripts/test-opencode-edition.js
opencode-edition test passed (496 assertions).
EXIT_CODE=0
```

Test self-provisioned via `sync --write` (FATAL exit(1) on sync failure — verified) and went green with
`.opencode/` initially absent. A11, A11-canon, P1, G1, H1 all present and reachable
(`test-opencode-edition.js:629-671, 760-797, 912-937, 1120`). P1/G1 invoke `install-opencode.sh`
end-to-end; G1:927 asserts `--global` deploys the plugin from the new template path; H1:1120 runs the
hook ESM harness — install-path change exercised independently of the sync path. `.opencode/` fully
regenerated post-run (30 files), byte-identical to backup. Worktree restored.

### Correctness of four-file threading
- Canonical source byte-identical (7832 bytes, diff IDENTICAL) to the live adapter.
- sync: `CANON_PLUGINS_DIR → OUT_PLUGINS_DIR`; `writePlugin()` mirrors `writeHooks()`, wired into
  `runWrite`; `runCheck` parity assertion sound (missing/drift → mismatch). Exports consistent.
- install:162-166: `cp templates/opencode/plugins/*.js → layout_root/plugins/` BEFORE the `-ef`
  self-dev guard; dest differs from source so no `set -e` self-copy trip; agent/command/hooks `-ef`
  guard unchanged.
- uninstall:227: plugin-removal loop enumerates `templates/opencode/plugins/*.js` basenames — correct.
- `|| true` removal complete; `set -euo pipefail` active → de-suppressed `cp` is genuinely fatal on a
  missing template. No `SCRIPT_DIR/.opencode/plugins` source refs remain (grep clean).

### Docs
`docs/opencode-edition.md` accurate (table row added; "Two files authored" → "One file"; Hooks +
A11-canon match impl). `D-577-01.md` accurate, well-scoped, cites additive/no-#307 posture.

### Non-blocking (LOW, do NOT affect findings_blocking)
finding: id=R1 scope=out_of_scope action=none status=open severity=low — A11-canon byte-identity
sub-assertion is tautological post self-provision; exists() guard + install --check are the real guards.
finding: id=R2 scope=out_of_scope action=follow_up status=open severity=low — install `cp` uses `*.js`
glob while sync uses explicit `PLUGIN_SCRIPTS` allowlist; a future second plugin could diverge.

### Verdict
APPROVE — clean, surgical, correctly-threaded opencode-edition-only fix; hard oracle green from tracked
sources with zero manual seeding. 0 CRITICAL/HIGH/MEDIUM, 2 LOW non-blocking notes.
