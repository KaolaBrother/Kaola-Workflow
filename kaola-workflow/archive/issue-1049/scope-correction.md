# Owner scope correction for issue #1049

The owner clarified that the intended change was primarily the Codex model mapping and that changes outside that boundary must be discussed before implementation. The orchestrator had expanded instruction adaptation into shared authorization, dispatch and evidence-reuse policy. That expansion was not necessary to switch Codex models and is withdrawn.

Final scope:

- Standard Codex roles remain Luna/max; reasoning and heavy roles use Astra/medium and Astra/high across the three Codex forge adapters and generated carriers.
- Preserve native model inheritance, role membership and all other runtime model and instruction behavior.
- Keep the independently completed terminal CLI upgrade to 0.153.4, corresponding documentation and focused/full acceptance.
- Restore this run's shared global/routing/role-policy edits to the starting baseline, including their generated and installed carriers. Cursor's original static prompt budget stays unchanged.
- After implementation finalization, publish the owner-requested 10.3.0 release and install it to all seven supported local runtimes.
- Experimental context management remains excluded.

Earlier audit, implementation, installation and review records describe intermediate candidates. They remain preserved as history and do not authorize the withdrawn shared-policy changes. The final readiness result, finalization summary and release receipts must describe only the narrowed delivered scope.

The orchestrator owns the scope error. Repository author-source rules determine where an authorized change is authored; they do not expand what the owner authorized.
