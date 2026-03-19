import { checkSecurity } from '../../src/rules/security';

const FILE = '.github/workflows/test.yml';

describe('security rule', () => {
  it('passes on clean workflow', () => {
    const content = `
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Safe step
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "$TITLE"
`;
    expect(checkSecurity(content, FILE)).toHaveLength(0);
  });

  it('errors on script injection via issue title', () => {
    const content = `
on: issues
jobs:
  greet:
    runs-on: ubuntu-latest
    steps:
      - name: Inject risk
        run: echo "Title is \${{ github.event.issue.title }}"
`;
    const findings = checkSecurity(content, FILE);
    expect(findings.some(f => f.severity === 'error' && f.rule === 'security')).toBe(true);
    expect(findings[0].message).toContain('github.event.issue.title');
  });

  it('errors on script injection via PR body', () => {
    const content = `
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: echo "\${{ github.event.pull_request.body }}"
`;
    const findings = checkSecurity(content, FILE);
    expect(findings.some(f => f.severity === 'error')).toBe(true);
  });

  it('errors on script injection via head_ref', () => {
    const content = `
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: git checkout \${{ github.head_ref }}
`;
    const findings = checkSecurity(content, FILE);
    expect(findings.some(f => f.severity === 'error')).toBe(true);
  });

  it('errors on pull_request_target + checkout of PR head', () => {
    const content = `
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
`;
    const findings = checkSecurity(content, FILE);
    expect(findings.some(f => f.severity === 'error' && f.message.includes('pwn request'))).toBe(true);
  });

  it('passes when pull_request_target checks out base (default)', () => {
    const content = `
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
    const findings = checkSecurity(content, FILE);
    // No checkout of PR head → no error from this rule
    expect(findings.filter(f => f.message.includes('pwn request'))).toHaveLength(0);
  });

  it('returns empty for invalid YAML', () => {
    expect(checkSecurity('{ invalid: yaml: [', FILE)).toHaveLength(0);
  });
});
