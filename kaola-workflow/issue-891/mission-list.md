# Remove the workflow's parallelism enforcement — parallel_mode, KAOLA_FORCE_CLASSIFY, and the file-set overlap gate (#891)

- item: cut the overlap axis out of the canonical `scripts/kaola-workflow-classifier.js` — the seven returns at lines 570/574/578/585 (`red`) and 589/594/598 (`yellow`), plus the `parallel_mode` bypass at ~619 and the `readOrCreateConfig` default that seeds it. Line 601's `green` becomes the unconditional outcome of the lane check. **`red` is overloaded: line 710 emits it for a CLOSED issue on the CLI path and must survive** — `claim.js:1125` and `:1749` both depend on it. Keep `owned`, `blocked` (530, 538), `target_unavailable`, `target_unverified`. Also drop whatever overlap-only helpers (scope parsing, area maps, curated root-file list) lose their last caller — but only those, checked by grep, not by assumption.
  status: todo

- item: propagate to the three forge ports — `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`. Check first whether these are a byte-identical group or rename-normalized ports; `edition-sync --write` may do this for free, and `validate-script-sync.js` will say which. Do not hand-edit what a sync owns.
  status: todo

- item: stop the three installers seeding the key — `install.sh`, `install-opencode.sh`, `install-kimi.sh` all print "Seeded parallel_mode …", plus `install-codex-agent-profiles.js` ×3. A user's existing `~/.config/kaola-workflow/config.json` carrying the key must be IGNORED, never rewritten: ignoring an unknown key is the whole migration.
  status: todo

- item: delete the tests with the mechanism, never repair them ahead of it — overlap scenarios in `simulate-workflow-walkthrough.js` and its three forge twins, `test-install-adaptive-config.js`, `test-claim-hardening.js`, `test-bundle-state.js`, `test-bundle-claim.js`, `test-forge-bundle-lane.js`, `test-opencode-edition.js`, `test-kimi-edition.js`. A scenario that only exists to prove the overlap gate fires goes; one that proves `owned`/`blocked`/closed-issue refusal stays. **Never rewrite an overlap assertion into an assert-green.**
  status: todo

- item: docs — `README.md`, `docs/api.md`, `docs/opencode-edition.md`, `docs/kimi-edition.md` all document the knob. Remove the option, and state the rule in its place: if the runtime supports parallel it is on, and the workflow does not decide. `CHANGELOG.md` under `[Unreleased]` as BREAKING (a config key and an env var both disappear from the public surface).
  status: todo

- item: prove the gate is actually gone rather than merely defaulted-off — construct the exact case that reddened before (two claimed projects with an exact file-path overlap) and show the claim now succeeds with NO config file present at all. Then prove the kept refusals still fire: closed issue, already-claimed issue, open `depends-on:`. A green suite is not evidence; these four are.
  status: todo

- item: four chains (edition-touching diff), finalize, sink. Verify no `parallel_mode` / `KAOLA_FORCE_CLASSIFY` needle survives anywhere outside `CHANGELOG.md` history and `kaola-workflow/archive/`.
  status: todo
