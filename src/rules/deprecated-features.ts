import { Finding, Severity } from '../types';
import { parseWorkflow, findLineByPattern } from '../utils';

interface CommandCheck {
  pattern: RegExp;
  message: string;
  severity: Severity;
}

// Deprecated workflow commands used inside run: scripts
const DEPRECATED_COMMANDS: CommandCheck[] = [
  {
    pattern: /::set-env\s+name=/,
    message:
      '`::set-env::` is deprecated and a known security vulnerability (CVE-2020-15228). Use `echo "KEY=VALUE" >> $GITHUB_ENV` instead.',
    severity: 'error',
  },
  {
    pattern: /::add-path::/,
    message:
      '`::add-path::` is deprecated and a known security vulnerability. Use `echo "/path" >> $GITHUB_PATH` instead.',
    severity: 'error',
  },
  {
    pattern: /::set-output\s+name=/,
    message:
      '`::set-output::` is deprecated and will stop working. Use `echo "key=value" >> $GITHUB_OUTPUT` instead.',
    severity: 'warning',
  },
  {
    pattern: /::save-state\s+name=/,
    message:
      '`::save-state::` is deprecated. Use `echo "key=value" >> $GITHUB_STATE` instead.',
    severity: 'warning',
  },
  {
    pattern: /::get-state\s+name=/,
    message:
      '`::get-state::` is deprecated. Use `$STATE_<KEY>` environment variable instead.',
    severity: 'warning',
  },
];

interface ActionCheck {
  pattern: RegExp;
  actionRef: string;
  recommended: string;
  severity: Severity;
}

// Known outdated action versions
const DEPRECATED_ACTIONS: ActionCheck[] = [
  {
    pattern: /actions\/checkout@v1\b/,
    actionRef: 'actions/checkout@v1',
    recommended: '@v4',
    severity: 'warning',
  },
  {
    pattern: /actions\/checkout@v2\b/,
    actionRef: 'actions/checkout@v2',
    recommended: '@v4',
    severity: 'info',
  },
  {
    pattern: /actions\/setup-node@v1\b/,
    actionRef: 'actions/setup-node@v1',
    recommended: '@v4',
    severity: 'warning',
  },
  {
    pattern: /actions\/setup-node@v2\b/,
    actionRef: 'actions/setup-node@v2',
    recommended: '@v4',
    severity: 'info',
  },
  {
    pattern: /actions\/setup-python@v1\b/,
    actionRef: 'actions/setup-python@v1',
    recommended: '@v5',
    severity: 'warning',
  },
  {
    pattern: /actions\/setup-python@v2\b/,
    actionRef: 'actions/setup-python@v2',
    recommended: '@v5',
    severity: 'info',
  },
  {
    pattern: /actions\/cache@v1\b/,
    actionRef: 'actions/cache@v1',
    recommended: '@v4',
    severity: 'warning',
  },
  {
    pattern: /actions\/cache@v2\b/,
    actionRef: 'actions/cache@v2',
    recommended: '@v4',
    severity: 'info',
  },
  {
    pattern: /actions\/upload-artifact@v[123]\b/,
    actionRef: 'actions/upload-artifact@v1/v2/v3',
    recommended: '@v4',
    severity: 'warning',
  },
  {
    pattern: /actions\/download-artifact@v[123]\b/,
    actionRef: 'actions/download-artifact@v1/v2/v3',
    recommended: '@v4',
    severity: 'warning',
  },
  {
    pattern: /actions\/create-release@v1\b/,
    actionRef: 'actions/create-release@v1',
    recommended: 'gh release create (GitHub CLI) or actions/github-script',
    severity: 'warning',
  },
];

function checkRunScript(
  script: string,
  jobName: string,
  stepName: string | undefined,
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];
  const stepLabel = stepName ? `'${stepName}'` : 'unnamed step';

  for (const check of DEPRECATED_COMMANDS) {
    if (check.pattern.test(script)) {
      // Find approximate line in the raw YAML
      const line = findLineByPattern(content, check.pattern);
      findings.push({
        rule: 'deprecated-features',
        severity: check.severity,
        message: `Job '${jobName}', step ${stepLabel}: ${check.message}`,
        file: filePath,
        line,
      });
    }
  }

  return findings;
}

function checkRunnerDeprecation(content: string, filePath: string): Finding[] {
  const findings: Finding[] = [];

  // Node 12 runner is deprecated / end-of-life
  const node12 = findLineByPattern(content, /using:\s*['"]?node12['"]?/);
  if (node12 !== undefined) {
    findings.push({
      rule: 'deprecated-features',
      severity: 'error',
      message: `Action uses 'node12' runner which is end-of-life. Update to 'node20'.`,
      file: filePath,
      line: node12,
    });
  }

  // Node 16 is deprecated
  const node16 = findLineByPattern(content, /using:\s*['"]?node16['"]?/);
  if (node16 !== undefined) {
    findings.push({
      rule: 'deprecated-features',
      severity: 'warning',
      message: `Action uses 'node16' runner which is deprecated. Update to 'node20'.`,
      file: filePath,
      line: node16,
    });
  }

  return findings;
}

export function checkDeprecated(content: string, filePath: string): Finding[] {
  const findings: Finding[] = [];

  // Check for deprecated action versions in raw content
  for (const check of DEPRECATED_ACTIONS) {
    if (check.pattern.test(content)) {
      const line = findLineByPattern(content, check.pattern);
      findings.push({
        rule: 'deprecated-features',
        severity: check.severity,
        message: `${check.actionRef} is outdated. Upgrade to ${check.recommended}.`,
        file: filePath,
        line,
      });
    }
  }

  // Check runner deprecations
  findings.push(...checkRunnerDeprecation(content, filePath));

  // Walk jobs/steps to check run scripts
  const workflow = parseWorkflow(content);
  if (!workflow || !workflow['jobs']) return findings;

  const jobs = workflow['jobs'] as Record<string, unknown>;
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object' || Array.isArray(job)) continue;
    const steps = ((job as Record<string, unknown>)['steps'] as unknown[]) ?? [];

    for (const step of steps) {
      if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
      const s = step as Record<string, unknown>;
      if (typeof s['run'] !== 'string') continue;
      findings.push(
        ...checkRunScript(s['run'], jobName, s['name'] as string | undefined, content, filePath),
      );
    }
  }

  return findings;
}
