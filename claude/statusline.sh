#!/usr/bin/env bash
# Claude Code status line: session id, process id and context window
# usage. Reads the status line JSON on stdin; see
# https://code.claude.com/docs/en/statusline
#
# Output:   <session_id> (<pid>) · 84k/1M (8%)
#           └ <parent_session_id> (<parent pid>)   (only in a branch/fork)
# The parent pid shows only while another process runs that session.
# A ⑂ fork marks its parent with ⑂; a /branch has no marker.
# Enabled by statusLine.command in ~/.claude/settings.json.
#
# Written with Claude Opus 5.5 (Claude Code), 2026-10-21; compact
# layout 2026-11-08.

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
mark=''
if [ -f "$transcript" ]; then
  parent=$(grep -m1 '"forkedFrom"' "$transcript" \
    | jq -r '.forkedFrom.sessionId // empty' 2>/dev/null)
  # A background fork has no forkedFrom. It queues a <fork-source>
  # notice instead, and each copied line keeps the session_id of the
  # session that wrote it. The last foreign one is the fork's parent.
  # The marker check matters: /clear also copies foreign lines.
  if [ -z "$parent" ] && [ -n "$self" ] && grep -qF -m1 \
    '"content":"<task-notification>\n<fork-source>' "$transcript"; then
    parent=$(tac "$transcript" \
      | grep -oE '"session_id":"[0-9a-f-]{36}"' \
      | grep -m1 -vF "$self" | cut -d'"' -f4)
    [ -n "$parent" ] && mark='⑂'
  fi
fi

# Find a live process running the parent session. Claude Code writes
# ~/.claude/sessions/<pid>.json (undocumented) and leaves stale files
# behind, so keep a pid only if it is alive and its start time matches
# procStart, which rules out a reused pid. Our own pid is skipped: a
# fork shares its parent's process, so it would only repeat line 1.
parent_pid=''
if [ -n "$parent" ]; then
  while read -r p start; do
    [ "$p" = "$pid" ] && continue
    [ -r "/proc/$p/stat" ] || continue
    # Field 22 is starttime; split after the last ) since comm may
    # contain spaces.
    now=$(sed 's/.*) //' "/proc/$p/stat" | awk '{print $20}')
    [ "$now" = "$start" ] && { parent_pid=$p; break; }
  done < <(jq -r --arg s "$parent" \
    'select(.sessionId == $s) | "\(.pid) \(.procStart)"' \
    ~/.claude/sessions/*.json 2>/dev/null)
fi

jq -r --arg pid "$pid" --arg parent "$parent" --arg ppid "$parent_pid" \
  --arg mark "$mark" <<<"$input" '
  # Shorten a token count: 84213 -> 84k, 1000000 -> 1M.
  def k:
    if . >= 1000000 then "\(. / 1000000 * 10 | floor / 10)M"
    elif . >= 1000 then "\(. / 1000 | floor)k"
    else "\(.)" end;

  # Counts come from the last API response, so this can trail /context
  # slightly. Fields are null before the first response and after
  # /compact, hence the // fallbacks.
  .context_window as $c
  | "\(.session_id) (\($pid))"
    + " · \(($c.total_input_tokens // 0) | k)"
    + "/\(($c.context_window_size // 200000) | k)"
    + " (\(($c.used_percentage // 0) | floor)%)"
    + if $parent != "" then
        "\n└ " + (if $mark != "" then "\($mark) " else "" end) + $parent
        + if $ppid != "" then " (\($ppid))" else "" end
      else "" end
'
