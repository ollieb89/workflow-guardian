import { checkMatrixStrategy } from '../../src/rules/matrix-strategy';

const FILE = '.github/workflows/test.yml';

describe('matrix-strategy rule', () => {
  it('passes on valid matrix', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      max-parallel: 4
      matrix:
        node: [18, 20, 22]
        os: [ubuntu-latest, windows-latest]
    steps: []
`;
    expect(checkMatrixStrategy(content, FILE)).toHaveLength(0);
  });

  it('errors when fail-fast is not boolean', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: "yes"
      matrix:
        node: [18, 20]
    steps: []
`;
    const findings = checkMatrixStrategy(content, FILE);
    expect(findings.some(f => f.severity === 'error' && f.message.includes('fail-fast'))).toBe(true);
  });

  it('errors when max-parallel is not a number', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      max-parallel: "all"
      matrix:
        node: [18, 20]
    steps: []
`;
    const findings = checkMatrixStrategy(content, FILE);
    expect(findings.some(f => f.severity === 'error' && f.message.includes('max-parallel'))).toBe(true);
  });

  it('errors on empty matrix dimension', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: []
    steps: []
`;
    const findings = checkMatrixStrategy(content, FILE);
    expect(findings.some(f => f.severity === 'error' && f.message.includes("'node'"))).toBe(true);
  });

  it('warns when exclude has no base dimensions', () => {
    const content = `
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        exclude:
          - node: 18
    steps: []
`;
    const findings = checkMatrixStrategy(content, FILE);
    expect(findings.some(f => f.severity === 'warning' && f.message.includes('exclude'))).toBe(true);
  });

  it('passes with no strategy', () => {
    const content = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
`;
    expect(checkMatrixStrategy(content, FILE)).toHaveLength(0);
  });
});
