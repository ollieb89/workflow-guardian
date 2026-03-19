import { Finding } from '../types';
import { parseWorkflow, findLineByPattern } from '../utils';

const FLOATING_REFS = new Set(['main', 'master', 'develop', 'dev', 'HEAD', 'latest', 'trunk']);
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function checkUsesValue(uses: string, file: string, content: string): Finding[] {
  const findings: Finding[] = [];

  // Skip local and Docker actions — they have their own versioning
  if (uses.startsWith('./') || uses.startsWith('docker://')) return [];

  if (!uses.includes('@')) {
    const line = findLineByPattern(content, new RegExp(`uses:\\s*${escapeRegex(uses)}`));
    findings.push({
      rule: 'undefined-actions',
      severity: 'error',
      message: `Action '${uses}' has no version reference. Pin to a specific tag (e.g. @v4) or commit SHA.`,
      file,
      line,
    });
    return findings;
  }

  const atIndex = uses.lastIndexOf('@');
  const ref = uses.slice(atIndex + 1);
  const line = findLineByPattern(content, new RegExp(`uses:\\s*${escapeRegex(uses)}`));

  if (!ref) {
    findings.push({
      rule: 'undefined-actions',
      severity: 'error',
      message: `Action '${uses}' has an empty version reference. Pin to a specific tag or commit SHA.`,
      file,
      line,
    });
    return findings;
  }

  if (FLOATING_REFS.has(ref)) {
    findings.push({
      rule: 'undefined-actions',
      severity: 'warning',
      message: `Action '${uses}' uses floating branch ref '@${ref}'. This is not reproducible — pin to a version tag or full commit SHA.`,
      file,
      line,
    });
    return findings;
  }

  // SHA pinning is the gold standard — tag pinning is acceptable, just note it
  if (!SHA_PATTERN.test(ref)) {
    findings.push({
      rule: 'undefined-actions',
      severity: 'info',
      message: `Action '${uses}' is pinned to tag '@${ref}'. For maximum supply-chain security, pin to a full commit SHA (e.g. @abc1234...).`,
      file,
      line,
    });
  }

  return findings;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectUsesValues(obj: unknown, results: string[] = []): string[] {
  if (!obj || typeof obj !== 'object') return results;

  if (Array.isArray(obj)) {
    for (const item of obj) collectUsesValues(item, results);
    return results;
  }

  const record = obj as Record<string, unknown>;
  if (typeof record['uses'] === 'string') {
    results.push(record['uses']);
  }

  for (const val of Object.values(record)) {
    if (val && typeof val === 'object') collectUsesValues(val, results);
  }

  return results;
}

export function checkUndefinedActions(content: string, filePath: string): Finding[] {
  const workflow = parseWorkflow(content);
  if (!workflow) return [];

  const allUses = collectUsesValues(workflow);
  const findings: Finding[] = [];

  for (const uses of allUses) {
    findings.push(...checkUsesValue(uses, filePath, content));
  }

  return findings;
}
