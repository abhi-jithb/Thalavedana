import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

// Helper to run git commands in a specific working directory securely without a subshell
function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
  changedFiles: Array<{ status: string; file: string }>;
  diffSummary: string;
  patch: string;
}

export interface RepoScrapeResult {
  repoPath: string;
  repoName: string;
  branchName: string;
  commits: GitCommitInfo[];
}

export async function verifyGitRepo(repoPath: string): Promise<{ ok: boolean; name: string; error?: string }> {
  try {
    const resolvedPath = path.resolve(repoPath);
    if (!fs.existsSync(resolvedPath)) {
      return { ok: false, name: '', error: 'Directory path does not exist' };
    }
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return { ok: false, name: '', error: 'Path is not a directory' };
    }

    // Verify it is a git repo safely
    await runGit(['rev-parse', '--is-inside-work-tree'], resolvedPath);
    const name = path.basename(resolvedPath);
    return { ok: true, name };
  } catch (err: any) {
    return { ok: false, name: '', error: err.message || 'Not a valid Git repository' };
  }
}

export async function scrapeRepoForDate(repoPath: string, dateStr: string): Promise<RepoScrapeResult> {
  const resolvedPath = path.resolve(repoPath);
  const repoName = path.basename(resolvedPath);

  // Check branch
  let branchName = 'unknown';
  try {
    branchName = await runGit(['branch', '--show-current'], resolvedPath);
    if (!branchName) {
      branchName = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], resolvedPath);
    }
  } catch (err) {
    // Fallback if detached head
    branchName = 'detached-head';
  }

  // Get commits for date
  const since = `${dateStr}T00:00:00`;
  const until = `${dateStr}T23:59:59`;
  
  let logOutput = '';
  try {
    logOutput = await runGit([
      'log',
      `--since=${since}`,
      `--until=${until}`,
      '--pretty=format:%H|%an|%ad|%s',
      '--date=iso'
    ], resolvedPath);
  } catch (err: any) {
    // If no commits or error, return empty list
    return { repoPath: resolvedPath, repoName, branchName, commits: [] };
  }

  if (!logOutput) {
    return { repoPath: resolvedPath, repoName, branchName, commits: [] };
  }

  const lines = logOutput.split('\n').filter(Boolean);
  const commits: GitCommitInfo[] = [];

  for (const line of lines) {
    const parts = line.split('|');
    const hash = parts[0] || '';
    if (!hash) continue;
    
    const author = parts[1] || 'Unknown';
    const date = parts[2] || '';
    const message = parts[3] || '';

    // Get changed files securely
    let changedFiles: Array<{ status: string; file: string }> = [];
    try {
      const filesOutput = await runGit([
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '-r',
        hash
      ], resolvedPath);

      changedFiles = filesOutput
        .split('\n')
        .filter(Boolean)
        .map((fLine) => {
          const partsList = fLine.split(/\s+/);
          return {
            status: partsList[0] || 'M',
            file: partsList.slice(1).join(' ') || '',
          };
        });
    } catch (err) {
      // Ignore files retrieval error
    }

    // Get diff summary securely
    let diffSummary = '';
    try {
      const summaryOutput = await runGit([
        'show',
        '--shortstat',
        hash
      ], resolvedPath);
      // Grab only the last line (the summary line)
      const summaryLines = summaryOutput.split('\n').filter(Boolean);
      diffSummary = summaryLines[summaryLines.length - 1] || '';
    } catch (err) {
      // Ignore diff summary error
    }

    // Get patch/diff securely (truncated to prevent context blowup)
    let patch = '';
    try {
      // Limit to max 150 lines of diff per commit to avoid exceeding LLM context
      const patchOutput = await runGit([
        'show',
        '--unified=3',
        hash
      ], resolvedPath);
      const patchLines = patchOutput.split('\n');
      if (patchLines.length > 150) {
        patch = patchLines.slice(0, 150).join('\n') + '\n\n[Diff truncated due to size...]';
      } else {
        patch = patchOutput;
      }
    } catch (err) {
      // Ignore patch error
    }

    commits.push({
      hash,
      author,
      date,
      message,
      changedFiles,
      diffSummary,
      patch,
    });
  }

  return {
    repoPath: resolvedPath,
    repoName,
    branchName,
    commits,
  };
}
