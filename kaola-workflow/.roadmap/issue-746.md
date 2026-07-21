issue: #746
title: bug(sink-merge): reports status:"sinked" while silently skipping archive+roadmap — empty-missing[] epoch-authority refusal treated as historical silent skip
status: ready — filed 2026-07-21 (post-v6.24.0 audit; observed live at the epic Phase E close, archive completed manually)
workflow_project: —
next_step: BATCH 3 — co-designed with #719/#735 (opposing directions on the same epoch-authority check): loud-fail swallowed refusals at sink; status sinked must imply archive dir exists + roadmap source removed
