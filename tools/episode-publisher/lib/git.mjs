import { spawn } from 'node:child_process';

/**
 * @param {string} repoRoot
 * @param {string[]} args
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export function runGit(repoRoot, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoRoot, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`git ${args.join(' ')} failed (${code}): ${stderr || stdout}`));
    });
  });
}

/**
 * @param {{
 *   repoRoot: string,
 *   paths: string[],
 *   message: string,
 *   dryRun?: boolean,
 *   remote?: string,
 *   branch?: string,
 * }} options
 */
export async function gitPublish(options) {
  const {
    repoRoot,
    paths,
    message,
    dryRun = false,
    remote = 'origin',
    branch = 'main',
  } = options;

  if (!paths.length) throw new Error('no paths to commit');

  if (dryRun) {
    return { committed: false, pushed: false, dryRun: true, stagedPaths: paths };
  }

  await runGit(repoRoot, ['add', '--', ...paths]);
  await runGit(repoRoot, ['commit', '-m', message]);
  await runGit(repoRoot, ['push', remote, branch]);
  return { committed: true, pushed: true, dryRun: false };
}
