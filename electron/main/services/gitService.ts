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
  authorEmail: string;
  parents: string[];
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

export interface FilterStats {
  repoName: string;
  totalScanned: number;
  byCurrentUser: number;
  mergeCommitsIgnored: number;
  remoteCommitsIgnored: number;
  syncCommitsIgnored: number;
  finalSent: number;
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

export async function getRepoStatusDetail(repoPath: string): Promise<{
  activeBranch: string;
  lastCommitTime: string;
  status: 'active' | 'missing' | 'error';
  error?: string;
}> {
  const resolvedPath = path.resolve(repoPath);
  if (!fs.existsSync(resolvedPath)) {
    return { activeBranch: 'N/A', lastCommitTime: 'N/A', status: 'missing', error: 'Directory does not exist' };
  }
  try {
    // Current Active Branch
    let activeBranch = 'unknown';
    try {
      activeBranch = await runGit(['branch', '--show-current'], resolvedPath);
      if (!activeBranch) {
        activeBranch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], resolvedPath);
      }
    } catch (e) {
      activeBranch = 'detached-head';
    }

    // Last commit time
    let lastCommitTime = 'N/A';
    try {
      lastCommitTime = await runGit(['log', '-1', '--format=%cd', '--date=format:%Y-%m-%d %H:%M:%S'], resolvedPath);
    } catch (e) {
      lastCommitTime = 'No commits';
    }

    return {
      activeBranch: activeBranch.trim(),
      lastCommitTime: lastCommitTime.trim(),
      status: 'active'
    };
  } catch (err: any) {
    return { activeBranch: 'N/A', lastCommitTime: 'N/A', status: 'error', error: err.message };
  }
}

export async function getGitGlobalConfig(repoPath: string): Promise<{ name: string; email: string }> {
  try {
    const name = await runGit(['config', 'user.name'], repoPath);
    const email = await runGit(['config', 'user.email'], repoPath);
    return { name: name.trim(), email: email.trim() };
  } catch (e) {
    return { name: '', email: '' };
  }
}

export function filterCommitsForUser(
  commits: GitCommitInfo[],
  developerName: string,
  developerEmail: string
): { filtered: GitCommitInfo[]; stats: Omit<FilterStats, 'repoName'> } {
  let byCurrentUser = 0;
  let mergeCommitsIgnored = 0;
  let remoteCommitsIgnored = 0;
  let syncCommitsIgnored = 0;

  const filtered: GitCommitInfo[] = [];
  const devNameLower = developerName.trim().toLowerCase();
  const devEmailLower = developerEmail.trim().toLowerCase();

  const syncPatterns = [
    /merge branch/i,
    /merge remote-tracking branch/i,
    /merge pull request/i,
    /merge origin/i,
    /merge upstream/i,
    /update submodule/i,
    /fast-forward/i,
    /resolved merge conflicts/i,
    /^merge$/i
  ];

  for (const commit of commits) {
    const authorName = commit.author.trim().toLowerCase();
    const authorEmail = commit.authorEmail.trim().toLowerCase();
    const msg = commit.message.trim();

    // 1. Check Merge Status (multi-parent or merge pattern subject)
    const isMergeCommit = 
      commit.parents.length > 1 || 
      msg.toLowerCase().startsWith('merge ') || 
      msg.toLowerCase().includes('merge pull request');

    // 2. Check Sync Commit Message Patterns
    const isSyncCommit = syncPatterns.some(pattern => pattern.test(msg));

    // 3. Check Author Match
    const isAuthorMatch = 
      (devNameLower && authorName === devNameLower) || 
      (devEmailLower && authorEmail === devEmailLower);

    if (isMergeCommit) {
      mergeCommitsIgnored++;
    } else if (isSyncCommit) {
      syncCommitsIgnored++;
    } else if (!isAuthorMatch) {
      remoteCommitsIgnored++;
    } else {
      byCurrentUser++;
      filtered.push(commit);
    }
  }

  return {
    filtered,
    stats: {
      totalScanned: commits.length,
      byCurrentUser,
      mergeCommitsIgnored,
      remoteCommitsIgnored,
      syncCommitsIgnored,
      finalSent: filtered.length
    }
  };
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
    branchName = 'detached-head';
  }

  // Get commits for date with parents information (%P) and author email (%ae)
  const since = `${dateStr}T00:00:00`;
  const until = `${dateStr}T23:59:59`;
  
  let logOutput = '';
  try {
    logOutput = await runGit([
      'log',
      '--all',
      `--since=${since}`,
      `--until=${until}`,
      '--pretty=format:%H|%an|%ae|%ad|%P|%s',
      '--date=iso'
    ], resolvedPath);
  } catch (err: any) {
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
    const authorEmail = parts[2] || '';
    const date = parts[3] || '';
    const parentsStr = parts[4] || '';
    const parents = parentsStr.trim().split(/\s+/).filter(Boolean);
    const message = parts.slice(5).join('|') || '';

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
      const summaryLines = summaryOutput.split('\n').filter(Boolean);
      diffSummary = summaryLines[summaryLines.length - 1] || '';
    } catch (err) {
      // Ignore diff summary error
    }

    // Get patch/diff securely
    let patch = '';
    try {
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
      authorEmail,
      parents,
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
