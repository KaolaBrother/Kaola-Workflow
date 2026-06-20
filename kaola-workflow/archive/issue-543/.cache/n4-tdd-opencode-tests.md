evidence-binding: n4-tdd-opencode-tests cf8be6edf399

# n4-tdd-opencode-tests — RED test-first node (opencode lane, issue #543)

## Summary
Extended `scripts/test-opencode-edition.js` with a new `P1–P5 + A` section
covering the install-time `--with-fast` / `--with-full` opt-in partition for
the opencode edition (mirroring install.sh's semantics + the folded #544
Claude path-leak fix). All new assertions are RED against the current tree;
the existing 300 assertions stay GREEN (no regression). n5-implementer-opencode
owns GREEN.

## Added assertions (file: `scripts/test-opencode-edition.js`, new block before the final `if (failed)`)

- **P1[adaptive-core × 6]** — default install deploys `kaola-workflow-adapt`,
  `-auto`, `-finalize`, `-plan-run`, `workflow-init`, `workflow-next`.
- **P1[fast × 1]** — default install does NOT deploy `kaola-workflow-fast`.
- **P1[full × 5]** — default install does NOT deploy `kaola-workflow-phase1..5`.
- **P1[config]** — default install seeds `~/.config/kaola-workflow/config.json`
  with `installed_paths: []`.
- **P2[exit + adaptive-core × 6 + fast × 1 + full-not-present × 5 + config]** —
  `--with-fast` deploys fast (+ adaptive-core), `installed_paths: ["fast"]`.
- **P3[exit + adaptive-core × 6 + full × 5 + fast-not-present × 1 + config]** —
  `--with-full` deploys phase1-5 (+ adaptive-core), `installed_paths: ["full"]`.
- **P4[exit + every-command × 12 + config]** — `--with-fast --with-full` deploys
  all, `installed_paths: ["fast","full"]` canonical order.
- **P5[exit-1 + exit-2 + config + fast-still-deployed]** — UNION never removes:
  `--with-fast` then bare re-install preserves `installed_paths: ["fast"]`.
