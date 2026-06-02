# Task 2: GitLab test harness — add 2 withForge blocks

## File Modified
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

## Insertions (lines 539-571)
Block 1: kw-gl-fast-fence-heading-, IIDs 30/31, project fast-fence-heading-project
  ## Scope: ```sh\n## Some Heading\n``` then - Write Set path
Block 2: kw-gl-fast-fence-mixed-, IIDs 32/33, project fast-fence-mixed-project
  ## Scope: ```sh\n~~~\n## Heading\n``` then - Write Set path

## RED Evidence (failing-first)
- Block 1: AssertionError: 'green' !== 'red' (## Some Heading truncates section body)
- Block 2: AssertionError: 'green' !== 'red' (naive toggle closes fence on ~~~)

## Status
COMPLETE (failing-first confirmed for both blocks)
