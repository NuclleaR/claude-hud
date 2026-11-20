import { describe, expect, test } from "bun:test";
import { parseStatus } from "../src/git.ts";
import { formatCost, formatDuration, stripAnsi } from "../src/format.ts";
import {
  contextLevel,
  render,
  renderAddedDirs,
  renderContext,
  renderDir,
  renderGit,
  renderLimits,
  renderCache,
  renderLines,
  renderModel,
  renderWorktree,
  wrap,
  renderPr,
  renderSession,
} from "../src/render.ts";

describe("parseStatus", () => {
  test("branch, ahead/behind and file counts", () => {
    const out = [
      "# branch.oid abcdef1234567890",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -1",
      "1 M. N... 100644 100644 100644 aaa bbb staged.ts",
      "1 .M N... 100644 100644 100644 aaa bbb modified.ts",
      "1 MM N... 100644 100644 100644 aaa bbb both.ts",
      "u UU N... 100644 100644 100644 100644 a b c conflict.ts",
      "? new.ts",
    ].join("\n");
    expect(parseStatus(out)).toEqual({
      branch: "main",
      detached: false,
      ahead: 2,
      behind: 1,
      staged: 2,
      modified: 2,
      untracked: 1,
      conflicted: 1,
    });
  });

  test("detached HEAD shows short hash", () => {
    const info = parseStatus("# branch.oid abcdef1234567890\n# branch.head (detached)\n");
    expect(info?.detached).toBe(true);
    expect(info?.branch).toBe("abcdef1");
  });

  test("not a repo", () => {
    expect(parseStatus("")).toBeNull();
  });
});

