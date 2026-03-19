import { checkPathFilters } from '../../src/rules/path-filter-bugs';

const FILE = '.github/workflows/test.yml';

describe('path-filter-bugs rule', () => {
  it('passes on valid paths filter', () => {
    const content = `
on:
  push:
    paths:
      - 'src/**'
      - '!src/generated/**'
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
`;
    expect(checkPathFilters(content, FILE)).toHaveLength(0);
  });

  it('errors on paths + paths-ignore used together', () => {
    const content = `
on:
  push:
    paths:
      - 'src/**'
    paths-ignore:
      - 'docs/**'
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
`;
    const findings = checkPathFilters(content, FILE);
    const errors = findings.filter(f => f.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].rule).toBe('path-filter-bugs');
  });

  it('errors on branches + branches-ignore used together', () => {
    const content = `
on:
  push:
    branches:
      - main
    branches-ignore:
      - develop
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
`;
    const findings = checkPathFilters(content, FILE);
    expect(findings.some(f => f.severity === 'error')).toBe(true);
  });

  it('warns on path starting with /', () => {
    const content = `
on:
  push:
    paths:
      - /src/main.ts
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
`;
    const findings = checkPathFilters(content, FILE);
    expect(findings.some(f => f.severity === 'warning' && f.message.includes('/'))).toBe(true);
  });

  it('warns on empty paths array', () => {
    const content = `
on:
  push:
    paths: []
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
`;
    const findings = checkPathFilters(content, FILE);
    expect(findings.some(f => f.severity === 'warning')).toBe(true);
  });

  it('passes on string trigger with no filter config', () => {
    const content = `
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
`;
    expect(checkPathFilters(content, FILE)).toHaveLength(0);
  });
});
