import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';

import { Config, Finding } from './types';
import { checkUndefinedActions } from './rules/undefined-actions';
import { checkPathFilters } from './rules/path-filter-bugs';
import { checkMatrixStrategy } from './rules/matrix-strategy';
import { checkDeprecated } from './rules/deprecated-features';
import { checkSecurity } from './rules/security';
import { postOrUpdateComment } from './reporter';

function getBoolInput(name: string): boolean {
  return core.getInput(name).toLowerCase() !== 'false';
}

function findAllWorkflowFiles(): string[] {
  const workflowDir = path.join(process.cwd(), '.github', 'workflows');
  if (!fs.existsSync(workflowDir)) return [];
  return fs
    .readdirSync(workflowDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map(f => path.join('.github', 'workflows', f));
}

async function getChangedWorkflowFiles(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string[]> {
  const files: string[] = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    });

    for (const f of data) {
      if (
        f.status !== 'removed' &&
        /^\.github\/workflows\/.*\.ya?ml$/.test(f.filename)
      ) {
        files.push(f.filename);
      }
    }

    if (data.length < 100) break;
    page++;
  }

  return files;
}

function lintFile(filePath: string, config: Config): Finding[] {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    core.warning(`File not found, skipping: ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const findings: Finding[] = [];

  if (config.checkUndefinedActions) findings.push(...checkUndefinedActions(content, filePath));
  if (config.checkPathFilters) findings.push(...checkPathFilters(content, filePath));
  if (config.checkMatrixStrategy) findings.push(...checkMatrixStrategy(content, filePath));
  if (config.checkDeprecated) findings.push(...checkDeprecated(content, filePath));
  if (config.checkSecurity) findings.push(...checkSecurity(content, filePath));

  return findings;
}

async function run(): Promise<void> {
  try {
    const config: Config = {
      checkUndefinedActions: getBoolInput('check-undefined-actions'),
      checkPathFilters: getBoolInput('check-path-filters'),
      checkMatrixStrategy: getBoolInput('check-matrix-strategy'),
      checkDeprecated: getBoolInput('check-deprecated'),
      checkSecurity: getBoolInput('check-security'),
    };

    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    const ctx = github.context;
    const { owner, repo } = ctx.repo;

    const pullNumber = ctx.payload.pull_request?.number;

    // Determine which workflow files to lint
    let workflowFiles: string[];
    if (pullNumber) {
      core.info(`PR #${pullNumber} detected — scanning changed workflow files`);
      workflowFiles = await getChangedWorkflowFiles(octokit, owner, repo, pullNumber);
    } else {
      core.info('No PR context — scanning all workflow files in .github/workflows/');
      workflowFiles = findAllWorkflowFiles();
    }

    if (workflowFiles.length === 0) {
      core.info('No workflow files to scan.');
      if (pullNumber) {
        await postOrUpdateComment(octokit as any, owner, repo, pullNumber, [], []);
      }
      return;
    }

    core.info(`Scanning ${workflowFiles.length} file(s): ${workflowFiles.join(', ')}`);

    // Run all rules across all files
    const allFindings: Finding[] = [];
    for (const file of workflowFiles) {
      const findings = lintFile(file, config);
      allFindings.push(...findings);

      for (const f of findings) {
        const loc = f.line ? `:${f.line}` : '';
        const msg = `[${f.rule}] ${f.severity.toUpperCase()}: ${f.message} (${f.file}${loc})`;
        if (f.severity === 'error') core.error(msg, { file: f.file, startLine: f.line });
        else if (f.severity === 'warning') core.warning(msg, { file: f.file, startLine: f.line });
        else core.notice(msg, { file: f.file, startLine: f.line });
      }
    }

    // Post PR comment
    if (pullNumber) {
      await postOrUpdateComment(octokit as any, owner, repo, pullNumber, allFindings, workflowFiles);
    }

    // Summary
    const errors = allFindings.filter(f => f.severity === 'error');
    const warnings = allFindings.filter(f => f.severity === 'warning');
    const infos = allFindings.filter(f => f.severity === 'info');

    core.info(
      `Done — ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info(s)`,
    );

    // Only errors cause CI failure
    if (errors.length > 0) {
      core.setFailed(
        `Workflow Guardian found ${errors.length} error${errors.length === 1 ? '' : 's'} that must be fixed before merging.`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    core.setFailed(`Workflow Guardian encountered an unexpected error: ${message}`);
  }
}

run();
