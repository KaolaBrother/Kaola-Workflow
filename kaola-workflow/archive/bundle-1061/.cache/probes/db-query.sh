#!/bin/bash
set -euo pipefail
DB="${1:-$HOME/.local/share/devin/cli/sessions.db}"
PARENT="${2:-}"

echo "=== parent session: $PARENT ==="
sqlite3 "$DB" "SELECT id, model, created_at, last_activity_at FROM sessions WHERE id = '$PARENT';"

echo ""
echo "=== subagent heads for parent $PARENT ==="
sqlite3 "$DB" "SELECT agent_id, chain_node_id FROM subagent_heads WHERE session_id = '$PARENT';"

echo ""
echo "=== message_nodes generation_model for parent and subagents ==="
sqlite3 "$DB" <<SQL
WITH RECURSIVE chain(node_id, depth) AS (
  SELECT chain_node_id, 0 FROM subagent_heads WHERE session_id = '$PARENT'
  UNION ALL
  SELECT m.parent_node_id, c.depth + 1
  FROM message_nodes m
  JOIN chain c ON m.node_id = c.node_id
  WHERE m.parent_node_id IS NOT NULL AND c.depth < 100
)
SELECT DISTINCT s.id as session_id, s.model, m.metadata
FROM message_nodes m
JOIN sessions s ON m.session_id = s.id
WHERE s.id IN (
  SELECT DISTINCT m2.session_id FROM message_nodes m2
  JOIN chain c ON m2.node_id = c.node_id
)
ORDER BY s.id;
SQL

echo ""
echo "=== generation_model counts per session ==="
sqlite3 "$DB" <<SQL
WITH RECURSIVE chain(node_id, depth) AS (
  SELECT chain_node_id, 0 FROM subagent_heads WHERE session_id = '$PARENT'
  UNION ALL
  SELECT m.parent_node_id, c.depth + 1
  FROM message_nodes m
  JOIN chain c ON m.node_id = c.node_id
  WHERE m.parent_node_id IS NOT NULL AND c.depth < 100
)
SELECT s.id, json_extract(m.metadata, '$.generation_model') as gm, count(*) as n
FROM message_nodes m
JOIN sessions s ON m.session_id = s.id
WHERE s.id IN (
  SELECT DISTINCT m2.session_id FROM message_nodes m2
  JOIN chain c ON m2.node_id = c.node_id
)
  AND json_extract(m.metadata, '$.generation_model') IS NOT NULL
GROUP BY s.id, gm
ORDER BY s.id, n DESC;
SQL
