issue: #689
title: enhancement(scripts): fast/full/phase4-advance writeFileAtomic missing parent-dir fsync — same gap #685 fixed on the adaptive path
status: open
workflow_project: —
next_step: #685 added the parent-directory fsync to the adaptive path's writeFileAtomicReplace (adaptive-schema.js + roadmap.js). Three differently-named copies of the same tmp+fsync+rename algorithm carry the identical missing-parent-dir-fsync gap on the install-time opt-in fast/full six-phase paths: kaola-workflow-full-advance.js, kaola-workflow-fast-advance.js, kaola-workflow-phase4-advance.js (each `function writeFileAtomic`). Apply the same fix: fsync the parent directory after renameSync, platform fail-soft (never turn an accepted write into a refusal, never swallow a real rename/ENOSPC error). Non-vacuous regression per helper via the fs-singleton monkey-patch seam; cross-edition parity + chains for any edition-ported copies. See docs/decisions/D-683-01.md. Full body on GitHub #689.
