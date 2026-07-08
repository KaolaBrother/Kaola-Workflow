issue: #640
title: harden OPT-2 metric_paths shape check — bare-existing-directory + backslash + absolute paths (defense-in-depth, same family as #639 R2/R5)
status: open
workflow_project: —
next_step: P3: extend the OPT-2 metric_paths shape test (plan-validator.js) to refuse bare-existing-directory (no trailing slash, statSync-detected), backslash, and absolute-path metric_paths entries — the shape classes the write-set freeze wall already refuses (statSync :1428-1432, backslash :1410) but OPT-2 does not yet mirror. Reuse the write-set wall's refusals; + accept/refuse walkthrough fixtures; canonical plan-validator.js + regen sync:editions; cross-edition #307. Inert today (backslash dies at dispatch on POSIX; bare-dir/absolute depend on the runtime consumer + OPT-5 change-gate metric reproduction backstop) — pure defense-in-depth completeness. Surfaced by #634's own gates + bundle-638-639's n3-review (bare-dir/backslash) + n4-adversary (absolute-path, finding A1).
