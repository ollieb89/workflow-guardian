export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  file: string;
  line?: number;
}

export type RuleChecker = (content: string, filePath: string) => Finding[];

export interface Config {
  checkUndefinedActions: boolean;
  checkPathFilters: boolean;
  checkMatrixStrategy: boolean;
  checkDeprecated: boolean;
  checkSecurity: boolean;
}
