import { Finding } from '../types';
import { parseWorkflow, findLineNumber, findLineByPattern } from '../utils';

type JobDef = Record<string, unknown>;

function checkJobMatrix(jobName: string, job: JobDef, content: string, filePath: string): Finding[] {
  const findings: Finding[] = [];
  const strategy = job['strategy'] as Record<string, unknown> | undefined;

  if (!strategy || typeof strategy !== 'object') return [];

  // fail-fast must be boolean
  if ('fail-fast' in strategy && typeof strategy['fail-fast'] !== 'boolean') {
    const line = findLineByPattern(content, /^\s+fail-fast:/);
    findings.push({
      rule: 'matrix-strategy',
      severity: 'error',
      message: `Job '${jobName}': 'strategy.fail-fast' must be a boolean (true/false), got ${JSON.stringify(strategy['fail-fast'])}.`,
      file: filePath,
      line,
    });
  }

  // max-parallel must be a positive integer
  if ('max-parallel' in strategy) {
    const mp = strategy['max-parallel'];
    if (typeof mp !== 'number' || !Number.isInteger(mp) || mp < 1) {
      const line = findLineByPattern(content, /^\s+max-parallel:/);
      findings.push({
        rule: 'matrix-strategy',
        severity: 'error',
        message: `Job '${jobName}': 'strategy.max-parallel' must be a positive integer, got ${JSON.stringify(mp)}.`,
        file: filePath,
        line,
      });
    }
  }

  const matrix = strategy['matrix'] as Record<string, unknown> | undefined;
  if (!matrix || typeof matrix !== 'object') return findings;

  const baseKeys = Object.keys(matrix).filter(k => k !== 'include' && k !== 'exclude');

  // Empty base dimension arrays → no jobs will run
  for (const key of baseKeys) {
    const val = matrix[key];
    if (Array.isArray(val) && val.length === 0) {
      const line = findLineByPattern(content, new RegExp(`^\\s+${key}:\\s*\\[\\]`));
      findings.push({
        rule: 'matrix-strategy',
        severity: 'error',
        message: `Job '${jobName}': Matrix dimension '${key}' is an empty list. No jobs will be generated.`,
        file: filePath,
        line,
      });
    }
  }

  // 'exclude' without base dimensions has no effect
  if (matrix['exclude'] && baseKeys.length === 0) {
    const line = findLineByPattern(content, /^\s+exclude:/);
    findings.push({
      rule: 'matrix-strategy',
      severity: 'warning',
      message: `Job '${jobName}': Matrix has 'exclude' but no base dimensions to exclude from. The 'exclude' list has no effect.`,
      file: filePath,
      line,
    });
  }

  // 'include' as the only key is valid but worth an info note
  if (matrix['include'] && baseKeys.length === 0 && !matrix['exclude']) {
    const include = matrix['include'];
    if (!Array.isArray(include) || include.length === 0) {
      const line = findLineByPattern(content, /^\s+include:/);
      findings.push({
        rule: 'matrix-strategy',
        severity: 'warning',
        message: `Job '${jobName}': Matrix 'include' is empty. No additional combinations will be added.`,
        file: filePath,
        line,
      });
    }
  }

  // Check that include/exclude entries are objects
  for (const listKey of ['include', 'exclude'] as const) {
    const list = matrix[listKey];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      if (!list[i] || typeof list[i] !== 'object' || Array.isArray(list[i])) {
        const line = findLineNumber(content, listKey);
        findings.push({
          rule: 'matrix-strategy',
          severity: 'error',
          message: `Job '${jobName}': matrix.${listKey}[${i}] must be an object (key-value pairs), got ${JSON.stringify(list[i])}.`,
          file: filePath,
          line,
        });
      }
    }
  }

  return findings;
}

export function checkMatrixStrategy(content: string, filePath: string): Finding[] {
  const workflow = parseWorkflow(content);
  if (!workflow || !workflow['jobs']) return [];

  const jobs = workflow['jobs'] as Record<string, unknown>;
  const findings: Finding[] = [];

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object' || Array.isArray(job)) continue;
    findings.push(...checkJobMatrix(jobName, job as JobDef, content, filePath));
  }

  return findings;
}
