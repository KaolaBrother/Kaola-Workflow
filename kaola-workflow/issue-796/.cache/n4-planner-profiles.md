evidence-binding: n4-planner-profiles ab586b03e714
non_tdd_reason: Agent-facing prose editing (a `workflow-planner.md` + three byte-identical `.toml` twins + one test-fixture wording update) — glue/config-shaped documentation work with no natural failing unit test; the pins asserting this text land downstream in n5-regression-pins, not here.
regression-green: shasum -a 256 on the three planner tomls → identical digest `c408dc9f...4dab4f` for all three, exit 0. `node scripts/test-agent-profile-parity.js` → "agent-profile parity tests passed (538 assertions)", exit 0. `node scripts/validate-script-sync.js` → "OK: 22 common scripts, 24 byte-identical groups, 5 rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge export-superset families in sync.", exit 0.
upstream_read: n1-route-spec 4fbcce962322

## What changed

Per n1-route-spec §3.1-3.6 (lane n4), applied the F3 planner-side edits to reframe survey-mode
selection as single-issue-default with bundle as a guarded exception, plus the F5 sidecar-writer
instruction (D2), and re-verified D3 (no rename) by leaving `auto-bundle entry` untouched.

### `agents/workflow-planner.md`

- §3.1 — frontmatter `description` (L3): reworded from "...selects a bundle jointly with how it
  decomposes..." to "...then selects a single issue — or a high-confidence same-scope bundle when
  every bundle rule is met — jointly with how it decomposes...". This is also pin P8's target
  (`assertNotIncludes(..., 'selects a bundle jointly with how it decomposes')`) — the old phrase no
  longer appears anywhere in the file.
- §3.2 — `## No-target survey mode` intro bullet reworded to "select the work — ONE issue by
  default; a bundle only when every rule in Bundle Selection Rules is met"; inserted a new
  standalone paragraph right after the two mode bullets and before "The survey is READ-ONLY
  reasoning...": "**Single-issue is the default in this mode.** A bundle is the guarded exception:
  it requires meeting ALL of the Bundle Selection Rules below, and low confidence means
  single-issue. Never manufacture a bundle."
- §3.3 — `### Bundle Selection Rules`: moved the closing "select single-issue mode; do not
  manufacture a bundle" sentence to the top as "**Default: single issue.** If confidence is not
  high, select single-issue mode — do not manufacture a bundle. Auto-bundle only when ALL of the
  following are true:" and deleted the old trailing copy. This is pin P7's target
  (`assertBefore(..., 'Default: single issue', 'Auto-bundle only when ALL of the following are true')`).
  The seven bullet rules are byte-unchanged.
- §3.4 — `### The selection record`: opening reworded from "Once you settle the bundle, record the
  selection..." to "Once you settle the selection, record it...". Appended a new paragraph after the
  four field bullets giving the sidecar its writer (D2): writes
  `kaola-workflow/{project}/.cache/selection-evidence.md` with a leading
  `selection_mode: auto-bundle|single-issue` line + the four fields verbatim, written AFTER the
  claim and no later than plan authoring; explicit-target mode writes no sidecar.
- §3.5 — Method step 2: extended the existing "...folds these into `## Planning Evidence`." clause
  to also say "...and write the same record to
  `kaola-workflow/{project}/.cache/selection-evidence.md` with its `selection_mode:` header." before
  the existing "In explicit-target mode omit them" sentence.

Nothing else in the file was touched — `Clustering ranking precedence`, `Frontier-Blocked Rule`,
`Goal Context`, the pre-claim verdicts, Re-plan dispatch mode, and the `## No-target survey mode`
heading text (load-bearing per pin P8's citation site in n2) are all byte-unchanged.

### The three `.toml` twins (`plugins/kaola-workflow{,-gitlab,-gitea}/agents/workflow-planner.toml`)

Mirrored the same five conceptual changes into the toml's flattened single-paragraph prose style,
identically across all three files (verified byte-identical to each other both before and after via
`shasum`):

- `NO-TARGET SURVEY MODE:` sentence (L74) — reworded "select a bundle jointly..." to "select the
  work — ONE issue by default; a bundle only when every Bundle Selection Rule is met — jointly...",
  and appended a new sentence: "Single-issue is the default in this mode: a bundle is the guarded
  exception requiring ALL Bundle Selection Rules below, and low confidence means single-issue —
  never manufacture a bundle."
- `BUNDLE RULES —` sentence (L82) — inverted to lead with "Default is single-issue: if confidence is
  not high select single-issue mode and never manufacture a bundle; auto-bundle only when ALL
  hold: ..." and dropped the old trailing "If confidence is not high..." sentence.
- `THE SELECTION RECORD:` sentence (L88) — opening reworded "once you settle the bundle, record the
  selection" → "once you settle the selection, record it"; appended the sidecar-writer sentence
  after the four fields, matching the md's §3.4 addition in the toml's prose style.
- Method step 2 (L95) — extended "...folds these into `## Planning Evidence`." to also name the
  sidecar write with its `selection_mode:` header, matching the md's §3.5 addition.
- The toml `description` field (L2) was left alone per spec (it never mentioned bundles).

The `.toml` `description` field, the frontmatter/PIN block, Re-plan dispatch mode section, and every
other paragraph are byte-unchanged and the three files remain byte-identical to each other (confirmed
via `shasum -a 256`, see `regression-green` above).

### `scripts/test-agent-profile-parity.js`

Appended two new `FEATURE_TOKENS` entries — `'selection-evidence'` and `'selection_mode'` — with a
comment block explaining the #796 rationale, following the file's existing per-token comment
convention. Both tokens are present in the edited `agents/workflow-planner.md` (in the new §3.4/§3.5
sidecar sentences), so the parity loop now requires all three `.toml` twins to carry them too — which
they do, per the edits above. Verified with the real parity-test run (538 assertions passed, exit 0).

## Constraints honored

- Stayed strictly inside the declared write set: `agents/workflow-planner.md`,
  `plugins/kaola-workflow/agents/workflow-planner.toml`,
  `plugins/kaola-workflow-gitlab/agents/workflow-planner.toml`,
  `plugins/kaola-workflow-gitea/agents/workflow-planner.toml`,
  `scripts/test-agent-profile-parity.js`. No other file was touched.
- No provenance (issue refs, decision IDs, ADR citations) added to the profile prose — only the test
  file's code comment names the issue, per the file's existing per-token-comment convention (the test
  file is not an agent-facing prompt).
- Did not re-decide D1/D2/D3 — D2 (sidecar gets a writer) is exactly what §3.4/§3.5 implement; D3
  (no rename of `auto-bundle entry`) was honored by leaving that literal untouched everywhere in this
  write set.
- Did not touch any contract validator (`validate-*-contracts.js`) — those are n5's write set. No
  edit here would have required touching one: the two new FEATURE_TOKENS strings only affect the
  parity test itself, which is in my write set.
- No piped `| tail` — every check above ran directly and its real exit code (`$?`/tool exit) is what
  is recorded.
