# Agent Sources and Reviewer Generation

Kaola-Workflow vendors the Claude Code agent prompts it needs so users do not
have to install Everything Claude Code (ECC) separately. Reviewer profiles have
an additional local canonical-generation contract documented below.

## Upstream

- Repository: <https://github.com/affaan-m/everything-claude-code>
- Pinned commit: `922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`
- License: MIT License
- Copyright: Copyright (c) 2026 Affaan Mustafa

## Vendored Files

| Local file | Upstream path | Upstream blob SHA |
|------------|---------------|-------------------|
| `agents/build-error-resolver.md` | `agents/build-error-resolver.md` | `2ab19ac35497ae2e1b7a33f238a6953867fc5572` |
| `agents/code-architect.md` | `agents/code-architect.md` | `e99b3c718087e3be05c1763182cf904b8b25edb4` |
| `agents/code-explorer.md` | `agents/code-explorer.md` | `a391679941f71b8ff0e12cc6d9bb025a899eabb7` |
| `agents/doc-updater.md` | `agents/doc-updater.md` | `0da663329128a5a03ff811c39c0c01004cab5ac1` |
| `agents/planner.md` | `agents/planner.md` | `c311f492bd1d3bae077c86716163966789eefae2` |
| `agents/tdd-guide.md` | `agents/tdd-guide.md` | `1d0849840f0f5ed76541a48b2b4b0912b8926024` |

## Local and Generated Reviewer Sources

`agents/security-reviewer.md` was originally vendored from the same ECC upstream but is now a local
Kaola-Workflow fork carrying the project's machine-readable findings contract. `code-reviewer` also
began as an ECC-derived local fork, but its current profile is generated from Kaola-Workflow's
versioned canonical reviewer source. The ECC-derived work remains under the upstream **MIT License,
Copyright (c) 2026 Affaan Mustafa**; that attribution is honored here at project level rather than
inside generated agent-facing prompt bytes.

`adversarial-verifier` is locally authored by Kaola-Workflow and is not derived from ECC. Both
generated reviewer roles are local/provenance-exempt for `validate-vendored-agents.js`; neither is
re-fetched by the ECC refresh procedure.

### Canonical reviewer behavior and adapters

- `templates/reviewers/behavior-contracts.json` is the strict canonical behavior source for
  `code-reviewer` and `adversarial-verifier`. It owns behavior version, runtime-neutral description,
  nickname candidates, stable section ids/lines, outcome vocabulary, and finding schema.
- `templates/reviewers/runtime-adapters.json` is closed adapter data only: tools, model-policy
  reference, and evidence transport. It cannot contain arbitrary prompt prose. Codex uses
  `codex-inherit-by-omission`, so generated TOMLs contain neither `model` nor
  `model_reasoning_effort`.
- `scripts/generate-reviewer-profiles.js` is the sole writer for
  `agents/code-reviewer.md`, `agents/profiles/higher/code-reviewer.md`,
  `agents/adversarial-verifier.md`, `agents/security-reviewer.md`,
  `agents/profiles/higher/security-reviewer.md`, and the nine matching GitHub/GitLab/Gitea Codex
  TOMLs. Do not hand-edit those outputs; edit the canonical JSON or generator, then run `--write` and
  `--check`.
- OpenCode is a downstream transform of the generated Claude root. Its normalized reviewer core,
  behavior version, and behavior hash must remain identical even though its runtime frontmatter and
  permissions differ.

### Identity and proof boundary

Every render carries `behavior_contract_version`, `behavior_contract_hash`, and
`resolved_profile_hash`. The behavior hash covers canonical JSON for the runtime-neutral role
contract and excludes adapter data. The resolved hash covers the complete rendered UTF-8 profile
after replacing its one self-hash value with exactly 64 zeroes; this binds all other bytes, including
adapter/frontmatter structure and final newline.

The normalized behavior-core bytes and behavior identity are deterministic across runtimes. That is
contract equivalence, not a promise that stochastic models will emit identical findings, prose, or
domain outcomes. Generator, installer, preflight, managed manifest, and doctor checks prove selected
source and installed filesystem bytes. They deliberately do not claim that a proprietary runtime
loaded particular prompt bytes; no public prompt-loader introspection contract is available here.

## Local Overrides

- `agents/doc-updater.md`'s frontmatter `model` field is deliberately
  overridden from `haiku` to `sonnet` (issue #197). Doc reconciliation is
  comprehension-heavy code-to-doc work that belongs on Sonnet per the project
  model-usage rules. The recorded upstream `source-blob-sha` / `source-sha256`
  still point at the true upstream blob — the vendored file is already
  non-byte-identical to upstream by design (the Kaola attribution comment and
  the Prompt Defense Baseline additions diverge it), so the provenance pointers
  remain accurate upstream-identity references, not byte-equality claims.
- `agents/tdd-guide.md`'s coverage-gate step is deliberately conditionalized
  (issue #626). The upstream body unconditionally mandates `npm run
  test:coverage` with a hardcoded 80%+ requirement, which assumes a coverage
  command that may not exist in the target repo. The Kaola body now runs the
  coverage command and applies the project's coverage target only where the
  repo actually exposes one; otherwise it falls back to verifying via the
  project's recorded `validation_command`. As above, the recorded upstream
  `source-blob-sha` / `source-sha256` remain an upstream-identity reference,
  not a byte-equality claim.
- `agents/doc-updater.md`'s codemap mission is deliberately conditionalized
  (issue #626), in addition to the `model` override above. The upstream body
  hardcodes a codemap/TypeScript mission (`npx tsx scripts/codemaps/
  generate.ts`, `madge`, `jsdoc2md`, and a `docs/CODEMAPS/` structure) that
  assumes a toolchain absent in most repos. The Kaola body now runs a
  Detection step first: only when the repo actually has `scripts/codemaps/`
  and/or `docs/CODEMAPS/` does it regenerate them via the Codemap Workflow;
  otherwise it reconciles the doc surfaces the repo actually declares
  (README, CHANGELOG, `docs/*.md`, `.env.example`) against the diff, and
  skips with reason rather than inventing structure that doesn't exist.
- `agents/build-error-resolver.md`'s "When NOT to Use" routing table is
  deliberately remapped (issue #625). The upstream body routes to
  `refactor-cleaner` and `architect`, neither of which is an installed
  Kaola-Workflow role. The Kaola body maps these to the actual installed
  roles: `refactor-cleaner` → `implementer`, `architect` → `code-architect`.

## Refresh Procedure

1. Choose the upstream commit to vendor and update the pinned commit above.
2. Fetch the same 6 upstream files from `affaan-m/everything-claude-code` (`security-reviewer` and
   generated `code-reviewer` are not re-vendored — see **Local and Generated Reviewer Sources**).
3. Preserve each file's YAML front matter as the first bytes of the file.
4. Insert the Kaola attribution comment immediately after the closing front
   matter delimiter. Do not place attribution before the first `---`.
5. Update the upstream blob SHA table in this document.
6. Run:

   ```bash
   node scripts/validate-vendored-agents.js
   node scripts/generate-reviewer-profiles.js --check
   node scripts/test-agent-profile-parity.js
   npm test
   ```

7. Re-apply the Local Overrides above after any re-vendor — in particular the
   `agents/doc-updater.md` `model: sonnet` override (issue #197). `validate-vendored-agents.js`
   checks provenance format only, not file content, so it will NOT flag a silent
   revert of the model back to `haiku`.
