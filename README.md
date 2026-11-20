# claude-hud

A custom status line (HUD) for Claude Code CLI, written in TypeScript and run with Bun.

```
Opus 5.5 ✻ think medium ✎ Explanatory · NuclleaR/claude-hud/src · ⧉ cache-hud ← main · +1 dir ·  main ↑1 +2 ~1 ?3 · PR #42 ● · +156 −23
Context ●●○○○○○○○○ 20% (196k/1M) │ $1.23 · ⏱️ 12m34s │ ●●●●○○○○○○ 42% (2h 15m / 5h) │ ●○○○○○○○○○ 6% (6d 3h / 7d) │ cache ● 93% (3m / 5m) · 1 miss
```

- **Line 1:** model, `✻ think` when extended thinking is on, effort, output style (hidden when `default`), repo `owner/name` (or folder) and subdirectory,
  worktree and the branch it came from, extra `--add-dir` directories, git branch, ahead/behind, staged/modified/untracked/conflicted counts,
  open PR/MR for the branch (clickable; ✓ approved, ✗ changes requested, ● pending, `draft`), lines added and removed.
- **Line 2:** dot progress bars (`●○`): context fill, session cost and duration, then the
  claude.ai 5-hour and 7-day usage limits with time left until reset, then the prompt cache: hit ratio and time
  left before it goes cold (yellow under a minute), or `○ cold`. Limits are gray below 50 %, yellow up to 80 %, red above.

### Context health

| Threshold | Colour | Extra |
|-----------|--------|-------|
| <40 %     | green  | — |
| 40–50 %   | yellow | — |
| >50 %     | red    | token breakdown `[in · cache read · write · out]` |
| >55 %     | red    | breakdown + `⚠ COMPACT` |

## Setup

```sh
bun install
```

In `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "bun /absolute/path/to/claude-hud/src/index.ts",
  "padding": 0
}
```

## Development

```sh
bun run demo       # render fixtures/sample.json
bun test
bun run typecheck
```

Rows longer than the terminal (`COLUMNS`, which Claude Code sets for the command) wrap between segments, never
inside a bar or link. Try `COLUMNS=80 bun run demo`.

Claude Code passes session state as JSON on stdin; the schema is documented at
<https://code.claude.com/docs/en/statusline>. Set `NO_COLOR=1` to disable ANSI colours.
