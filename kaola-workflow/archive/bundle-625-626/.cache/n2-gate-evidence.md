evidence-binding: n2-gate-evidence dd453e9a095e
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: config/prose alignment (glue) — corrected the evidence-persistence contract framing (self-write to return-for-orchestrator-to-persist) and a tool-grant hole in five read-only reviewer/gate agent profiles + their toml twins; no runtime script behavior changed, only agent-facing prose and one frontmatter tools: line, so the appropriate check is the pinned contract validators + full four-chain regression, not a new unit test.
<!-- regression-green|build-green|smoke-integration -->
regression-green: all four npm chains ran sequentially and passed, confirming no regression from the prose/config-only change:
  - npm run test:kaola-workflow:claude -> exit 0 (includes node scripts/validate-workflow-contracts.js -> "Workflow contract validation passed", which pins the literal `finding: id=` needle across all five reviewer .md bodies touched here; also re-run standalone -> exit 0)
  - npm run test:kaola-workflow:codex -> exit 0 (includes node scripts/validate-kaola-workflow-contracts.js, which pins `finding: id=` + `verdict: pass` in the three touched codex .toml bodies)
  - npm run test:kaola-workflow:gitlab -> exit 0
  - npm run test:kaola-workflow:gitea -> exit 0
  - forge-neutrality --forbidden-only re-check on the touched toml files: both gitlab and gitea validators passed ("... forbidden-only check passed (3 file(s))")

## Task

node n2-gate-evidence (bundle-625-626): fix #625 defect 1 (evidence-persistence contract
inversion in five READ-ONLY reviewer/gate agent profiles — they said "Save to .cache/..." /
self-write framing when the canonical contract in commands/kaola-workflow-plan-run.md is
"RETURN evidence text; the orchestrator persists it via record-evidence --stdin") and #625
defect 2 (security-reviewer's Write/Edit tool-grant hole — a reviewer that can self-remediate
what it is supposed to be independently reviewing).

## Write set (14 files, matches the declared write set exactly)

- agents/adversarial-verifier.md
- agents/code-reviewer.md
- agents/security-reviewer.md
- agents/profiles/higher/code-reviewer.md
- agents/profiles/higher/security-reviewer.md
- plugins/kaola-workflow/agents/adversarial-verifier.toml
- plugins/kaola-workflow/agents/code-reviewer.toml
- plugins/kaola-workflow/agents/security-reviewer.toml
- plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitlab/agents/code-reviewer.toml
- plugins/kaola-workflow-gitlab/agents/security-reviewer.toml
- plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml
- plugins/kaola-workflow-gitea/agents/code-reviewer.toml
- plugins/kaola-workflow-gitea/agents/security-reviewer.toml

## What changed

Part A (all five .md profiles + the three .toml twins x3 editions):
- "Output contract" / output-contract bullets: replaced "Save to `.cache/...`" / "Save or
  return content suitable for ..." framing with "Return ... as your FINAL MESSAGE TEXT / your
  returned output — you have no Write/Edit tool and do NOT write any `.cache` file yourself;
  the orchestrator persists it via `record-evidence --stdin`."
- "Machine Verdict" sections: replaced "write a machine-readable verdict block at the TOP
  LEVEL of your `.cache` evidence file" with "include a machine-readable verdict block at the
  TOP LEVEL of your RETURNED text — the orchestrator persists it ... to `.cache/{node-id}.md`
  (or the per-instance adversarial-verifier-{claim-id}.md path for the fan-out case),
  re-injecting this node's `evidence-binding:` header (never add/modify it yourself)."
  Replaced "Emit the block at the very top of the `.cache/...` file" with "Put the block at
  the very top of your returned text, so it lands at the top of the persisted ... file."
- "Machine-Readable Findings" sections: replaced "record ... in the same/SAME `.cache/...`
  file" with "include ... in the same returned text — it is persisted to `.cache/...`".
