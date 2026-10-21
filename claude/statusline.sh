#!/usr/bin/env bash
# Claude Code status line: session id and context window usage.
# Reads the status line JSON on stdin; see
# https://code.claude.com/docs/en/statusline
#
# Output:   session: <session_id> · context: 84k/1M (8%)
# Enabled by statusLine.command in ~/.claude/settings.json.
#
# Written with Claude Opus 5.5 (Claude Code), 2026-10-21.

jq -r '
  # Shorten a token count: 84213 -> 84k, 1000000 -> 1M.
  def k:
    if . >= 1000000 then "\(. / 1000000 * 10 | floor / 10)M"
    elif . >= 1000 then "\(. / 1000 | floor)k"
    else "\(.)" end;

  # Counts come from the last API response, so this can trail /context
  # slightly. Fields are null before the first response and after
  # /compact, hence the // fallbacks.
  .context_window as $c
  | "  session: \(.session_id)"
    + " · context: \(($c.total_input_tokens // 0) | k)"
    + "/\(($c.context_window_size // 200000) | k)"
    + " (\(($c.used_percentage // 0) | floor)%)"
'
