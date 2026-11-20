export interface GitInfo {
  branch: string;
  /** Detached HEAD: `branch` holds the short commit hash. */
  detached: boolean;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  conflicted: number;
}

/**
 * Parses `git status --porcelain=v2 --branch` output.
 * Exported separately so it can be tested without a repository.
 */
export function parseStatus(output: string): GitInfo | null {
  const info: GitInfo = {
    branch: "",
    detached: false,
    ahead: 0,
    behind: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
  };
  let oid = "";

  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.oid ")) {
      oid = line.slice("# branch.oid ".length);
    } else if (line.startsWith("# branch.head ")) {
      info.branch = line.slice("# branch.head ".length);
    } else if (line.startsWith("# branch.ab ")) {
      const m = /\+(\d+) -(\d+)/.exec(line);
      if (m) {
        info.ahead = Number(m[1]);
        info.behind = Number(m[2]);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const xy = line.slice(2, 4);
      if (xy[0] !== ".") info.staged++;
      if (xy[1] !== ".") info.modified++;
    } else if (line.startsWith("u ")) {
      info.conflicted++;
    } else if (line.startsWith("? ")) {
      info.untracked++;
    }
  }

  if (!info.branch) return null;
  if (info.branch === "(detached)") {
    info.detached = true;
    info.branch = oid === "(initial)" ? "(initial)" : oid.slice(0, 7);
  }
  return info;
}

export function readGit(cwd: string): GitInfo | null {
  try {
    const proc = Bun.spawnSync(
      ["git", "--no-optional-locks", "status", "--porcelain=v2", "--branch"],
      { cwd, stdout: "pipe", stderr: "ignore", timeout: 1000 },
    );
    if (proc.exitCode !== 0) return null;
    return parseStatus(proc.stdout.toString());
  } catch {
    return null;
  }
}
