import { Finding, Severity } from './types';

const COMMENT_MARKER = '<!-- workflow-guardian-v1 -->';

const SEV_ICON: Record<Severity, string> = {
  error: '🔴',
  warning: '🟡',
  info: '🔵',
};

function formatComment(findings: Finding[], scannedFiles: string[]): string {
  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');
  const infos = findings.filter(f => f.severity === 'info');

  const hasIssues = findings.length > 0;
  const statusIcon = errors.length > 0 ? '❌' : warnings.length > 0 ? '⚠️' : '✅';

  const lines: string[] = [];
  lines.push(COMMENT_MARKER);
  lines.push(`## ${statusIcon} Workflow Guardian`);
  lines.push('');

  // Summary line
  const fileSummary = `Scanned **${scannedFiles.length}** workflow file${scannedFiles.length === 1 ? '' : 's'}`;
  if (!hasIssues) {
    lines.push(`${fileSummary} — no issues found.`);
    lines.push('');
    lines.push('All workflow files look good!');
  } else {
    const parts: string[] = [];
    if (errors.length) parts.push(`**${errors.length} error${errors.length === 1 ? '' : 's'}**`);
    if (warnings.length)
      parts.push(`**${warnings.length} warning${warnings.length === 1 ? '' : 's'}**`);
    if (infos.length) parts.push(`**${infos.length} info${infos.length === 1 ? '' : 's'}**`);
    lines.push(`${fileSummary} — ${parts.join(', ')} found.`);

    if (errors.length > 0) {
      lines.push('');
      lines.push('> 🔴 **CI is failing.** Fix all errors before merging.');
    }

    // Group findings by file
    const byFile = new Map<string, Finding[]>();
    for (const finding of findings) {
      if (!byFile.has(finding.file)) byFile.set(finding.file, []);
      byFile.get(finding.file)!.push(finding);
    }

    for (const [file, fileFindings] of byFile) {
      lines.push('');
      lines.push(`### \`${file}\``);
      lines.push('');
      lines.push('| Line | Severity | Rule | Message |');
      lines.push('|------|----------|------|---------|');

      // Sort: errors first, then warnings, then info
      const sorted = [...fileFindings].sort((a, b) => {
        const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      });

      for (const finding of sorted) {
        const lineRef = finding.line != null ? `L${finding.line}` : '—';
        const sev = `${SEV_ICON[finding.severity]} ${finding.severity}`;
        const msg = finding.message.replace(/\|/g, '\\|');
        lines.push(`| ${lineRef} | ${sev} | \`${finding.rule}\` | ${msg} |`);
      }
    }
  }

  // Scanned files accordion
  lines.push('');
  lines.push(
    `<details><summary>Scanned files (${scannedFiles.length})</summary>`,
  );
  lines.push('');
  for (const f of scannedFiles) {
    lines.push(`- \`${f}\``);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');
  lines.push(
    '---',
  );
  lines.push(
    '*[Workflow Guardian](https://github.com/marketplace/actions/workflow-guardian) — Advanced GitHub Actions linter*',
  );

  return lines.join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function postOrUpdateComment(
  octokit: any,
  owner: string,
  repo: string,
  pullNumber: number,
  findings: Finding[],
  scannedFiles: string[],
): Promise<void> {
  const body = formatComment(findings, scannedFiles);

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });

  const existing = comments.find((c: { id: number; body?: string }) => c.body?.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
  }
}
