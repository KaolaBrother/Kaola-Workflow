# Prompt size measurement

The [README token table](../README.md#token-usage-at-a-glance) is a static planning estimate, not a
runtime quota, billed-token report, or promised task cost. Baseline: the unreleased #1101 candidate
(no Kaola subagent roles), measured on 2026-09-27 at commit `f1291212cfd36dad5f911bea9606522eff8180e6`
on top of `main` `04866c50`. The previous baseline was release `kaola-workflow--v12.0.1`.

## Raw word counts

Count one generated GitHub Next entry, one Finalize entry, and one rendered global carrier for each
runtime. Count complete files, including frontmatter and code examples. Use whitespace splitting;
estimated tokens = words × 1.5. Round each component to the nearest 10, then sum the displayed
components. This heuristic has not been calibrated against every supported model tokenizer.

| Runtime | Next words | Finalize words | Global words | Total words |
|---|---:|---:|---:|---:|
| Claude Code | 1794 | 2131 | 407 | 4332 |
| Codex | 1747 | 2046 | 407 | 4200 |
| Cursor | 1608 | 1717 | 904 | 4229 |
| Grok CLI | 1373 | 1714 | 876 | 3963 |
| Devin CLI | 1392 | 1733 | 891 | 4016 |
| Droid CLI | 1392 | 1733 | 906 | 4031 |
| DSH | 1387 | 1728 | 867 | 3982 |
| Kimi Code | 1761 | 2100 | 407 | 4268 |
| OpenCode | 1759 | 2100 | 407 | 4266 |
| ZCode | 1373 | 1714 | 914 | 4001 |

The Claude Next/Finalize values above are the older #1101 baseline (1794/2131); the current
single-forge counts are 1572/2086, measured in the #1123 section below. The other rows remain at
their original measured baseline.

No Init, separate compact recovery, project rules, vendor prompts, history,
tool traffic, reasoning, or model output is counted. The three components need not be freshly
injected together on every turn. The global dispatch guidance on Cursor/Grok/Devin/Droid/DSH/ZCode is counted in
its global carrier; it is not added again to their command columns. GitLab and Gitea copies are
excluded. Tokenizer differences and runtime caching require actual usage reports for cost analysis.

## Multi-forge command entries (#1123 P2)

When two or more Claude forges are installed, `install.sh` installs the `multi` command entries
instead of one forge's render. Measured 2026-10-27 on the round-1 repair candidate (P1 baseline
`2fd2f2c6` plus P2/P3 and the review fixes), with the same whitespace and tokens = words × 1.5,
rounded to the nearest 10:

| Entry | Single words | Multi words | Words added | Single tokens | Multi tokens | Tokens added |
|---|---:|---:|---:|---:|---:|---:|
| Next | 1572 | 2181 | +609 | 2360 | 3270 | **+910** |
| Init | 793 | 1145 | +352 | 1190 | 1720 | **+530** |
| Finalize | 2086 | 3367 | +1281 | 3130 | 5050 | **+1920** |
| Next + Finalize | 3658 | 5548 | +1890 | 5490 | 8320 | **+2830** |

The multi entry repeats the three-forge resolver block in each self-contained bash step (a shell
does not keep functions between steps), which is where most of the increment lives. The **proposed**
D5 cap is **3,000 estimated tokens for the combined Next + Finalize multi entry**, measured at 2,830
with 170 tokens of headroom. This number is a proposal for owner ratification under issue #1123
§5 D5, not a settled limit; if the owner adopts it, a future render above it is a new owner
decision rather than an invitation to raise the number.

Reproduce with the same word counter over `commands/<entry>.md` and
`templates/routing/multi/<entry>.md` in this checkout; no generator run is needed because both
sets are committed.

## Reproduce

Use a disposable independent clone at the baseline revision, because rendering writes generated files.
Run these existing generators from that clone's root:

```bash
node scripts/generate-routing-surfaces.js --write
node scripts/sync-cursor-edition.js --write
node scripts/sync-grok-edition.js --write
node scripts/sync-devin-edition.js --write
node scripts/sync-droid-edition.js --write
node scripts/sync-dsh-edition.js --write
node scripts/sync-kimi-edition.js --write
node scripts/sync-opencode-edition.js --write
node scripts/sync-zcode-edition.js --write
```

Then run this read-only measurement from the same root (Node.js, no extra dependency):

```javascript
const fs = require('node:fs');
const globalContract = require('./scripts/kaola-workflow-global-contract.js');
const { registry } = globalContract.loadRegistry();
const source = fs.readFileSync(globalContract.SOURCE_PATH);
const carriers = {
  claude: ['commands/workflow-next.md', 'commands/kaola-workflow-finalize.md'],
  codex: ['plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md',
          'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md'],
  cursor: ['.cursor/commands/workflow-next.md', '.cursor/commands/kaola-workflow-finalize.md'],
  grok: ['.grok/commands/workflow-next.md', '.grok/commands/kaola-workflow-finalize.md'],
  devin: ['.devin/skills/workflow-next/SKILL.md', '.devin/skills/kaola-workflow-finalize/SKILL.md'],
  droid: ['.factory/skills/workflow-next/SKILL.md', '.factory/skills/kaola-workflow-finalize/SKILL.md'],
  dsh: ['.dsh/skills/workflow-next/SKILL.md', '.dsh/skills/kaola-workflow-finalize/SKILL.md'],
  kimi: ['.kimi/skills/workflow-next/SKILL.md', '.kimi/skills/kaola-workflow-finalize/SKILL.md'],
  opencode: ['.opencode/commands/workflow-next.md', '.opencode/commands/kaola-workflow-finalize.md'],
  zcode: ['.zcode/skills/kaola-workflow-next/SKILL.md', '.zcode/skills/kaola-workflow-finalize/SKILL.md'],
};
const words = text => String(text).trim().split(/\s+/u).filter(Boolean).length;
for (const [runtime, files] of Object.entries(carriers)) {
  const target = registry.targets.find(target => target.runtime === runtime);
  const counts = [...files.map(file => words(fs.readFileSync(file))),
    words(globalContract.renderContract({ source, target }))];
  const tokens = counts.map(count => Math.round(count * 1.5 / 10) * 10);
  console.log(runtime, JSON.stringify({ words: counts, estimatedTokens: tokens,
    combined: tokens.reduce((sum, count) => sum + count, 0) }));
}
```

When prompt content changes, rerun on the final generated candidate, update both tables and the
baseline revision, and keep estimates distinct from any provider-reported measurements. Size is
an observation: remove redundant or unused content while preserving required behavior, rather than
treating the table as a reduction target.
