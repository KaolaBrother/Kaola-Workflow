# Issue Selection Gap — vrpai-cli session 6f309f2e (2026-05-17)

## Question
Why did the Kaola-Workflow agent claim issue #241 (P3, docs, **not** Engine Showcase Gap) when #187 (P1, Engine Showcase Gap) was correctly ranked first?

## Answer (TL;DR)
The agent did **not** violate workflow rules. The ranking logic ran exactly as designed and put #187 first. A separate classifier step then red-listed 20 of the 21 ranked issues with a "conservative red" verdict, and #241 was the only survivor — selected not because it was higher priority but because its body coincidentally contained a path string the classifier's regex recognized.

Three compounding bugs in `kaola-workflow-classifier.js` produced this outcome.

## Primary evidence

`STARTUP_OUT` from `kaola-workflow-claim.js startup` at `2026-05-17T07:10:46Z`:

```json
{
  "selected_issue": 241, "claim": "acquired", "verdict": "green",
  "ranking": [
    { "issue": 187, "tier": 1, "priority_label": "P1" },
    { "issue": 161, "tier": 2, "priority_label": "P2" },
    { "issue": 183, "tier": 2, "priority_label": "P2" },
    { "issue": 189, "tier": 2, "priority_label": "P2" },
    { "issue": 190, "tier": 2, "priority_label": "P2" },
    { "issue": 219, "tier": 2, "priority_label": "P2" },
    { "issue": 229, "tier": 2, "priority_label": "P2" },
    "..."
  ],
  "skipped": [
    { "issue": 187, "verdict": "red", "reason": "no extractable file paths or area labels; claimed project in phase <= 2; conservative red" },
    { "issue": 161, "verdict": "red", "reason": "same" },
    "...20 issues total, all skipped with identical reason..."
  ]
}
```

Ranking was correct (#187 first). The classifier rejected #187, #161, #183, #189, #190, #219, #229, #245, #246, #82, #83, #84, #87, #163, #188, #209, #210, #211, #212, #213 — all 20 higher-priority candidates — with the same reason.

## Root causes (3 compounding bugs)

### Bug 1 — Path-extraction regex is hardcoded to Kaola-Workflow's own directory layout
`scripts/kaola-workflow-classifier.js:122`
```js
const FILE_PATH_REGEX = /(?:^|[^A-Za-z0-9_./-])((?:plugins\/kaola-workflow|scripts|commands|hooks|kaola-workflow)(?:\/[A-Za-z0-9_.-]+)*\/[A-Za-z0-9_.-]*[A-Za-z0-9_-])/g;
```
The regex only recognizes paths anchored at `plugins/kaola-workflow`, `scripts`, `commands`, `hooks`, or `kaola-workflow`. These are Kaola-Workflow's *own* internal directories.

When deployed in a host project (vrpai-cli), almost no issue body matches. #187's body — `EngineCommand::SetRenderTargetSize`, `PUT /api/v1/render/config`, `Lanczos3` — extracts zero paths. The classifier treats this as `noPathInfo = true`.

Why #241 leaked through: its body says `bash scripts/gen-docs.sh`. This matches the `scripts` prefix — but it's vrpai-cli's `scripts/` (cargo dev scripts), not Kaola-Workflow's `scripts/` (the workflow's claim/classifier). The regex cannot distinguish; the match was coincidental.

### Bug 2 — Missing project folder is treated as "phase ≤ 2"
`scripts/kaola-workflow-classifier.js:278`
```js
if (!fs.existsSync(path.join(projectDir, 'phase3-plan.md'))) anyClaimedAtPhaseLeTwo = true;
```
When a lock file exists but its project folder was archived/removed, `phase3-plan.md` is absent. The check fires `anyClaimedAtPhaseLeTwo = true` for what is actually a *completed* (not early-phase) project. Conservative-red is supposed to protect against concurrent file-overlap; a completed project should not contribute to it.

### Bug 3 — Zombie ticker processes keep stale locks "alive"
Two locks were present at classification time:
- `.git/kaola-workflow/.locks/issue-160.lock` — last heartbeat `07:32:08Z`
- `.git/kaola-workflow/.locks/issue-177.lock` — last heartbeat `07:33:03Z`

Both sessions (86c8c2c1, 0462ff46) had already written `"Phase 6 finalization complete"` / `"workflow complete"` and stopped logging hours earlier (last jsonl timestamps `04:21Z` and `06:27Z`). But the ticker subprocesses spawned by those sessions are **still running** as of this investigation:

```
ps aux | grep ticker
node .../kaola-workflow-claim.js ticker --session 86c8c2c1-...   (pid 37865, started 11:31)
node .../kaola-workflow-claim.js ticker --session 0462ff46-...   (pid 53782, started 12:32)
```

The Claude session exits without killing its background ticker. The orphaned ticker keeps heartbeating the lock, so sweep/GC sees the lock as live and never expires it. Combined with bug 2, the archived projects remain "claimed in phase ≤ 2" forever.

## Cascade
1. Bugs 1+2+3 together → classifier sees two stale "claimed-in-phase-≤2" locks (#160, #177) and no extractable paths in #187 → conservative red.
2. Same pattern repeats for the next 19 ranked candidates.
3. #241 reaches the classifier. Its body contains `scripts/gen-docs.sh`, which trips the regex's `scripts` prefix → `noPathInfo = false` → conservative-red branch skipped → verdict green.
4. Claim acquired on #241, the lowest-priority issue (P3, docs), despite #187 (P1) ranking first.

## Impact
- Priority ranking (feature shipped in commit `0c97c70`) works correctly but is silently overridden in host-project deployments by the classifier.
- Any host project (i.e., not Kaola-Workflow itself) where issue bodies reference host-specific paths is affected.
- A stale lock + missing project folder permanently degrades selection until the lock is manually cleaned.

## Code references
- Ranking (correct): `scripts/kaola-workflow-claim.js:937` `parsePriorityTier`, `:956` `sortIssueRecords`, `:1183` `runStartupClaimFirstAvailable`
- Classifier red fallback: `scripts/kaola-workflow-classifier.js:322` `classify`, `:350` conservative-red branch
- Path regex bug 1: `scripts/kaola-workflow-classifier.js:122`
- Phase-detection bug 2: `scripts/kaola-workflow-classifier.js:268-278`
- Ticker (no kill on session exit): `scripts/kaola-workflow-claim.js` — `ticker` subcommand

## Framing
The agent followed the workflow correctly. The tool gave the agent the wrong answer.
