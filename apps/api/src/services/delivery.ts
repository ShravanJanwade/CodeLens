import { github, repoPath } from './github-client';
import { getRepository } from './repository-sync';
export async function deliveryEvidence(repo: Awaited<ReturnType<typeof getRepository>>, branch?: string) {
  const prefix = repoPath(repo),
    user = repo.userId;
  const read = async (path: string, select: (value: any) => any = (v) => v) => {
    try {
      return { data: select(await github(path, user)), error: null };
    } catch (error) {
      let message = 'GitHub could not provide this evidence.';
      try {
        message = JSON.parse((error as Error).message).error.message;
      } catch {}
      return { data: [], error: message };
    }
  };
  const [workflows, deployments, pulls, dependabot, codeScanning, secretScanning] = await Promise.all([
    read(`${prefix}/actions/runs?per_page=15${branch ? `&branch=${encodeURIComponent(branch)}` : ''}`, (v) =>
      v.workflow_runs.map((r: any) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        branch: r.head_branch,
        sha: r.head_sha,
        url: r.html_url,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    ),
    read(`${prefix}/deployments?per_page=8`, (v) =>
      v.map((r: any) => ({
        id: r.id,
        environment: r.environment,
        sha: r.sha,
        ref: r.ref,
        createdAt: r.created_at,
        description: r.description,
      })),
    ),
    read(`${prefix}/pulls?state=open&per_page=20`, (v) =>
      v.map((r: any) => ({
        number: r.number,
        title: r.title,
        url: r.html_url,
        head: r.head.ref,
        base: r.base.ref,
        sha: r.head.sha,
        draft: r.draft,
      })),
    ),
    read(`${prefix}/dependabot/alerts?state=open&per_page=20`, (v) =>
      v.map((r: any) => ({
        number: r.number,
        title: r.security_advisory.summary,
        severity: r.security_advisory.severity,
        path: r.dependency.manifest_path,
        url: r.html_url,
        package: r.dependency.package.name,
        fix: r.security_vulnerability?.first_patched_version?.identifier ?? null,
      })),
    ),
    read(`${prefix}/code-scanning/alerts?state=open&per_page=20`, (v) =>
      v.map((r: any) => ({
        number: r.number,
        title: r.rule.description,
        severity: r.rule.security_severity_level ?? r.rule.severity,
        path: r.most_recent_instance?.location?.path,
        line: r.most_recent_instance?.location?.start_line,
        url: r.html_url,
      })),
    ),
    read(`${prefix}/secret-scanning/alerts?state=open&per_page=20`, (v) =>
      v.map((r: any) => ({
        number: r.number,
        title: r.secret_type_display_name,
        url: r.html_url,
        createdAt: r.created_at,
      })),
    ),
  ]);
  deployments.data = await Promise.all(
    deployments.data.map(async (d: any) => {
      const status = await read(`${prefix}/deployments/${d.id}/statuses?per_page=1`);
      return {
        ...d,
        state: status.data[0]?.state ?? 'unknown',
        environmentUrl: status.data[0]?.environment_url,
        logUrl: status.data[0]?.log_url,
        statusError: status.error,
      };
    }),
  );
  const recommendations: any[] = [];
  for (const run of workflows.data.filter((r: any) =>
    ['failure', 'timed_out', 'action_required'].includes(r.conclusion),
  ))
    recommendations.push({
      title: `Review ${run.name}`,
      detail:
        'Open the failed job and first failing step. Reproduce that command with the same commit and runtime before choosing a fix.',
      url: run.url,
      kind: 'pipeline',
    });
  for (const alert of dependabot.data)
    recommendations.push({
      title: `Update ${alert.package}`,
      detail: alert.fix
        ? `GitHub reports patched version ${alert.fix}. Review compatibility and regenerate the lockfile, then run tests.`
        : 'Review the advisory for a supported patched version or mitigation.',
      url: alert.url,
      kind: 'security',
    });
  for (const alert of secretScanning.data)
    recommendations.push({
      title: `Rotate ${alert.title}`,
      detail:
        'Revoke or rotate the exposed credential with its provider, update dependent deployments, and follow the GitHub alert remediation. The secret value is never returned here.',
      url: alert.url,
      kind: 'security',
    });
  return {
    capturedAt: new Date().toISOString(),
    branch: branch ?? null,
    workflows,
    deployments,
    pulls,
    dependabot,
    codeScanning,
    secretScanning,
    recommendations,
    limits:
      'Latest 15 workflow runs, 8 deployments, 20 open items per category. Missing permission is reported separately from an empty result.',
  };
}
