/**
 * The JSON Claude Code writes to the status line command's stdin.
 * Only the fields this HUD reads are typed; see
 * https://code.claude.com/docs/en/statusline for the full schema.
 * Many fields are absent or null early in a session, so everything is optional.
 */
export interface StatusInput {
  cwd?: string;
  session_id?: string;
  session_name?: string;
  version?: string;
  model?: { id?: string; display_name?: string };
  workspace?: {
    current_dir?: string;
    project_dir?: string;
    git_worktree?: string;
    added_dirs?: string[];
    /** From the `origin` remote; absent outside git or without an origin. */
    repo?: { host?: string; owner?: string; name?: string };
  };
  /** Present only inside a worktree session. */
  worktree?: {
    name?: string;
    path?: string;
    branch?: string;
    original_cwd?: string;
    original_branch?: string;
  };
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
    total_api_duration_ms?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  context_window?: {
    context_window_size?: number;
    used_percentage?: number | null;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
  };
  effort?: { level?: string };
  output_style?: { name?: string };
  thinking?: { enabled?: boolean };
  /** Present after the first main-conversation response (v2.1.251+). */
  prompt_cache?: {
    warm?: boolean;
    ttl?: string;
    /** Epoch seconds; null when unknown. */
    expires_at?: number | null;
    /** 0–1; null before enough requests. */
    hit_ratio?: number | null;
    misses?: number;
  };
  /** Open PR/MR for the current branch; absent when there is none. */
  pr?: {
    number?: number;
    url?: string;
    review_state?: "approved" | "pending" | "changes_requested" | "draft";
    /** "mr" for GitLab; absent for GitHub. */
    kind?: string;
  };
  /** claude.ai subscription limits; present only after the first response, each window optional. */
  rate_limits?: {
    five_hour?: RateWindow;
    seven_day?: RateWindow;
  };
}

export interface RateWindow {
  /** 0–100 */
  used_percentage?: number;
  /** Epoch seconds. */
  resets_at?: number;
}
