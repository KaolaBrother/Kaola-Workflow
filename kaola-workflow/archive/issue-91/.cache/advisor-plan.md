# Advisor Plan Gate - issue-91

Verdict: plan accepted with one constraint.

The plan covers all acceptance criteria. The important constraint is that the
policy helper must not treat plain `invoked` rows as delegation-policy rows.
Those rows must remain valid only when their requirements are recognized
non-Codex-role gates and the relevant skill docs include the explanatory
comment. This preserves the issue #91 distinction instead of silently allowing
arbitrary `invoked` rows under a delegation policy.

No blueprint revision required.
