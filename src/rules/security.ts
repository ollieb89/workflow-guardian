import { Finding } from '../types';
import { parseWorkflow, findLineNumber, findLineByPattern } from '../utils';

// Inputs that are fully attacker-controlled and must not appear
// directly inside a `run:` shell script via ${{ ... }} interpolation.
const UNTRUSTED_INPUTS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\$\{\{\s*github\.event\.issue\.title\s*\}\}/g, name: 'github.event.issue.title' },
  { pattern: /\$\{\{\s*github\.event\.issue\.body\s*\}\}/g, name: 'github.event.issue.body' },
  {
    pattern: /\$\{\{\s*github\.event\.pull_request\.title\s*\}\}/g,
    name: 'github.event.pull_request.title',
  },
  {
    pattern: /\$\{\{\s*github\.event\.pull_request\.body\s*\}\}/g,
    name: 'github.event.pull_request.body',
  },
  {
    pattern: /\$\{\{\s*github\.event\.pull_request\.head\.ref\s*\}\}/g,
    name: 'github.event.pull_request.head.ref',
  },
  {
    pattern: /\$\{\{\s*github\.event\.pull_request\.head\.label\s*\}\}/g,
    name: 'github.event.pull_request.head.label',
  },
  { pattern: /\$\{\{\s*github\.head_ref\s*\}\}/g, name: 'github.head_ref' },
  { pattern: /\$\{\{\s*github\.event\.review\.body\s*\}\}/g, name: 'github.event.review.body' },
  { pattern: /\$\{\{\s*github\.event\.comment\.body\s*\}\}/g, name: 'github.event.comment.body' },
  {
    pattern: /\$\{\{\s*github\.event\.head_commit\.message\s*\}\}/g,
    name: 'github.event.head_commit.message',
  },
  {
    pattern: /\$\{\{\s*github\.event\.head_commit\.author\.email\s*\}\}/g,
    name: 'github.event.head_commit.author.email',
  },
  {
    pattern: /\$\{\{\s*github\.event\.head_commit\.author\.name\s*\}\}/g,
    name: 'github.event.head_commit.author.name',
  },
  { pattern: /\$\{\{\s*github\.event\.pusher\.name\s*\}\}/g, name: 'github.event.pusher.name' },
  {
    pattern: /\$\{\{\s*github\.event\.pusher\.email\s*\}\}/g,
    name: 'github.event.pusher.email',
  },
  {
    pattern: /\$\{\{\s*github\.event\.commits\[.*?\]\.message\s*\}\}/g,
    name: 'github.event.commits[*].message',
  },
];

function hasTrigger(workflow: Record<string, unknown>, trigger: string): boolean {
  const on = workflow['on'];
  if (typeof on === 'string') return on === trigger;
  if (Array.isArray(on)) return on.includes(trigger);
  if (on && typeof on === 'object') return trigger in (on as object);
  return false;
}

function checkScriptInjection(
  runScript: string,
  jobName: string,
  stepName: string | undefined,
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];
  const stepLabel = stepName ? `'${stepName}'` : 'unnamed step';

  for (const input of UNTRUSTED_INPUTS) {
    // Reset lastIndex for global regexes
    input.pattern.lastIndex = 0;
    if (input.pattern.test(runScript)) {
      const line = findLineByPattern(content, new RegExp(input.pattern.source));
      findings.push({
        rule: 'security',
        severity: 'error',
        message:
          `Script injection risk in job '${jobName}', step ${stepLabel}: ` +
          `'${input.name}' is interpolated directly into a shell script. ` +
          `An attacker can inject arbitrary shell commands. ` +
          `Fix: assign to an env var first — \`env: SAFE_VAR: \${{ ${input.name} }}\` — then use \`$SAFE_VAR\` in the script.`,
        file: filePath,
        line,
      });
    }
  }

  return findings;
}

function checkPullRequestTarget(
  workflow: Record<string, unknown>,
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];

  if (!hasTrigger(workflow, 'pull_request_target')) return [];

  const jobs = (workflow['jobs'] as Record<string, unknown>) ?? {};

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object' || Array.isArray(job)) continue;
    const steps = ((job as Record<string, unknown>)['steps'] as unknown[]) ?? [];

    for (const step of steps) {
      if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
      const s = step as Record<string, unknown>;

      // Dangerous pattern: checkout action with ref pointing to PR head
      if (typeof s['uses'] === 'string' && s['uses'].includes('actions/checkout')) {
        const withBlock = s['with'] as Record<string, unknown> | undefined;
        if (withBlock && typeof withBlock['ref'] === 'string') {
          const ref = withBlock['ref'];
          if (
            ref.includes('github.event.pull_request.head') ||
            ref.includes('github.head_ref') ||
            ref.includes('github.event.pull_request.merge_commit_sha')
          ) {
            const line = findLineNumber(content, ref);
            findings.push({
              rule: 'security',
              severity: 'error',
              message:
                `Job '${jobName}' uses the 'pull_request_target' trigger and checks out the PR head ref '${ref}'. ` +
                `This is a critical "pwn request" vulnerability — untrusted code runs with write permissions and access to secrets. ` +
                `Either remove the custom ref (to check out the base branch) or move sensitive steps to a separate, isolated job.`,
              file: filePath,
              line,
            });
          }
        }
      }
    }
  }

  return findings;
}

function checkSecretsInEnv(content: string, filePath: string): Finding[] {
  const findings: Finding[] = [];

  // Warn if a secret is used in a context that could expose it (e.g., echoed to logs)
  // Pattern: echo "${{ secrets.* }}" or run: curl ... ${{ secrets.* }}
  const secretInRunPattern = /\$\{\{\s*secrets\.\w+\s*\}\}/g;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only flag if in a run: block value (crude but effective heuristic)
    if (/^\s+run:/.test(line) && secretInRunPattern.test(line)) {
      findings.push({
        rule: 'security',
        severity: 'warning',
        message:
          `Secret interpolated directly in 'run:' inline command on line ${i + 1}. ` +
          `Use an env var (\`env: MY_SECRET: \${{ secrets.X }}\`) and reference \`$MY_SECRET\` in the script to avoid accidental log exposure.`,
        file: filePath,
        line: i + 1,
      });
    }
    secretInRunPattern.lastIndex = 0;
  }

  return findings;
}

export function checkSecurity(content: string, filePath: string): Finding[] {
  const findings: Finding[] = [];

  const workflow = parseWorkflow(content);
  if (!workflow) return [];

  // Check pull_request_target + checkout pattern
  findings.push(...checkPullRequestTarget(workflow, content, filePath));

  // Check secrets inline in run:
  findings.push(...checkSecretsInEnv(content, filePath));

  // Walk steps and check for script injection via untrusted inputs
  const jobs = (workflow['jobs'] as Record<string, unknown>) ?? {};
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object' || Array.isArray(job)) continue;
    const steps = ((job as Record<string, unknown>)['steps'] as unknown[]) ?? [];

    for (const step of steps) {
      if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
      const s = step as Record<string, unknown>;
      if (typeof s['run'] !== 'string') continue;

      findings.push(
        ...checkScriptInjection(
          s['run'],
          jobName,
          s['name'] as string | undefined,
          content,
          filePath,
        ),
      );
    }
  }

  return findings;
}
