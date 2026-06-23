# Final Validation — issue-566

Repo kind: **self-host (npm)**. Final validation is machine-gated on the chain receipt
(`#432`); the four-chain suite IS the validation. Recorded once per the `#547` record-once
discipline (the plan `## Meta` `validation_command: npm test`).

## Validation command
`npm test` (= `test:kaola-workflow:claude && :codex && :gitlab && :gitea`), run via the gated
runner: `KAOLA_RUN_CHAINS_TIMEOUT_MS=2400000 node scripts/kaola-workflow-run-chains.js --project issue-566`.

The cross-edition obligation (`#307`) applies: the diff touches
`plugins/kaola-workflow-{gitlab,gitea}/hooks/kaola-workflow-subagent-dispatch-log.sh`.

## Result — all four chains GREEN
Receipt: `kaola-workflow/issue-566/.cache/chain-receipt.json`
- headSha: `d82aff502415623620aadd9015ba2ab2ea840f7` (== HEAD)
- codeTreeHash: `2289995fecf9a0bf356d9cbc1de226665b627280f01cd010e887a205bfadc341`
- claude: exit 0 | codex: exit 0 | gitlab: exit 0 | gitea: exit 0
- accepted_red: false on all four (no waivers)

Receipt is present, bound to HEAD, and the codeTreeHash matches the current code-relevant
tree → not `chains_unverified`, not `chains_stale`, not `chains_red`.

## In-run repair (resolved; not a deferred defect)
The first chain run surfaced one real cross-edition defect: the hook's resolver locator
`$(dirname "$0")/../scripts/...` contains the `./scripts` literal (inside `../scripts`),
which the gitlab/gitea `assertNoForbidden` forge-leak guard (`#328`) rejects. Fixed in-run by
re-expressing the locator as `_KW_ROOT="$(dirname "$(dirname "$0")")"` + `"$_KW_ROOT/scripts/..."`
(no `./scripts` literal; identical resolution; fail-open preserved; 4 hook copies byte-identical).
See `.cache/final-validation-fix-1.md`. Re-run after the fix: all four chains green.

Note: this defect slipped past the n3 `code-reviewer` gate (it verified resolution but did not
run the forge `--forbidden-only` check the plan called for); the four-chain gate caught it
mechanically — the gate working as designed.

verdict: pass
