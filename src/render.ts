import { homedir } from "node:os";
import { basename, relative } from "node:path";
import type { GitInfo } from "./git.ts";
import type { StatusInput } from "./types.ts";
import {
  bar,
  color,
  formatCost,
  formatDuration,
  formatRemaining,
  formatTokens,
  link,
  paint,
  palette,
  severity,
  stripAnsi,
} from "./format.ts";

const SEP = color.dim(" · ");

export function renderModel(input: StatusInput): string {
  const name = input.model?.display_name ?? input.model?.id ?? "?";
  const effort = input.effort?.level;
  // "default" is the normal style, so only non-default styles are worth the space.
  const style = input.output_style?.name;
  const styleText = style && style.toLowerCase() !== "default" ? color.cyan(` ✎ ${style}`) : "";
  const thinking = input.thinking?.enabled ? color.yellow(" ✻ think") : "";
  return color.magenta(color.bold(name)) + thinking + (effort ? color.dim(` ${effort}`) : "") + styleText;
}

/**
 * Project label plus the subdirectory when Claude has cd'd below the project root.
 * With an `origin` remote the label is `owner/name` (prefixed by the host unless it is
 * github.com) instead of the folder name.
 */
export function renderDir(input: StatusInput, home = homedir()): string {
  const current = input.workspace?.current_dir ?? input.cwd;
  const project = input.workspace?.project_dir;
  if (!current) return "";

  const repo = input.workspace?.repo;
  const label = (dir: string) => {
    if (repo?.owner && repo.name) {
      const host = repo.host && repo.host !== "github.com" ? `${repo.host}/` : "";
      return color.blue(`${host}${repo.owner}/${repo.name}`);
    }
    return color.blue(basename(dir));
  };

  if (project && current !== project && current.startsWith(project + "/")) {
    return label(project) + color.dim("/" + relative(project, current));
  }
  if (project && current === project) return label(project);
  // Outside the project: show the full path with ~ for home.
  const display = current.startsWith(home) ? "~" + current.slice(home.length) : current;
  return color.blue(display);
}

/** `⧉ fix-auth ← main`: worktree name and the branch it was created from. */
export function renderWorktree(input: StatusInput): string {
  const wt = input.worktree;
  const name = wt?.name ?? input.workspace?.git_worktree;
  if (!name) return "";
  const from = wt?.original_branch ? color.dim(` ← ${wt.original_branch}`) : "";
  return color.magenta(`⧉ ${name}`) + from;
}

/** `+2 dirs` when extra directories were added with --add-dir or /add-dir. */
export function renderAddedDirs(input: StatusInput): string {
  const n = input.workspace?.added_dirs?.length ?? 0;
  if (!n) return "";
  return color.dim(`+${n} ${n === 1 ? "dir" : "dirs"}`);
}

export function renderGit(git: GitInfo | null): string {
  if (!git) return "";
  const parts = [color.cyan((git.detached ? "➦ " : " ") + git.branch)];
  if (git.ahead) parts.push(color.green(`↑${git.ahead}`));
  if (git.behind) parts.push(color.red(`↓${git.behind}`));
  if (git.conflicted) parts.push(color.red(`!${git.conflicted}`));
  if (git.staged) parts.push(color.green(`+${git.staged}`));
  if (git.modified) parts.push(color.yellow(`~${git.modified}`));
  if (git.untracked) parts.push(color.dim(`?${git.untracked}`));
  return parts.join(" ");
}

/**
 * `Context ▌▁▁▁ 19% (196k/1M)`. `used_percentage` is null before the first response and
 * right after /compact; then derive it from current_usage the same way Claude Code does
 * (input + cache tokens, output excluded), or show a placeholder.
 */
export function renderContext(input: StatusInput): string {
  const ctx = input.context_window;
  const size = ctx?.context_window_size;
  const usage = ctx?.current_usage;
  const used = usage
    ? (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)
    : undefined;

  let pct = ctx?.used_percentage ?? undefined;
  if (pct == null && used != null && size) pct = (used / size) * 100;
  if (pct == null) return color.dim("Context ") + bar(0, palette.green) + color.dim(" —");

  const level = contextLevel(pct);
  const c = palette[level.color];
  const tokens = used != null && size ? ` (${formatTokens(used)}/${formatTokens(size)})` : "";
  let out = `${paint(c, "Context")} ${bar(pct / 100, c)} ${paint(c, `${Math.round(pct)}%${tokens}`)}`;
  if (level.breakdown && usage) {
    const b = [
      `in ${formatTokens(usage.input_tokens ?? 0)}`,
      `cache read ${formatTokens(usage.cache_read_input_tokens ?? 0)}`,
      `write ${formatTokens(usage.cache_creation_input_tokens ?? 0)}`,
      `out ${formatTokens(usage.output_tokens ?? 0)}`,
    ];
    out += color.dim(` [${b.join(" · ")}]`);
  }
  if (level.compact) out += " " + color.bold(paint(palette.red, "⚠ COMPACT"));
  return out;
}

/**
 * Context health, tuned lower than the usual 70/85/95 because quality drops well
 * before the window is full:
 *   <40 % green · 40–50 % yellow · >50 % red + token breakdown · >55 % also ⚠ COMPACT
 */
export function contextLevel(pct: number): {
  color: "green" | "yellow" | "red";
  breakdown: boolean;
  compact: boolean;
} {
  if (pct > 55) return { color: "red", breakdown: true, compact: true };
  if (pct > 50) return { color: "red", breakdown: true, compact: false };
  if (pct >= 40) return { color: "yellow", breakdown: false, compact: false };
  return { color: "green", breakdown: false, compact: false };
}

