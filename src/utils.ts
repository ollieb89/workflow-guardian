import * as yaml from 'js-yaml';

export function parseWorkflow(content: string): Record<string, unknown> | null {
  try {
    const parsed = yaml.load(content);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function findLineNumber(content: string, searchStr: string): number | undefined {
  if (!searchStr) return undefined;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchStr)) {
      return i + 1;
    }
  }
  return undefined;
}

export function findLineByPattern(content: string, pattern: RegExp): number | undefined {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      return i + 1;
    }
  }
  return undefined;
}
