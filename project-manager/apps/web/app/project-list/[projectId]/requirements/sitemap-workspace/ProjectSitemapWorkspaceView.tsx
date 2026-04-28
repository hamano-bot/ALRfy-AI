import { normalizeRequirementsDocBody } from "@/lib/requirements-doc-normalize";
import {
  fetchPortalRequirementsRaw,
  parsePortalRequirementsSuccess,
} from "@/lib/portal-requirements-fetch";
import {
  fetchPortalProjectPermissionRaw,
  parseProjectPermissionSuccess,
} from "@/lib/portal-project-permission";
import {
  fetchPortalProjectRaw,
  parsePortalJsonMessage,
  parsePortalProjectSuccess,
} from "@/lib/portal-project";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ProjectSitemapWorkspaceClient } from "./ProjectSitemapWorkspaceClient";

type Props = {
  projectId: string;
  targetPageId: string | undefined;
};

export default async function ProjectSitemapWorkspaceView({ projectId, targetPageId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    notFound();
  }

  if (!targetPageId || targetPageId.trim() === "") {
    return (
      <section className="surface-card p-5" role="status">
        <p className="text-sm text-[var(--foreground)]">
          クエリ <code className="rounded bg-[var(--surface-soft)] px-1 text-xs">page</code>{" "}
          にサイトマップページの ID を指定してください。
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">要件定義のプレビュー欄「別タブで編集」から開くと自動で付きます。</p>
      </section>
    );
  }

  const cookie = (await headers()).get("cookie");

  const [projRaw, permRaw, reqRaw] = await Promise.all([
    fetchPortalProjectRaw(cookie, pid),
    fetchPortalProjectPermissionRaw(cookie, pid),
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

  let canEdit = false;
  if (permRaw.ok && permRaw.status === 200) {
    const p = parseProjectPermissionSuccess(permRaw.text);
    if (p) {
      const er = p.effective_role.trim().toLowerCase();
      canEdit = er === "owner" || er === "editor";
    }
  }

  let initialBody = normalizeRequirementsDocBody({});

  if (reqRaw.ok && reqRaw.status === 200) {
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

  return (
    <div className="h-full min-h-0 min-w-0">
      <ProjectSitemapWorkspaceClient projectId={pid} canEdit={canEdit} initialBody={initialBody} targetPageId={targetPageId} />
    </div>
  );
}
