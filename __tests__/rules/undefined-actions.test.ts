import { checkUndefinedActions } from '../../src/rules/undefined-actions';

const FILE = '.github/workflows/test.yml';

function yaml(content: string) {
  return content;
}

describe('undefined-actions rule', () => {
  it('passes on SHA-pinned actions', () => {
    const content = yaml(`
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@8e5e7e5ab8b370d6c329ec480221332ada57f0ab
`);
    expect(checkUndefinedActions(content, FILE)).toHaveLength(0);
  });

  it('errors on action with no @ref', () => {
    const content = yaml(`
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout
`);
    const findings = checkUndefinedActions(content, FILE);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].rule).toBe('undefined-actions');
  });

  it('warns on floating branch ref @main', () => {
    const content = yaml(`
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
`);
    const findings = checkUndefinedActions(content, FILE);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
  });

  it('warns on floating branch ref @master', () => {
    const content = yaml(`
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@master
`);
    const findings = checkUndefinedActions(content, FILE);
    expect(findings[0].severity).toBe('warning');
  });

  it('info on tag-pinned actions (not SHA)', () => {
    const content = yaml(`
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`);
    const findings = checkUndefinedActions(content, FILE);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
  });

  it('skips local actions', () => {
    const content = yaml(`
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: ./local-action
`);
    expect(checkUndefinedActions(content, FILE)).toHaveLength(0);
  });

  it('skips Docker actions', () => {
    const content = yaml(`
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: docker://alpine:3.18
`);
    expect(checkUndefinedActions(content, FILE)).toHaveLength(0);
  });

  it('returns empty array for invalid YAML', () => {
    expect(checkUndefinedActions('{ invalid: yaml: [', FILE)).toHaveLength(0);
  });
});
