import { normalizeRequirementsDocBody } from "@/lib/requirements-doc-normalize";
import {
  fetchPortalRequirementsRaw,
  parsePortalRequirementsSuccess,
} from "@/lib/portal-requirements-fetch";
import {
  fetchPortalProjectRaw,
  parsePortalJsonMessage,
  parsePortalProjectSuccess,
} from "@/lib/portal-project";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ProjectRequirementsClient } from "./ProjectRequirementsClient";

type ProjectRequirementsViewProps = {
  projectId: string;
};

export default async function ProjectRequirementsView({ projectId }: ProjectRequirementsViewProps) {
  const pid = Number.parseInt(projectId, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    notFound();
  }

  const cookie = (await headers()).get("cookie");

  const [projRaw, reqRaw] = await Promise.all([
    fetchPortalProjectRaw(cookie, pid),
    fetchPortalRequirementsRaw(cookie, pid),
  ]);

  if (projRaw.ok === false && projRaw.reason === "missing_config") {
    return (
      <section
        className="surface-card border border-amber-500/35 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] p-5"
        role="alert"
      >
        <p className="text-sm font-semibold text-[var(--foreground)]">表示できません</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">
          <code className="text-[var(--muted)]">PORTAL_API_BASE_URL</code> が未設定のため、API に接続できません。
        </p>
      </section>
    );
  }

  if (projRaw.ok === false && projRaw.reason === "upstream_unreachable") {
    return (
      <section className="surface-card border border-red-500/30 p-5" role="alert">
        <p className="text-sm font-semibold text-[var(--foreground)]">表示できません</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">ポータル API に接続できませんでした。</p>
      </section>
    );
  }

  if (!projRaw.ok) {
    return null;
  }

  if (projRaw.status === 401) {
    const msg = parsePortalJsonMessage(projRaw.text) ?? "ログインが必要です。";
    return (
      <section className="surface-card p-5" role="status">
        <p className="text-sm text-[var(--muted)]">{msg}</p>
      </section>
    );
  }

  if (projRaw.status === 403) {
    const msg = parsePortalJsonMessage(projRaw.text) ?? "このプロジェクトへのアクセス権限がありません。";
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="status">
        <p className="text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  }

  if (projRaw.status === 404) {
    notFound();
  }

  if (projRaw.status !== 200) {
    const msg = parsePortalJsonMessage(projRaw.text) ?? `取得に失敗しました（HTTP ${projRaw.status}）。`;
    return (
      <section className="surface-card border border-red-500/30 p-5" role="alert">
        <p className="text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  }

  const project = parsePortalProjectSuccess(projRaw.text);
  if (!project) {
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="alert">
        <p className="text-sm text-[var(--foreground)]">案件データの形式が想定と異なります。</p>
      </section>
    );
  }

  if (reqRaw.ok === false && reqRaw.reason === "missing_config") {
    return (
      <section
        className="surface-card border border-amber-500/35 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] p-5"
        role="alert"
      >
        <p className="text-sm font-semibold text-[var(--foreground)]">要件定義を表示できません</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">
          <code className="text-[var(--muted)]">PORTAL_API_BASE_URL</code> が未設定のため、API に接続できません。
        </p>
      </section>
    );
  }

  if (reqRaw.ok === false && reqRaw.reason === "upstream_unreachable") {
    return (
      <section className="surface-card border border-red-500/30 p-5" role="alert">
        <p className="text-sm font-semibold text-[var(--foreground)]">要件定義を表示できません</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">ポータル API に接続できませんでした。</p>
      </section>
    );
  }

  const canEdit = project.effective_role === "owner" || project.effective_role === "editor";

  let initialBody = normalizeRequirementsDocBody({});
  let requirementsExists = false;

  if (reqRaw.ok && reqRaw.status === 200) {
    try {
      const parsedRaw = JSON.parse(reqRaw.text) as { requirements?: { exists?: unknown } };
      requirementsExists = parsedRaw?.requirements?.exists === true;
    } catch {
      requirementsExists = false;
    }
    const r = parsePortalRequirementsSuccess(reqRaw.text);
    if (r) {
      initialBody = normalizeRequirementsDocBody(r.body_json);
    }
  } else if (reqRaw.ok && reqRaw.status === 401) {
    const msg = parsePortalJsonMessage(reqRaw.text) ?? "ログインが必要です。";
    return (
      <section className="surface-card p-5" role="status">
        <p className="text-sm text-[var(--muted)]">{msg}</p>
      </section>
    );
  } else if (reqRaw.ok && reqRaw.status === 403) {
    const msg = parsePortalJsonMessage(reqRaw.text) ?? "このプロジェクトへのアクセス権限がありません。";
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="status">
        <p className="text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  } else if (reqRaw.ok && reqRaw.status !== 200) {
    const msg = parsePortalJsonMessage(reqRaw.text) ?? `要件定義の取得に失敗しました（HTTP ${reqRaw.status}）。`;
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="alert">
        <p className="text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  }

  const projectName = project.name?.trim() !== "" ? project.name : `プロジェクト #${pid}`;

  return (
    <ProjectRequirementsClient
      projectId={pid}
      projectName={projectName}
      canEdit={canEdit}
      initialBody={initialBody}
      initialExists={requirementsExists}
    />
  );
}