describe("render", () => {
  test("dir shows subdirectory under project", () => {
    const s = renderDir({ workspace: { project_dir: "/p/app", current_dir: "/p/app/src/ui" } });
    expect(stripAnsi(s)).toBe("app/src/ui");
  });

  test("dir outside project uses ~", () => {
    const s = renderDir({ workspace: { project_dir: "/p/app", current_dir: "/home/u/x" } }, "/home/u");
    expect(stripAnsi(s)).toBe("~/x");
  });

  test("context falls back to current_usage when used_percentage is null", () => {
    const s = renderContext({
      context_window: {
        context_window_size: 200000,
        used_percentage: null,
        current_usage: { input_tokens: 50000, cache_read_input_tokens: 50000, output_tokens: 9999 },
      },
    });
    expect(stripAnsi(s)).toBe("Context ●●●●●○○○○○ 50% (100k/200k)");
  });

  test("context with 1M window", () => {
    const s = renderContext({
      context_window: {
        context_window_size: 1_000_000,
        used_percentage: 19,
        current_usage: { input_tokens: 190_000 },
      },
    });
    expect(stripAnsi(s)).toBe("Context ●●○○○○○○○○ 19% (190k/1M)");
  });

  test("context thresholds: 40 / 50 / 55", () => {
    expect(contextLevel(39.9).color).toBe("green");
    expect(contextLevel(40).color).toBe("yellow");
    expect(contextLevel(50)).toEqual({ color: "yellow", breakdown: false, compact: false });
    expect(contextLevel(50.1)).toEqual({ color: "red", breakdown: true, compact: false });
    expect(contextLevel(55)).toEqual({ color: "red", breakdown: true, compact: false });
    expect(contextLevel(55.1)).toEqual({ color: "red", breakdown: true, compact: true });
  });

  test("context above 55 % shows breakdown and COMPACT", () => {
    const s = renderContext({
      context_window: {
        context_window_size: 200_000,
        used_percentage: 60,
        current_usage: {
          input_tokens: 2000,
          cache_read_input_tokens: 110_000,
          cache_creation_input_tokens: 8000,
          output_tokens: 1500,
        },
      },
    });
    expect(stripAnsi(s)).toBe(
      "Context ●●●●●●○○○○ 60% (120k/200k) [in 2k · cache read 110k · write 8k · out 2k] ⚠ COMPACT",
    );
  });

  test("context placeholder before first response", () => {
    expect(stripAnsi(renderContext({ context_window: { current_usage: null } }))).toBe("Context ○○○○○○○○○○ —");
  });

  test("rate limits show time left until reset", () => {
    const now = 1_000_000;
    const lines = renderLimits(
      {
        rate_limits: {
          five_hour: { used_percentage: 50, resets_at: now + 2 * 3600 + 15 * 60 },
          seven_day: { used_percentage: 6, resets_at: now + 6 * 86400 + 3 * 3600 },
        },
      },
      now,
    ).map(stripAnsi);
    expect(lines).toEqual([
      "●●●●●○○○○○ 50% (2h 15m / 5h)",
      "●○○○○○○○○○ 6% (6d 3h / 7d)",
    ]);
  });

  test("no rate limits outside a subscription", () => {
    expect(renderLimits({})).toEqual([]);
  });

  test("session line", () => {
    const s = renderSession({
      cost: { total_cost_usd: 1.5, total_duration_ms: 65000, total_lines_added: 10, total_lines_removed: 3 },
    });
    expect(stripAnsi(s)).toBe("$1.50 · ⏱️ 1m05s");
    expect(stripAnsi(renderLines({ cost: { total_lines_added: 10, total_lines_removed: 3 } }))).toBe("+10 −3");
  });

  test("output style after effort, hidden when default", () => {
    const m = { display_name: "Opus 5.5" };
    expect(stripAnsi(renderModel({ model: m, effort: { level: "high" }, output_style: { name: "Explanatory" } }))).toBe(
      "Opus 5.5 high ✎ Explanatory",
    );
    expect(stripAnsi(renderModel({ model: m, effort: { level: "high" }, output_style: { name: "default" } }))).toBe(
      "Opus 5.5 high",
    );
  });

  test("thinking goes right after the model, only when enabled", () => {
    const m = { display_name: "Opus 5.5" };
    expect(stripAnsi(renderModel({ model: m, thinking: { enabled: true }, effort: { level: "high" } }))).toBe(
      "Opus 5.5 ✻ think high",
    );
    expect(stripAnsi(renderModel({ model: m, thinking: { enabled: false }, effort: { level: "high" } }))).toBe(
      "Opus 5.5 high",
    );
  });

  test("prompt cache: warm with countdown, warning under a minute, cold", () => {
    const now = 1_000_000;
    const warm = (left: number) =>
      stripAnsi(renderCache({ prompt_cache: { warm: true, ttl: "5m", expires_at: now + left, hit_ratio: 0.92 } }, now));
    expect(warm(185)).toBe("cache ● 92% (3m / 5m)");
    expect(warm(30)).toBe("cache ● 92% (30s / 5m)");
    expect(stripAnsi(renderCache({ prompt_cache: { warm: false, hit_ratio: 0.5, misses: 2 } }, now))).toBe(
      "cache ○ cold 50% · 2 miss",
    );
    expect(renderCache({})).toBe("");
  });

  test("repo replaces folder name, non-GitHub hosts keep the host", () => {
    const ws = { project_dir: "/p/app", current_dir: "/p/app/src" };
    expect(stripAnsi(renderDir({ workspace: { ...ws, repo: { host: "github.com", owner: "me", name: "app" } } }))).toBe(
      "me/app/src",
    );
    expect(stripAnsi(renderDir({ workspace: { ...ws, repo: { host: "gitlab.com", owner: "g", name: "app" } } }))).toBe(
      "gitlab.com/g/app/src",
    );
  });

  test("worktree and added dirs", () => {
    expect(stripAnsi(renderWorktree({ worktree: { name: "fix-auth", original_branch: "main" } }))).toBe(
      "⧉ fix-auth ← main",
    );
    expect(stripAnsi(renderWorktree({ workspace: { git_worktree: "wt" } }))).toBe("⧉ wt");
    expect(renderWorktree({})).toBe("");
    expect(stripAnsi(renderAddedDirs({ workspace: { added_dirs: ["/a", "/b"] } }))).toBe("+2 dirs");
    expect(stripAnsi(renderAddedDirs({ workspace: { added_dirs: ["/a"] } }))).toBe("+1 dir");
    expect(renderAddedDirs({ workspace: { added_dirs: [] } })).toBe("");
  });

  test("PR with review state is a hyperlink", () => {
    const s = renderPr({ pr: { number: 42, url: "https://github.com/o/r/pull/42", review_state: "approved" } });
    expect(s).toContain("\x1b]8;;https://github.com/o/r/pull/42\x1b\\");
    expect(stripAnsi(s)).toBe("PR #42 ✓");
  });

  test("GitLab MR and no PR", () => {
    expect(stripAnsi(renderPr({ pr: { number: 7, kind: "mr", review_state: "draft" } }))).toBe("MR !7 draft");
    expect(renderPr({})).toBe("");
  });

  test("full layout: cost and time follow context on line 2", () => {
    const out = stripAnsi(
      render(
        {
          model: { display_name: "Opus" },
          workspace: { project_dir: "/p/app", current_dir: "/p/app" },
          pr: { number: 1 },
          cost: { total_cost_usd: 2, total_duration_ms: 1000, total_lines_added: 1, total_lines_removed: 0 },
          context_window: { context_window_size: 200000, used_percentage: 0, current_usage: { input_tokens: 0 } },
          rate_limits: { seven_day: { used_percentage: 0 } },
        },
        null,
      ),
    );
    expect(out.split("\n")).toEqual([
      "Opus · app · PR #1 · +1 −0",
      "Context ○○○○○○○○○○ 0% (0/200k) │ $2.00 · ⏱️ 1s │ ○○○○○○○○○○ 0% (7d)",
    ]);
  });

  test("clean git shows only branch", () => {
    const s = renderGit({ branch: "main", detached: false, ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0, conflicted: 0 });
    expect(stripAnsi(s)).toBe(" main");
  });
});

describe("format", () => {
  test("duration", () => {
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(3_725_000)).toBe("1h02m");
  });
  test("cost", () => {
    expect(formatCost(0.001)).toBe("$0.00");
    expect(formatCost(12.34)).toBe("$12.3");
  });
});

describe("wrap", () => {
  test("breaks between segments, never inside one", () => {
    expect(wrap(["aaaa", "bbbb", "cccc"], " · ", 11)).toEqual(["aaaa · bbbb", "cccc"]);
  });
  test("drops empty segments and keeps one row without a width", () => {
    expect(wrap(["a", "", "b"], " · ")).toEqual(["a · b"]);
  });
  test("ignores ANSI codes when measuring", () => {
    expect(wrap(["\x1b[31maaaa\x1b[39m", "bbbb"], " · ", 11)).toHaveLength(1);
  });
  test("an oversized segment gets its own row", () => {
    expect(wrap(["a", "xxxxxxxxxxxx", "b"], " · ", 5)).toEqual(["a", "xxxxxxxxxxxx", "b"]);
  });
});
