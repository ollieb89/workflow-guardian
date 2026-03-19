import { Finding } from '../types';
import { parseWorkflow, findLineNumber, findLineByPattern } from '../utils';

// Events that support path filters
const PATH_FILTER_EVENTS = new Set(['push', 'pull_request', 'pull_request_target', 'workflow_dispatch']);

type EventConfig = Record<string, unknown>;

function checkEventConfig(
  eventName: string,
  config: EventConfig,
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];

  // Mutually exclusive pairs
  const exclusivePairs: [string, string][] = [
    ['paths', 'paths-ignore'],
    ['branches', 'branches-ignore'],
    ['tags', 'tags-ignore'],
  ];

  for (const [a, b] of exclusivePairs) {
    if (a in config && b in config) {
      const line = findLineNumber(content, b);
      findings.push({
        rule: 'path-filter-bugs',
        severity: 'error',
        message: `Event '${eventName}': '${a}' and '${b}' are mutually exclusive. Only one can be specified.`,
        file: filePath,
        line,
      });
    }
  }

  // Check for empty filter arrays
  for (const key of ['paths', 'paths-ignore', 'branches', 'branches-ignore', 'tags', 'tags-ignore']) {
    const val = config[key];
    if (Array.isArray(val) && val.length === 0) {
      const line = findLineByPattern(content, new RegExp(`^\\s+${key}:\\s*\\[\\]`));
      findings.push({
        rule: 'path-filter-bugs',
        severity: 'warning',
        message: `Event '${eventName}': '${key}' is an empty list. No jobs will trigger. Remove it or add at least one pattern.`,
        file: filePath,
        line,
      });
    }
  }

  // Check path patterns for common mistakes
  const allPaths = [
    ...((config['paths'] as string[] | undefined) ?? []),
    ...((config['paths-ignore'] as string[] | undefined) ?? []),
  ];

  for (const p of allPaths) {
    if (typeof p !== 'string') continue;

    if (p.startsWith('/')) {
      const line = findLineNumber(content, p);
      findings.push({
        rule: 'path-filter-bugs',
        severity: 'warning',
        message: `Path pattern '${p}' starts with '/'. GitHub Actions globs are relative to the repo root — remove the leading slash.`,
        file: filePath,
        line,
      });
    }

    // Lone ** is valid but almost always a mistake (matches everything = no filter)
    if (p === '**') {
      const line = findLineNumber(content, '**');
      findings.push({
        rule: 'path-filter-bugs',
        severity: 'info',
        message: `Path pattern '**' matches all files, making the filter redundant. Did you mean a more specific pattern?`,
        file: filePath,
        line,
      });
    }
  }

  // paths filter on events that don't support it
  if (!PATH_FILTER_EVENTS.has(eventName) && 'paths' in config) {
    const line = findLineByPattern(content, /^\s+paths:/);
    findings.push({
      rule: 'path-filter-bugs',
      severity: 'warning',
      message: `Event '${eventName}' does not support 'paths' filters. The filter will be ignored.`,
      file: filePath,
      line,
    });
  }

  return findings;
}

export function checkPathFilters(content: string, filePath: string): Finding[] {
  const workflow = parseWorkflow(content);
  if (!workflow || !workflow['on']) return [];

  const on = workflow['on'];
  const findings: Finding[] = [];

  // 'on' can be a string, array, or object
  if (typeof on === 'string' || Array.isArray(on)) {
    // No per-event config, nothing to check
    return [];
  }

  const onConfig = on as Record<string, unknown>;
  for (const [eventName, eventConfig] of Object.entries(onConfig)) {
    if (!eventConfig || typeof eventConfig !== 'object' || Array.isArray(eventConfig)) continue;
    findings.push(
      ...checkEventConfig(eventName, eventConfig as EventConfig, content, filePath),
    );
  }

  return findings;
}