- **A (#544)** — ZERO `CLAUDE_PLUGIN_ROOT` / `.claude/kaola-workflow` matches
  across the deployed `.opencode/{command,agent,plugins,hooks}/` tree.

## RED (captured BEFORE implementation — pre-impl)

Suite run: `cd .kw/worktrees/issue-543 && node scripts/test-opencode-edition.js`
→ **exit 1 — 45 failure(s), 318 passed.** All 45 failures are in the new
P1–P5 + A section; **zero** existing A1–A23 / S1 / S2 assertions regressed
(baseline was 300 passed → 318 passed now; the +18 are incidental passes inside
the new section, e.g. P1 adaptive-core commands ARE present today because the
installer currently deploys the FULL set, and P1's `installed_paths:[]` config
seed already happens to hold).

Failing assertion signatures (one-line each):
- **P1** — `P1[kaola-workflow-fast]: default install does NOT deploy the fast-only command` (+ phase1..phase5 variants). Today install-opencode.sh always deploys ALL 12 command files; the header at L22–37 explicitly says fast/full parity is "scoped out for now … This installer deploys the FULL command set".
- **P2** — `P2: --with-fast install exits 0 (got status 2 — Unknown argument: --with-fast)` → cascades: no `.opencode/` deployed, no config (`installed_paths` `null`).
- **P3** — `P3: --with-full install exits 0 (got status 2 — Unknown argument: --with-full)` → same cascade.
- **P4** — `P4: --with-fast --with-full install exits 0 (got status 2 — Unknown argument: --with-fast)` → same cascade.
- **P5** — `P5: first --with-fast install exits 0` (status 2 today) AND `P5: bare re-install PRESERVES installed_paths:["fast"] (UNION never removes) — got []` (the bare default install writes `[]`).
- **A (#544)** — `A (#544): ZERO Claude path leaks … found 146 match(es) in: command/kaola-workflow-adapt.md (6), command/kaola-workflow-auto.md (6), command/kaola-workflow-fast.md (6), command/kaola-workflow-finalize.md (30), command/kaola-workflow-phase1.md (18), command/kaola-workflow-phase2.md (6), …` (146 total matches across all 12 command files + contractor + workflow-planner agents; 0 in plugins/hooks).

Key failure output (verbatim from the run):
```
FAIL: P1[kaola-workflow-fast]: default install does NOT deploy the fast-only command (it is the --with-fast opt-in)
FAIL: P1[kaola-workflow-phase1]: default install does NOT deploy the full-only phase command (it is the --with-full opt-in)
…
FAIL: P2: --with-fast install exits 0 (got status 2 — Unknown argument: --with-fast)
…
FAIL: P4: --with-fast --with-full installed_paths deep-equals ["fast","full"] in canonical order — got null
FAIL: P5: first --with-fast install exits 0
FAIL: P5: bare re-install PRESERVES installed_paths:["fast"] (UNION never removes) — got []
FAIL: A (#544): ZERO Claude path leaks (CLAUDE_PLUGIN_ROOT / .claude/kaola-workflow) across the deployed .opencode/ tree — found 146 match(es) in: command/kaola-workflow-adapt.md (6), command/kaola-workflow-auto.md (6), command/kaola-workflow-fast.md (6), command/kaola-workflow-finalize.md (30), command/kaola-workflow-phase1.md (18), command/kaola-workflow-phase2.md (6), …
opencode-edition test FAILED: 45 failure(s), 318 passed.
```

## GREEN

GREEN: pending — n5-implementer-opencode will make P1–P5 + A pass.

## Notes for n5 (reconciliation heads-up)

1. **No existing-assertion conflict.** A9 / A20 / A21 reference `kaola-workflow-fast`
   and `kaola-workflow-phase1`, but they read from the **committed in-repo
   `.opencode/command/`** tree (the generation output), NOT from the installer's
   `--target` deploy. The partition is an INSTALL-TIME selection of which files
   to COPY; the generator (`sync-opencode-edition.js writeCommands`) still
   produces ALL 12 commands. So A9/A20/A21 stay GREEN after the partition ships —
   do NOT trim the generator's output set.

2. **Leak surface is exactly `command/*.md` + `agent/{contractor,workflow-planner}.md`.**
   `plugins/kaola-workflow-hooks.js` and `hooks/*.sh` already have ZERO leak
   matches (the A assertion greps them too — they contribute 0 today). The fix
   lives in `sync-opencode-edition.js` `transformCommandBody` (strip/rewrite the
   `kaola_script()` search path) + `renderAgent` / `opencodeAgentSuffix` for the
   two agents. Canonical `commands/*.md` and `agents/*.md` are NEVER touched
   (the opencode edition is additive — D-530-02).

3. **Hermetic fixture contract.** Every P1–P5 + A sub-case provisions a FRESH
   `$TMPDIR`-rooted HOME + `--target` via `mkdtempSync(path.join(os.tmpdir(), …))`
   and cleans up with `rmSync(…, {recursive, force})`. The installer is invoked
   with `HOME=<tmp>` + `--target <tmp> --yes --no-scripts`. n5 must keep this
   contract — never write fixtures into the repo tree or real `~`.

4. **Partition semantics to mirror** (from `install.sh`):
   - L104–109: `--with-fast` / `--with-full` flag parsing.
   - L215–216: `EFFECTIVE_FAST` / `EFFECTIVE_FULL` UNION with prior `installed_paths`
     (re-install never strips prior opt-ins — this is what P5 locks).
   - L518–524: command-file gating (`kaola-workflow-fast.md` → EFFECTIVE_FAST;
     `kaola-workflow-phase[1-5].md` → EFFECTIVE_FULL).
   - L704–741: `~/.config/kaola-workflow/config.json` UNION read-modify-write,
     canonical order `[p for p in ("fast","full") if p in paths]`.

5. **Adaptive-core set per issue #543** (asserted in P1):
   `kaola-workflow-adapt`, `kaola-workflow-auto`, `kaola-workflow-finalize`,
   `kaola-workflow-plan-run`, `workflow-init`, `workflow-next` (6 commands).
