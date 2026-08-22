# Issue #1013 cold-session Cursor evidence

## Isolation and installed bytes

- Cursor CLI: `2026.08.11-e8db854`; authenticated as the existing user account.
- Isolated project: `/tmp/kw-cursor-1013.UBJHl1`.
- Install command: `./install-cursor.sh --target /tmp/kw-cursor-1013.UBJHl1 --no-scripts --yes`.
- Install result: 14 generated agents and 3 commands copied into the isolated project's `.cursor/` tree; user support scripts, hooks, config, and live agents were not touched.
- Installed `implementer.md`: exact raw line `model: grok-4.6[effort=medium]`.
- Installed `code-reviewer.md`: exact raw line `model: grok-4.6[effort=high]`.

## Fresh parent and no-override dispatch

- Command shape: a new `agent -p --output-format stream-json` chat, model `cursor-grok-4.6-xhigh`, workspace set to the isolated project, with instructions to dispatch fresh `implementer` and `code-reviewer` Tasks and omit the per-call model argument.
- Fresh parent session: `9c0b65bf-b333-43af-861e-1ddaa15cdb9f`.
- Parent init model: `Cursor Grok 4.6 Extra High`.
- The parent created both fresh custom-agent Tasks in parallel and did not request a per-call model override. Cursor's streamed Task envelopes then exposed the resolved model injected from each custom agent definition:
  - standard: `subagentType.custom.name = implementer`, `model = cursor-grok-4.6-medium`, launch agent id `d21cadf4-5643-4047-b683-83ebb2fa405f`.
  - reasoning: `subagentType.custom.name = code-reviewer`, `model = cursor-grok-4.6-high`, launch agent id `d5688f07-30fe-4bc6-9f54-0eca76b1edff`.
- Both Tasks completed successfully. The standard child returned marker `STANDARD_CHILD`; the reasoning child returned `REASONING_CHILD`. Both self-identified only as `Cursor Grok 4.6`, confirming that display identity is not an effort oracle.
- Each child reported no `cursor-grok-4.6` entries visible in its own nested Task allowlist. That nested allowlist is therefore not an effort oracle in this custom-child path; the parent stream's resolved Task envelope is the direct carrier evidence.
- Parent result: success, 35.647 seconds; no file or shell tool was called by the measurement prompt.

## Durable raw-stream rerun after independent review

- Review correctly found that the first summary did not itself preserve the outer stream events. The measurement was repeated in a second brand-new chat, and all 25 newline-delimited JSON events were retained verbatim at `kaola-workflow/issue-1013/.cache/live-cursor-stream.ndjson` (SHA-256 `8977fc640ce30878fb47aac836d95a4239bc7f85d912d19af7dcf1f543d375a4`).
- Second parent session: `533e84fc-63e5-4d6a-8a98-75984684a06f`; init model `Cursor Grok 4.6 Extra High`.
- The retained user event instructs fresh parallel custom Tasks, explicitly omits the model argument on both authored calls, forbids resume, and requests markers only.
- The retained started and completed envelope pairs bind:
  - `implementer` to `cursor-grok-4.6-medium`, launch id `e73c5992-8fd1-4271-a11f-eec300d37db7`, successful result `STANDARD_CHILD_2`.
  - `code-reviewer` to `cursor-grok-4.6-high`, launch id `a31dcaab-f0ba-4368-a66e-50dd845b583d`, successful result `REASONING_CHILD_2`.
- Machine re-read: parsing every non-empty line with `JSON.parse` returned 25/25 valid events, parent xhigh, exactly the two expected started envelopes, and exactly the two expected completed envelopes/results.

## Verdict

`PASS` — after a real installer deployment and two fresh Cursor chats, model-free custom-agent dispatch resolved the standard and reasoning roles to distinct Grok 4.6 effort slugs (`medium` and `high`) while the xhigh parent remained different. The second run's complete raw stream is durable and machine-parseable, closing the independent-review evidence gap. The family clamp did not swallow the two generated frontmatter pins, so no typed deferral or `Task(model=)` workaround is needed.
