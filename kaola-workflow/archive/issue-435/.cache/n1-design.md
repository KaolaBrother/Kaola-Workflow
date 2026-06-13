evidence-binding: n1-design 68560ebc8003

# n1-design — settled contract for #435 (run-gap capture gate)

ANTI-FABRICATION CORRECTION (verified across 43 logs): dispatch-log.jsonl = {ts,agent_type,agent_id,cwd}; provenance-log.jsonl = {timestamp,event,nodeId,nonce,by} (event in {open,close}); node-timings = {node,event,ts}. NONE carry result:refuse/reason/force. A per-finding reason-class scanner is impossible. The machine-reliable defect signals are: (1) provenance reopens (nodeId with >1 open = in-run repair, e.g. issue-442 reopened n2/n3), (2) chain-receipt accepted_red:true (deferred red chain), (3) optional operator-seeded .cache/run-gaps-manual.md (gap: <class> — <line>).

SCANNER kaola-workflow-gap-sweep.js --project P --json (mirrors run-chains.js shape): reads ONLY kaola-workflow/P/.cache/* (scope guard, no archive bleed). Reason classes (closed enum): in_run_repair (sample=nodeId,count=extra opens), deferred_red_chain (sample=<chain>:<issue>), manual:<slug> (sample=line). Dedup by (reasonClass,sample). Writes .cache/run-gaps.json + emits {result:"swept",project,sweptClasses:[{reasonClass,count,sample}],artifact}. result always "swept", exit 0. Empty=>sweptClasses:[].

GATE --check [--json]: reads .cache/run-gaps.json + finalization-summary.md ## Run gaps section. Section grammar (one line per (class,sample)): "- <reasonClass> (<sample>): filed: #N"  OR  "- <reasonClass> (<sample>): noise: <one-line justification>". Online: probe each filed:#N exists (offline=>skip + verification:offline). Refuse {result:'refuse',reason:'gaps_unswept',unmapped:[{reasonClass,sample}]} exit 1 when: section absent (all classes unmapped) OR any swept tuple unmatched OR filed:#N missing online. Pass {result:'pass',mapped,filed,noise} exit 0. Empty sweep => pass vacuously even w/o section.

WIRING (NO cmdFinalize/claim.js edit, mirrors #432 run-chains writer-at-Step-8c): contractor.md add Step 8c.2 after Step-8c (~line 248): run --json (writes run-gaps.json) then --check (gate); capture real exit; surface gaps_unswept + stop. contractor.toml sibling bullet after #27. finalize.md add ### Run-Gap Sweep Gate after ### Chain-Receipt Gate (~after 94) + ## Run gaps line in the summary template (~472). 3 finalize SKILLs: same subsection after their ### Chain-Receipt Gate. (six-surface #400: 3 finalize cmds + 3 finalize SKILLs.)

REGISTRATION (mirror run-chains exactly): validate-script-sync.js COMMON_SCRIPTS (after kaola-workflow-release.js ~L85) + RENAME_NORMALIZED_FAMILIES family (after release family ~L266); kaola-workflow-install-manifest.js SUPPORT_SCRIPTS (~L84) in BOTH #274 byte copies (scripts/ + plugins/kaola-workflow/scripts/); package.json test:kaola-workflow:claude add node scripts/test-gap-sweep.js after test-release.js (DO NOT orphan like test-run-chains.js); gitlab+gitea contract validators add the forge port name to BOTH lists each (scriptFiles ~L272 + installSupportScripts ~L298/299). install.sh single-sources from manifest (no edit). edition-sync consumes COMMON_SCRIPTS (no manual edit). gap-sweep IS in SUPPORT_SCRIPTS (runtime, run by contractor at finalize) unlike release.js.

GOAL-PROSE (n7, in workflow-next.md + 3 SKILLs ONLY — NOT CLAUDE.md, out of frozen write set): "finishing an issue INCLUDES capturing its run-discovered defects; each gap filed (filed:#N) or justified (noise:<reason>); filing satisfies the goal, silent deferral violates it + gaps_unswept refuses."

D-435-01 (n10): mirror D-432-01 template. n10 write set = CHANGELOG/D-435-01/conventions.md/architecture.md ONLY (api.md + README are OUT of frozen write set => skip).

CONSTRAINT CONFIRMED: no edit to kaola-workflow-claim.js (cmdFinalize), kaola-workflow-release.js, ports, or test-release.js.
