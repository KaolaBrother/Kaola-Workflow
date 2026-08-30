# Probe repository archive provenance

This directory was the disposable Git repository used for Issue #1046 local and Cursor Cloud
instruction-composition probes. Before archival it was at commit
`dc22fa4be1496448cbb08ab6752d1187e61113e6`.

The first sink recorded the directory as an embedded-repository gitlink, which would omit its
contents from a fresh clone. Finalization therefore removed only the nested `.git` boundary and
committed the tracked probe files as ordinary archive evidence. The removed nested Git metadata was
moved intact to `/Users/ylpromax5/.Trash/kaola-workflow-1046-probe-repo.git` for recoverability.
