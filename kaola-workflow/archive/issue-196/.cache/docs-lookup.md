docs-lookup: N/A - internal patterns sufficient

The fix is purely an internal subprocess env override (KAOLA_WORKFLOW_OFFLINE: '0' in spawnSync env).
No external library, framework, or API behavior is involved. All relevant patterns are already established
in the GitHub and Gitea walkthrough scripts within this codebase.
