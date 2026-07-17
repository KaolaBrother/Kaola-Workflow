selection_mode: auto-bundle

```json
{
  "recommended_bundle": {
    "primary_issue": 712,
    "issues": [712, 716, 717],
    "scope": "schema-2 review-gate profile/runtime resolution across runtime editions (claude + codex)",
    "confidence": "high",
    "rationale": "All three issues are hard blocks in the same review-gate open/preflight subsystem — runtime detection (detectReviewRuntime), per-runtime profile path resolution (reviewerProfilePath), and codex profile preflight role classification — each with a crisp root cause verified at HEAD, sharing one acceptance surface (a schema-2 review gate opens cleanly on fresh claude and codex installs) and one write-lane pattern already established by the #708-#711 fix run.",
    "priority_basis": {
      "frontier": "none — no priority signal in roadmap (ROADMAP.md Active Work table is 'none / No active work', no '### Project rules' block, kaola-workflow/.roadmap/ is empty)",
      "pick_vs_frontier": "no priority signal; ranked by scope-cohesion + severity — this cluster hard-blocks ALL review-gated schema-2 adaptive plans on two supported runtimes (claude per #712, codex per #716+#717, shared downstream repro PetCoder#50), which out-severities the conditional wedge (#713) and toil (#714, #715) clusters",
      "guardrails_honored": "none documented"
    },
    "expected_write_areas": [
      "scripts/kaola-workflow-adaptive-node.js",
      "scripts/kaola-workflow-codex-preflight.js",
      "plugins/kaola-workflow/scripts/",
      "plugins/kaola-workflow-gitlab/scripts/",
      "plugins/kaola-workflow-gitea/scripts/",
      "scripts/test-*.js (preflight mixed-role + runtime-detection fixtures)",
      "install.sh (only if #712 is fixed installer-side rather than resolver-side)",
      "docs/"
    ],
    "risks": [
      "cross-edition script sync: four script trees (scripts/ + three plugin mirrors) must stay behaviorally identical; #716 acceptance explicitly requires GitLab/Gitea preflight mirror alignment (edition-sync.js exists for this)",
      "#712 has two sanctioned fix shapes (installer generates/links profiles into the probed path vs resolver probes ~/.claude/agents/ as fallback) — needs an early design decision; resolver-side likely also re-closes the #708 shape uniformly",
      "detectReviewRuntime regex edits are identity-binding-delicate (see the kimi-before-opencode ordering comments at scripts/kaola-workflow-adaptive-node.js:788-808); a sloppy codex-cache pattern could mis-bind opencode/kimi installs",
      "codex preflight must stay fail-closed for genuinely missing delegated roles after main-session-gate/finalize are excluded (#716 acceptance)"
    ],
    "rejected": [
      { "issue": 708, "reason": "already fixed at HEAD by f8f0c909 (merged a1b3a1ed): opencode profile resolution + resolved_profile_hash re-stamp; open only pending acceptance — verify/close, do not re-work" },
      { "issue": 709, "reason": "already fixed at HEAD by f8f0c909: TEST_CONSUMED_PATHS scoped to self-host repos via detectSelfHostNpm" },
      { "issue": 710, "reason": "already fixed at HEAD by f8f0c909: --verdict-check/--finalize-check candidate band agreement" },
      { "issue": 711, "reason": "already fixed at HEAD by f8f0c909: branchless in-place sink completion (branch: TBD)" },
      { "issue": 713, "reason": "high severity (unrecoverable-claim wedge) but conditional on pass-then-later-fail serial multi-gate plan shapes; different subsystem (repair/replan lifecycle, deriveRepairDelta) from the gate-open path; deferred — natural follow-up bundle with #714" },
      { "issue": 714, "reason": "same adaptive-lifecycle scope as #713 (close-node compliance appender vs validator); guaranteed per-cycle toil but no hard block; deferred to the #713 follow-up bundle" },
      { "issue": 715, "reason": "sink/release residue scope (claim release discard archive + interrupted-sink receipt as foreign_dirt); manual-unblock toil only after claim release; single-issue follow-up" }
    ]
  },
  "survey_evidence": {
    "backlog": "10 open issues on github.com/KaolaBrother/Kaola-Workflow: #708-#717 (full inventory via gh issue list --state open, 2026-07-17)",
    "fixed_at_head_but_open": "#708, #709, #710, #711 — all four are claimed fixed by commit f8f0c909 'fix(review): reviewer profile resolution across runtime editions + validation/sink hardening (#708-#711)', merged via a1b3a1ed (current HEAD, v6.23.1 / Codex 4.23.1); no other commits reference #712-#717",
    "active_work": "no active workflow folders under kaola-workflow/ (only archive/ with 351 entries + ROADMAP.md); claim status count 0 — no claimed, live, stale, or ambiguous lanes; no red classifications possible",
    "roadmap_signals": "kaola-workflow/.roadmap/ verified empty (0 entries); ROADMAP.md generated mirror shows no active work and carries no '### Project rules' sequencing block — priority fell back to scope-cohesion + issue-stated severity",
    "root_cause_verified_at_HEAD": {
      "712": "install.sh:36 installs profiles to $HOME/.claude/agents while install.sh:129 puts support scripts at ~/.claude/kaola-workflow; reviewerProfilePath (scripts/kaola-workflow-adaptive-node.js:856) claude branch probes only __dirname/../agents/{role}.md = ~/.claude/kaola-workflow/agents/ — the #708 fix added probing for opencode (814-833) and kimi (834-855) runtimes only, claude still mismatched",
      "716": "scripts/kaola-workflow-codex-preflight.js:2755 rolesNotInTemplate = planRoles.filter(r => !templateRoles.includes(r)); readPlanRoles (2175-2212) collects every role in the ## Nodes table with no non-delegable exclusion for main-session-gate/finalize; no NON_DELEG guard exists in the file",
      "717": "scripts/kaola-workflow-adaptive-node.js:787 codex regex requires plugins/kaola-workflow[-gitlab|-gitea]/scripts$ — the real cache path ~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/4.23.1/scripts matches neither it nor the opencode pattern (806, version segment + plugins/ guard), so detection falls through to 'claude' (809) and probes agents/{role}.md instead of agents/{role}.toml"
    },
    "bundle_rules_check": "all 3 issues open and unclaimed; no active work to classify red against; no depends-on labels or external dependencies (#712's sibling #708 fix already landed); coherent single subsystem; compatible write lanes (one adaptive DAG, precedent: f8f0c909 touched all four script trees in one run); count 3 <= KAOLA_BUNDLE_MAX_ISSUES default 4"
  }
}
```
