# Issue #1081 — DSH (DeepSeek Harness) additive runtime edition

Goal: kaola-workflow runs under DSH (`dsh` CLI) as a tenth additive `native_only` runtime,
parallel and skippable with the existing nine, without writing user DSH config
(`~/.dsh/.env`, `~/.dsh/settings.yaml`, credentials, model/provider).

## Missions

- item: M1 — Record measured DSH facts (CLI 0.1.5-rc.2, skill roots, AGENTS.md chain, native `subagent`/`subagent_fork`, DSH_HOME) and implement adapter authority plus edition installer/sync/tests/docs.
  status: done
  dispatched: self — production edits land in `.kw/worktrees/issue-1081`; run records stay in kaola-workflow/issue-1081/
  result: Additive native_only DSH edition in worktree workflow/issue-1081 — skills under $DSH_HOME/skills or <project>/.dsh/skills, managed AGENTS.md, install-dsh.sh, install-all --skip=dsh, --runtime dsh. Never writes settings.yaml/.env/credentials.
- item: M2 — Focused validation plus read-only/dry-run `dsh` verification; no sink-merge.
  status: done
  dispatched: self — tests and dsh --version/--help/--dump-default-config plus hermetic DSH_HOME install --check
  result: test-dsh-edition, test-install-all (290), test-issue-1046 (171), test-runtime-agent-architecture (730), test-droid/devin, generate-agent-profiles --check, generate-routing-surfaces --check, validate-script-sync passed. dsh 0.1.5-rc.2 --version/--profile headless --help/--dump-default-config. Hermetic install wrote three skills + AGENTS.md + scripts; user ~/.dsh/.env and settings.yaml mtimes unchanged. No sink-merge.
