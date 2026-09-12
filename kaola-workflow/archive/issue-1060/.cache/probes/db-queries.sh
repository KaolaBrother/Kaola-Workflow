#!/usr/bin/env bash
# Evidence extraction from the Devin session DB for a given session id.
# usage: db-queries.sh <session-id>
set -uo pipefail
S="$1"; DB=~/.local/share/devin/cli/sessions.db
echo "== session row"; sqlite3 "$DB" "select id, model, agent_mode, working_directory, datetime(created_at,'unixepoch') from sessions where id='$S'"
echo "== subagent heads"; sqlite3 "$DB" "select agent_id, chain_node_id from subagent_heads where session_id='$S'"
echo "== 'powered by' lines (node_id, parent, snippet)"
sqlite3 "$DB" "select node_id, coalesce(parent_node_id,'root'), substr(chat_message, instr(chat_message,'You are powered by'), 90) from message_nodes where session_id='$S' and chat_message like '%You are powered by%' order by node_id"
echo "== tool names that appeared in tool_call_state"
sqlite3 "$DB" "select tool_call_json from tool_call_state where session_id='$S'" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c={};for(const l of s.split("\n")){if(!l)continue;try{const j=JSON.parse(l);const n=j.title||j.kind||(j.rawInput&&j.rawInput.tool)||"?";c[n]=(c[n]||0)+1}catch(e){c["unparsed"]=(c["unparsed"]||0)+1}}console.log(JSON.stringify(c,null,1))})'
echo "== generation_model / model_name fields anywhere in metadata"
sqlite3 "$DB" "select node_id, metadata from message_nodes where session_id='$S' and metadata like '%model%' order by node_id limit 40" | cut -c1-300
