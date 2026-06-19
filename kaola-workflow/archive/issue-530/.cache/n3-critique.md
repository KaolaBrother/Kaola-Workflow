evidence-binding: n3-critique 624b0a210ddf
<!-- verdict: paste verdict here -->
verdict: pass
findings_blocking: 0

# n3-critique — adversarial verifier (investigation skeptic, analytical verdict)

## 1. Decision #5 refutation — gap REAL; Candidate C VALIDATED (could not refute)
Empirical PIN-strip counterexample (the planner's challenge): injected throwaway `text = text.replace(/<!--\s*PIN:.*?-->/g, '')` into `transformCommandBody` (`sync-opencode-edition.js:199`), `--write` regenerated, ran `test-opencode-edition.js`:

| State | Assertions | RED |
|---|---|---|
| Baseline | 223 pass | — |
| PIN-comment strip only | 223 pass | none |
| PIN strip + 7 literal tokens (`closure-audit`, `result: escalate`, `--write-overlap-consent`, `--speculative-consent`, `fast_compliance_unresolved`, `path_requires_explicit_opt_in`, `frontier unit`) | 223 pass | none |

- A6 (`:136-140,153-157`) did NOT catch it — compares `read('.opencode/command/X') === renderCommand(...)`, both call the same edited `transformCommandBody` → mutate together.
- A14 (`:120-130`) checks ABSENCE patterns (model-prose), never PIN PRESENCE.
- A9 (`:245-262`) file-existence only.
Tokens stripped from all 7 commands, all 223 green. Residual `frontier unit` survives only in plan-run frontmatter description (frontmatter not transformed). Tree restored via `git checkout`; baseline re-confirmed (223 pass, PINs back). **Gap conclusively real; Candidate B (status quo) refuted; Candidate C correct.**

## 2. Decision #6 refutation — fragility REAL; Candidate B VALIDATED; Candidate A refuted
| Check | Result |
|---|---|
| `node --version` | v24.14.0 |
| `node --check .opencode/plugins/kaola-workflow-hooks.js` | exit 0 (detect-module default ON) |
| `node --no-experimental-detect-module --check …` (sim Node <22.12 / 20 LTS) | exit 1 — `SyntaxError: Cannot use import statement outside a module` |
| `.opencode/package.json` `"type":"module"` | ABSENT (gitignored `.opencode/.gitignore:2`) |
| `engines`/`.nvmrc`/`.node-version`/CI workflows | ALL ABSENT |

Plugin is ESM (`:20-22,105`). Node ≥22.12 A11 passes; Node 20 LTS / pre-22.12 hard-fails. No Node floor + no CI → wiring A11 into `npm test` couples a Node-version-fragile non-forge check to the 4 forge Finalization chains. **#6-A refuted; #6-B correct.** Production (Bun) auto-detects ESM → R2 holds.

## 3. Missed-defect hunt — none material in-scope
- 31 tracked `.opencode/` files = 15 agents + 12 commands + 3 hooks + 1 plugin; node_modules/package.json NOT tracked. Counts match canonical (`comm -23` empty).
- `kaola-workflow-adaptive-schema.js` byte-identical (718 lines) across all 4 edition trees — diff internally consistent.
- A9 covers 5 receipt-emitted targets; other 7 commands covered by A4 (existence) — consistent T2-twin design.
- `.opencode/package.json` `@opencode-ai/plugin:1.17.8` not imported at runtime (plugin uses only `node:` builtins) — type/SDK surface only.

**Out-of-scope / pre-existing (non-blocking, transparency):** `test-claim-hardening.js` is HOME-fragile — `kaola-workflow-classifier.js:693` bypasses the classifier whenever `config.parallel_mode !== 'auto'` (read from `$HOME/.config/kaola-workflow/config.json`), so a contributor whose global config has `parallel_mode` ≠ `'auto'` sees the claude chain FAIL at test-claim-hardening. Pre-existing (opencode commit `77e88c38` did NOT touch `classifier.js`/`test-claim-hardening.js`); out of scope for this audit but a legitimate follow-up (run-gap capture).

## 4. Four cross-edition chains — regression: NO (all GREEN under clean HOME)
Commit `77e88c38` touched only: `.opencode/*`, `opencode.json`, `install-opencode.sh`, `docs/opencode-edition.md`, `scripts/kaola-workflow-adaptive-node.js` (6 lines), `scripts/kaola-workflow-adaptive-schema.js` (82 NEW), `scripts/test-adaptive-node.js` (15 lines), + 3 forge-edition copies. Did NOT touch the classifier path. Isolated diff effect from `$HOME`-config noise by running under a clean temp HOME (config absent → classifier defaults `parallel_mode:'auto'` → no bypass).

| Chain | Result | Final line |
|---|---|---|
| test:kaola-workflow:claude | PASS (exit 0) | Workflow walkthrough simulation passed |
| test:kaola-workflow:codex | PASS (exit 0) | Kaola-Workflow walkthrough simulation passed |
| test:kaola-workflow:gitlab | PASS (exit 0) | GitLab Codex workflow walkthrough simulation passed |
| test:kaola-workflow:gitea | PASS (exit 0) | Gitea Codex workflow walkthrough simulation passed |

Claude-chain failure under DEFAULT HOME traced to `$HOME/.config/kaola-workflow/config.json` polluted with `parallel_mode:"on"` (concurrent sibling-repo agent sharing `$HOME`); under clean HOME test-claim-hardening passes (103 assertions) and the full claude chain is green. **Not a diff regression.**

## Verdict
verdict: pass · findings_blocking: 0 (analytical; investigation verifier, exempt from change-gate block). The audit's claims survived the strongest disproof attempts.
