# dispatch-hook node evidence

## RED

Hook script did not yet exist. Verified before creation:

```
CONFIRMED: hook does not exist yet (RED state)
CONFIRMED: no dispatch-log.jsonl yet (RED state)
```

Running the hook would have failed with "No such file or directory"; the
dispatch-log.jsonl would not be created. The test assertion (`grep agent_type`)
would fail.

## GREEN

After writing `hooks/kaola-workflow-subagent-dispatch-log.sh`, copying byte-identically
to both plugin hook dirs, and making all three executable:

TDD repro (active project):
```
Hook exit code: 0
PASS: dispatch-log.jsonl created
Content: {"ts":"2026-06-07T05:49:28Z","agent_type":"contractor","agent_id":"abc","cwd":"/x"}
PASS: agent_type=contractor found
PASS: agent_id=abc found
```

No-active-project (clean no-op):
```
No-active-project exit code: 0
PASS: no dispatch-log.jsonl for inactive project (clean no-op)
```

All tests run in $TMPDIR repos — no dispatch-log.jsonl created in the live repo.

## hooks.json JSON.parse confirmations

```
claude hooks.json: OK
gitlab hooks.json: OK
gitea hooks.json: OK
```

## Forge validator exit codes

```
Kaola-Workflow GitLab contract validation passed  (exit 0)
Kaola-Workflow Gitea contract validation passed   (exit 0)
```

## Byte-sync check

All three .sh copies are byte-identical (diff returned no output, exit 0):
- hooks/kaola-workflow-subagent-dispatch-log.sh
- plugins/kaola-workflow-gitlab/hooks/kaola-workflow-subagent-dispatch-log.sh
- plugins/kaola-workflow-gitea/hooks/kaola-workflow-subagent-dispatch-log.sh

## Scope note

install.sh wiring (registering the hook in each edition's install.sh) and
byte-sync registration (asserting byte-identity in the contract validators) are
deferred to the install-wiring node as declared in the issue spec.

Simulate-coverage (adding walkthrough test coverage for the hook behavior) is
deferred to the simulate-coverage node as declared in the issue spec.
