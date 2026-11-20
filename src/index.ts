#!/usr/bin/env bun
import { readGit } from "./git.ts";
import { stripAnsi } from "./format.ts";
import { render } from "./render.ts";
import type { StatusInput } from "./types.ts";

// Claude Code shows the status line only when the command exits 0, so never throw:
// a broken HUD should degrade to a short message, not disappear.
async function main(): Promise<void> {
  let input: StatusInput = {};
  try {
    const raw = await Bun.stdin.text();
    if (raw.trim()) input = JSON.parse(raw) as StatusInput;
  } catch {
    process.stdout.write("claude-hud: bad input\n");
    return;
  }

  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd();
  // CLAUDE_HUD_NOW (epoch seconds) pins the clock so the demo fixture renders the same every time.
  const now = process.env.CLAUDE_HUD_NOW ? Number(process.env.CLAUDE_HUD_NOW) : undefined;
  // Claude Code captures stdout, so `tput cols` doesn't work; it passes the width in COLUMNS.
  // Keep a small margin for the UI's own padding.
  const columns = Number(process.env.COLUMNS);
  const width = columns > 0 ? columns - 2 : undefined;
  let out = render(input, readGit(cwd), now, width);
  if (process.env.NO_COLOR) out = stripAnsi(out);
  process.stdout.write(out + "\n");
}

await main();
