import { checkDeprecated } from '../../src/rules/deprecated-features';

const FILE = '.github/workflows/test.yml';

describe('deprecated-features rule', () => {
  it('passes on modern workflow', () => {
    const content = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set output
        run: echo "result=done" >> $GITHUB_OUTPUT
`;
    expect(checkDeprecated(content, FILE)).toHaveLength(0);
  });

  it('errors on ::set-env:: command', () => {
    const content = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Old env
        run: echo "::set-env name=FOO::bar"
`;
    const findings = checkDeprecated(content, FILE);
    expect(findings.some(f => f.severity === 'error' && f.message.includes('set-env'))).toBe(true);
  });

  it('errors on ::add-path:: command', () => {
    const content = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Old path
        run: echo "::add-path::/usr/local/bin"
`;
    const findings = checkDeprecated(content, FILE);
    expect(findings.some(f => f.severity === 'error')).toBe(true);
  });

  it('warns on ::set-output:: command', () => {
    const content = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Old output
        run: echo "::set-output name=result::done"
`;
    const findings = checkDeprecated(content, FILE);
    expect(findings.some(f => f.severity === 'warning' && f.message.includes('set-output'))).toBe(true);
  });

  it('warns on outdated action version', () => {
    const content = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
`;
    const findings = checkDeprecated(content, FILE);
    expect(findings.some(f => f.message.includes('checkout@v1'))).toBe(true);
  });

  it('flags node12 runner as error', () => {
    const content = `runs:
  using: node12
  main: dist/index.js
`;
    const findings = checkDeprecated(content, FILE);
    expect(findings.some(f => f.severity === 'error' && f.message.includes('node12'))).toBe(true);
  });

  it('flags node16 runner as warning', () => {
    const content = `runs:
  using: node16
  main: dist/index.js
`;
    const findings = checkDeprecated(content, FILE);
    expect(findings.some(f => f.severity === 'warning' && f.message.includes('node16'))).toBe(true);
  });
});
