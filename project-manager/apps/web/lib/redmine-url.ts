/**
 * Redmine プロジェクトのチケット一覧 URL（`/projects/:id/issues` — id / identifier どちらでも可）
 */
export function buildRedmineProjectUrl(redmineBaseUrl: string | null | undefined, redmineProjectId: number): string | null {
  if (!redmineBaseUrl || typeof redmineBaseUrl !== "string" || redmineBaseUrl.trim() === "") {
    return null;
  }
  if (!Number.isFinite(redmineProjectId) || redmineProjectId <= 0) {
    return null;
  }
  const base = redmineBaseUrl.trim().replace(/\/+$/, "");
  return `${base}/projects/${redmineProjectId}/issues`;
}

/** 個別チケット URL（`/issues/:id`） */
export function buildRedmineIssueUrl(redmineBaseUrl: string | null | undefined, issueId: number): string | null {
  if (!redmineBaseUrl || typeof redmineBaseUrl !== "string" || redmineBaseUrl.trim() === "") {
    return null;
  }
  if (!Number.isFinite(issueId) || issueId <= 0) {
    return null;
  }
  const base = redmineBaseUrl.trim().replace(/\/+$/, "");
  return `${base}/issues/${issueId}`;
}
