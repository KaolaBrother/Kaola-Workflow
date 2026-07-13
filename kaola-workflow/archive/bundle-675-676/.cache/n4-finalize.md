evidence-binding: n4-finalize 7e5e1bf938cd

# n4-finalize — bundle-675-676 sink (closes #675 + #676)

## docs_updated
CHANGELOG.md — two `[Unreleased]` `### Fixed` entries (#676 source-relative archive-completeness gate;
#675 gap-sweep `project_archived` refusal). New decision record `docs/decisions/D-676-01.md` records the
operator's source-relative-vs-absolute-floor value call. No `docs/api.md`/README/`.env.example` change
(no public interface/env/CLI change; the new `archive_incomplete` reason and `project_archived` refusal
are internal typed emits).

## no-impact classes
No public interface, env var, CLI flag, or architecture changed. `docs/decisions/D-676-01.md` is the only
non-CHANGELOG doc surface.

## four-chain precondition
Cross-edition diff (gap-sweep ×4 + claim ×4 editions) → Finalization requires all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, recorded via the run-chains
receipt before the sink.

## run gaps
In-run repair: the adversarial change-gate REFUTED the first #676 fix (node-evidence glob `^n\d*-.+\.md$`
missed free-form/role-named evidence names, proven against archived run bundle-414-418-422); n1-fix was
reopened, the enumeration broadened to every `.cache/*.md` minus fixed-name sidecars, and n2-review +
n3-adversary re-ran and passed (NOT-REFUTED). The gap-sweep detects this as `in_run_repair` for
n1-fix/n2-review/n3-adversary — all `noise` (resolved in-run + re-gated). One deferred out-of-scope
residual R2 (a pre-existing gap-sweep explicit-`--output`-at-a-same-named-archive clobber, outside #675's
archived-project scope) filed as follow-up #679. Adversary observations N1 (theoretical sidecar/node-id
name collision — no shipped trigger) and N2 (non-`.md` artifacts carried faithfully by copyDir — no loss)
are non-defects, not filed.
