#!/usr/bin/env bash
# Claude Code status line: process id, session id and context window
# usage. Reads the status line JSON on stdin; see
# https://code.claude.com/docs/en/statusline
#
# Output:   pid: 2159799 · session: <session_id> · context: 84k/1M (8%)
#           branched from: <session_id>           (only after /branch)
#           forked from: <session_id>             (only in a ⑂ fork)
# Enabled by statusLine.command in ~/.claude/settings.json.
#
# Written with Claude Opus 5.5 (Claude Code), 2026-10-21.

# The JSON has no PID, so walk up the parent processes to the one named
# claude. Prints ? when there is none, e.g. when run by hand.
pid=$PPID
while [ "${pid:-1}" -gt 1 ] && [ "$(ps -o comm= -p "$pid")" != claude ]; do
  pid=$(ps -o ppid= -p "$pid" | tr -d ' ')
done
[ "${pid:-1}" -gt 1 ] || pid='?'

input=$(cat)

# /branch stamps each message it copies into the new transcript with
# forkedFrom.sessionId, the session it branched from. The copied lines
# come first, so grep -m1 stops early even in a long transcript.
transcript=$(jq -r '.transcript_path // empty' <<<"$input")
self=$(jq -r '.session_id // empty' <<<"$input")
parent=''
via=''
if [ -f "$transcript" ]; then
  parent=$(grep -m1 '"forkedFrom"' "$transcript" \
    | jq -r '.forkedFrom.sessionId // empty' 2>/dev/null)
  [ -n "$parent" ] && via=branched

  # A background fork has no forkedFrom. It queues a <fork-source>
  # notice instead, and each copied line keeps the session_id of the
  # session that wrote it. The last foreign one is the fork's parent.
  # The marker check matters: /clear also copies foreign lines.
  if [ -z "$parent" ] && [ -n "$self" ] && grep -qF -m1 \
    '"content":"<task-notification>\n<fork-source>' "$transcript"; then
    parent=$(tac "$transcript" \
      | grep -oE '"session_id":"[0-9a-f-]{36}"' \
      | grep -m1 -vF "$self" | cut -d'"' -f4)
    [ -n "$parent" ] && via=forked
  fi
fi

jq -r --arg pid "$pid" --arg parent "$parent" --arg via "$via" <<<"$input" '
  # Shorten a token count: 84213 -> 84k, 1000000 -> 1M.
  def k:
    if . >= 1000000 then "\(. / 1000000 * 10 | floor / 10)M"
    elif . >= 1000 then "\(. / 1000 | floor)k"
    else "\(.)" end;

  # Counts come from the last API response, so this can trail /context
  # slightly. Fields are null before the first response and after
  # /compact, hence the // fallbacks.
  .context_window as $c
  | "  pid: \($pid)"
    + " · session: \(.session_id)"
    + " · context: \(($c.total_input_tokens // 0) | k)"
    + "/\(($c.context_window_size // 200000) | k)"
    + " (\(($c.used_percentage // 0) | floor)%)"
    + if $parent != "" then "\n  \($via) from: \($parent)" else "" end
'
