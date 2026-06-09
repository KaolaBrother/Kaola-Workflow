# Vendored Claude Code Agents

Kaola-Workflow vendors the Claude Code agent prompts it needs so users do not
have to install Everything Claude Code (ECC) separately.

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

## Locally Forked Agents (derived from ECC)

`agents/code-reviewer.md` and `agents/security-reviewer.md` were originally vendored from the same
ECC upstream (see **Upstream** above) but have since been **forked into local Kaola-Workflow agents**
(issue #279 follow-up) so they can carry the project's machine-readable findings-emission contract
directly in their bodies. They remain derived works under the upstream **MIT License, Copyright (c)
2026 Affaan Mustafa** — that attribution is honored here at the project level rather than per-file
(the agent files now carry only the `kaola-workflow-managed-agent` marker, not per-file provenance).
They are no longer byte-tracked to upstream and are NOT re-fetched by the Refresh Procedure;
`validate-vendored-agents.js` validates them as local (provenance-exempt) managed agents. Their
`agents/profiles/higher/` model-variant copies are forked likewise.

## Local Overrides

- `agents/doc-updater.md`'s frontmatter `model` field is deliberately
  overridden from `haiku` to `sonnet` (issue #197). Doc reconciliation is
  comprehension-heavy code-to-doc work that belongs on Sonnet per the project
  model-usage rules. The recorded upstream `source-blob-sha` / `source-sha256`
  still point at the true upstream blob — the vendored file is already
  non-byte-identical to upstream by design (the Kaola attribution comment and
  the Prompt Defense Baseline additions diverge it), so the provenance pointers
  remain accurate upstream-identity references, not byte-equality claims.

## Refresh Procedure

1. Choose the upstream commit to vendor and update the pinned commit above.
2. Fetch the same 6 upstream files from `affaan-m/everything-claude-code` (code-reviewer and
   security-reviewer are no longer vendored — see **Locally Forked Agents** above).
3. Preserve each file's YAML front matter as the first bytes of the file.
4. Insert the Kaola attribution comment immediately after the closing front
   matter delimiter. Do not place attribution before the first `---`.
5. Update the upstream blob SHA table in this document.
6. Run:

   ```bash
   node scripts/validate-vendored-agents.js
   npm test
   ```

7. Re-apply the Local Overrides above after any re-vendor — in particular the
   `agents/doc-updater.md` `model: sonnet` override (issue #197). `validate-vendored-agents.js`
   checks provenance format only, not file content, so it will NOT flag a silent
   revert of the model back to `haiku`.