const WINDOWS = [
  { key: "five_hour", label: "5h", seconds: 5 * 3600 },
  { key: "seven_day", label: "7d", seconds: 7 * 86400 },
] as const;

/** `▌▁▁▁ 6% (6d 3h / 7d)` per subscription window: usage, then time left until reset. */
export function renderLimits(input: StatusInput, now = Date.now() / 1000): string[] {
  const out: string[] = [];
  for (const w of WINDOWS) {
    const win = input.rate_limits?.[w.key];
    if (win?.used_percentage == null) continue;
    const pct = win.used_percentage;
    const c = severity(pct / 100, palette.gray);
    const left = win.resets_at != null ? `${formatRemaining(win.resets_at - now)} / ` : "";
    out.push(`${bar(pct / 100, c)} ${color.dim(`${Math.round(pct)}% (${left}${w.label})`)}`);
  }
  return out;
}

/** `$1.23 · ⏱️ 12m34s` */
export function renderSession(input: StatusInput): string {
  const cost = input.cost;
  if (!cost) return "";
  const parts: string[] = [];
  if (cost.total_cost_usd != null) parts.push(color.yellow(formatCost(cost.total_cost_usd)));
  if (cost.total_duration_ms != null) parts.push(color.dim("⏱️ ") + formatDuration(cost.total_duration_ms));
  return parts.join(SEP);
}

/** `+156 −23` */
export function renderLines(input: StatusInput): string {
  const added = input.cost?.total_lines_added ?? 0;
  const removed = input.cost?.total_lines_removed ?? 0;
  if (!added && !removed) return "";
  return color.green(`+${added}`) + " " + color.red(`−${removed}`);
}

const PR_STATE: Record<string, (s: string) => string> = {
  approved: (s) => color.green(s + " ✓"),
  changes_requested: (s) => color.red(s + " ✗"),
  pending: (s) => color.yellow(s + " ●"),
  draft: (s) => color.dim(s + " draft"),
};

/** `PR #42 ✓`, clickable (OSC 8) in terminals that support hyperlinks. GitLab MRs show as `MR !42`. */
export function renderPr(input: StatusInput): string {
  const pr = input.pr;
  if (pr?.number == null) return "";
  const label = pr.kind === "mr" ? `MR !${pr.number}` : `PR #${pr.number}`;
  const text = (PR_STATE[pr.review_state ?? ""] ?? color.magenta)(label);
  return pr.url ? link(pr.url, text) : text;
}

/**
 * Prompt cache: `cache ● 92% (3m / 5m)` while warm — hit ratio, then time left before the
 * cache expires and the next request has to rebuild it. Cold: `cache ○ cold 92%`.
 * Misses are appended when there are any: `· 2 miss`.
 */
export function renderCache(input: StatusInput, now = Date.now() / 1000): string {
  const pc = input.prompt_cache;
  if (!pc) return "";
  const hit = pc.hit_ratio != null ? `${Math.round(pc.hit_ratio * 100)}%` : "";
  const misses = pc.misses ? color.dim(` · ${pc.misses} miss`) : "";

  if (!pc.warm) {
    return color.dim("cache ") + paint(palette.red, "○ cold") + (hit ? color.dim(` ${hit}`) : "") + misses;
  }
  const left = pc.expires_at != null ? pc.expires_at - now : undefined;
  // Under a minute left: warn that the cache is about to go cold.
  const c = left != null && left < 60 ? palette.yellow : palette.green;
  const timer = left != null ? ` (${formatRemaining(left)}${pc.ttl ? ` / ${pc.ttl}` : ""})` : "";
  return color.dim("cache ") + paint(c, "●") + color.dim(`${hit ? " " + hit : ""}${timer}`) + misses;
}

const BAR_SEP = color.dim(" │ ");

/**
 * Packs segments into rows no wider than `width` visible columns, breaking only between
 * segments so a bar or a PR link is never split. A segment wider than `width` on its own
 * gets its own row. Without a width everything stays on one row.
 */
export function wrap(segments: string[], sep: string, width?: number): string[] {
  const parts = segments.filter(Boolean);
  if (!width || width <= 0) return [parts.join(sep)];
  const sepWidth = visibleWidth(sep);
  const rows: string[] = [];
  let row = "";
  let rowWidth = 0;
  for (const part of parts) {
    const w = visibleWidth(part);
    if (row && rowWidth + sepWidth + w > width) {
      rows.push(row);
      row = "";
      rowWidth = 0;
    }
    row = row ? row + sep + part : part;
    rowWidth += (rowWidth ? sepWidth : 0) + w;
  }
  if (row) rows.push(row);
  return rows;
}

export function visibleWidth(s: string): number {
  return Bun.stringWidth(stripAnsi(s));
}

/** @param width terminal columns to wrap at; omit to keep each line whole. */
export function render(input: StatusInput, git: GitInfo | null, now?: number, width?: number): string {
  const line1 = [
    renderModel(input),
    renderDir(input),
    renderWorktree(input),
    renderAddedDirs(input),
    renderGit(git),
    renderPr(input),
    renderLines(input),
  ];
  const line2 = [renderContext(input), renderSession(input), ...renderLimits(input, now), renderCache(input, now)];
  return [...wrap(line1, SEP, width), ...wrap(line2, BAR_SEP, width)].join("\n");
}
