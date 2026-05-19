# Security Review — issue-112

## Verdict: No CRITICAL or HIGH vulnerabilities

### LOW (non-blocking)
1. Missing -- separator on git checkout/push/rebase ref args; leading-hyphen guard already
   prevents flag injection; -- would be defense-in-depth
2. replaceOrAppendLine does not strip newlines from value; in practice Gitea API won't return
   embedded newlines in pr_url/full_name; trivial to add String(value).replace(/[\r\n]/g, ' ')
3. full_name from state file flows into API paths without format validation; constrained by
   trust boundary (state file writable only by commit access)

### Bug observation (pre-existing, not introduced by issue-112)
- forge.js: mergeBody.merge_message_field = options.sha — SHA used as commit message body;
  pre-existing issue, not in this PR's scope

### Clean
- No hardcoded secrets
- isSafeName guards branch/project names
- path.join prevents path traversal
- sinkBlock regex stops at \n## boundary
- replaceOrAppendLine key escaping correct
- execFileSync uses array form (no shell injection)
- readProjectInfo fallback wrapped in try/catch
- No eval, exec(shell), innerHTML
