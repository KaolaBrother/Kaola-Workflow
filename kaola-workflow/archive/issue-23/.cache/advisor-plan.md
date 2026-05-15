# Advisor Plan Gate - issue-23

## Verdict

Plan accepted with focused revisions applied before execution.

## Required Revisions

1. Make exact shared-infra overlap a dedicated regression case. Existing red tests under `commands/` do not prove the new behavior because the old area fallback already returned red there.
2. Keep a different-file `scripts/` case yellow to prove directory/shared-infra fallback was preserved.
3. Include `plugins/kaola-workflow/...` in extraction tests; that path family is explicitly named in the issue body and absent from the current regex.
4. Parse offline `.roadmap/issue-N.md` as full metadata, not only one `body:` line, so `touches:` works.
5. Mirror root script changes to the packaged plugin copy and run the plugin simulator, not only root tests.

## No Additional Revisions Needed

No new command, schema migration, or bootstrap API change is needed. The existing bootstrap already skips red/blocked candidates by only accepting green/yellow verdicts.