- Left the `verdict: pass|fail`, `findings_blocking: N`, and `finding: id=...` block formats,
  the closed vocabularies, and the parseNodeVerdict/parseNodeFindings/unresolvedInScopeFixes
  wiring completely untouched — only the delivery-mechanism framing (who persists) changed.
- Verified the toml files remain byte-identical across all three editions (kaola-workflow /
  kaola-workflow-gitlab / kaola-workflow-gitea) per role, both before and after the edit (diff
  exit 0 on all six pairs).

Part B (agents/security-reviewer.md + agents/profiles/higher/security-reviewer.md only):
- `tools:` frontmatter changed from `["Read", "Write", "Edit", "Bash", "Grep", "Glob"]` to
  `["Read", "Grep", "Glob", "Bash"]` (now matches code-reviewer's read-only grant exactly).
- `description:` frontmatter: dropped "and remediation specialist" -> "detection specialist
  ... then routes fixes to the appropriate role."
- Body intro sentence: "identifying and remediating vulnerabilities" -> "identifying
  vulnerabilities ... and routing them to the right fix role."
- "## Emergency Response" numbered list: replaced "Verify remediation works" / "Rotate
  secrets if credentials exposed" (self-remediation-implying) with an explicit route-out step
  ("Route to `fix_role=security` — dispatch a fix agent (security-reviewer, tdd-guide, or
  implementer as appropriate) to remediate; do not edit files yourself") plus a secret-rotation
  flag-and-reverify step, framed as things the orchestrator/fix agent does, not the reviewer.
- Checked the three security-reviewer.toml editions: they already said "Do not edit files."
  (confirmed) and carry no other self-remediation-implying prose beyond the Part A evidence
  framing already fixed above — no further Part-B prose change was needed there (toml carries
  no `tools:` frontmatter; codex controls tool grants elsewhere, per the task brief).
- Left `plan-validator.js`'s `WRITE_ROLES` set, the `finding: id=` / `verdict: pass` machine
  formats, and all runtime script behavior untouched (prose/config alignment only).

## Verification

1. Forge-neutrality re-check on the touched toml files (both passed):
   - `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml plugins/kaola-workflow-gitlab/agents/code-reviewer.toml plugins/kaola-workflow-gitlab/agents/security-reviewer.toml`
     -> "Kaola-Workflow GitLab forbidden-only check passed (3 file(s))"
   - `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml plugins/kaola-workflow-gitea/agents/code-reviewer.toml plugins/kaola-workflow-gitea/agents/security-reviewer.toml`
     -> "Kaola-Workflow Gitea forbidden-only check passed (3 file(s))"
2. Full four-chain regression, run sequentially (before-state = the pre-existing green main
   tree at commit d5f942a8; after-state = with this leg's 14-file change applied):
   - `npm run test:kaola-workflow:claude` -> exit 0, ends "Workflow walkthrough simulation
     passed" + "active-folders-field-parity tests passed (61 assertions)"
   - `npm run test:kaola-workflow:codex` -> exit 0, ends "Kaola-Workflow walkthrough
     simulation passed" + "active-folders-field-parity tests passed (61 assertions)"
   - `npm run test:kaola-workflow:gitlab` -> exit 0, ends "GitLab Codex workflow walkthrough
     simulation passed" + "active-folders-field-parity tests passed (61 assertions)"
   - `npm run test:kaola-workflow:gitea` -> exit 0, ends "Gitea Codex workflow walkthrough
     simulation passed" + "active-folders-field-parity tests passed (61 assertions)"
3. `node scripts/validate-workflow-contracts.js` re-run standalone -> "Workflow contract
   validation passed" (exit 0) — the exact check that pins `finding: id=` across all five
   touched .md reviewer bodies; needle count confirmed present (1 occurrence each) in all
   five .md files and both needles (`finding: id=`, `verdict: pass`) present in all three
   touched kaola-workflow-edition .toml files after the edit.
4. `git status --short` in this leg shows exactly the 14 declared write-set files modified,
   nothing else.

## Verdict

fixed
