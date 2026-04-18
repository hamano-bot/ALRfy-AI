import { normalizeHearingRows } from "@/lib/hearing-sheet-body-utils";
import { getDefaultRowsForTemplate } from "@/lib/hearing-sheet-template-rows";
import { resolveHearingTemplateId, shouldSeedHearingTemplate } from "@/lib/hearing-sheet-template-matrix";
import {
  fetchPortalHearingSheetRaw,
  parsePortalHearingSheetSuccess,
} from "@/lib/portal-hearing-sheet-fetch";
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
import { ProjectHearingSheetClient } from "./ProjectHearingSheetClient";

type ProjectHearingViewProps = {
  projectId: string;
};

export default async function ProjectHearingView({ projectId }: ProjectHearingViewProps) {
  const pid = Number.parseInt(projectId, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    notFound();
  }

  const cookie = (await headers()).get("cookie");

  const [projRaw, permRaw, hearRaw] = await Promise.all([
    fetchPortalProjectRaw(cookie, pid),
    fetchPortalProjectPermissionRaw(cookie, pid),
    fetchPortalHearingSheetRaw(cookie, pid),
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

  if (hearRaw.ok === false && hearRaw.reason === "missing_config") {
    return (
      <section
        className="surface-card border border-amber-500/35 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] p-5"
        role="alert"
      >
        <p className="text-sm font-semibold text-[var(--foreground)]">ヒアリングシートを表示できません</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">
          <code className="text-[var(--muted)]">PORTAL_API_BASE_URL</code> が未設定のため、API に接続できません。
        </p>
      </section>
    );
  }

  if (hearRaw.ok === false && hearRaw.reason === "upstream_unreachable") {
    return (
      <section className="surface-card border border-red-500/30 p-5" role="alert">
        <p className="text-sm font-semibold text-[var(--foreground)]">ヒアリングシートを表示できません</p>
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

  let initialStatus: "draft" | "finalized" | "archived" = "draft";
  let initialRows = normalizeHearingRows(null);
  let bodyRaw: unknown = null;

  if (hearRaw.ok && hearRaw.status === 200) {
    const h = parsePortalHearingSheetSuccess(hearRaw.text);
    if (h) {
      initialStatus = h.status;
      bodyRaw = h.body_json;
      initialRows = normalizeHearingRows(h.body_json);
    }
  } else if (hearRaw.ok && hearRaw.status === 401) {
    const msg = parsePortalJsonMessage(hearRaw.text) ?? "ログインが必要です。";
    return (
      <section className="surface-card p-5" role="status">
        <p className="text-sm text-[var(--muted)]">{msg}</p>
      </section>
    );
  } else if (hearRaw.ok && hearRaw.status === 403) {
    const msg = parsePortalJsonMessage(hearRaw.text) ?? "このプロジェクトへのアクセス権限がありません。";
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="status">
        <p className="text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  } else if (hearRaw.ok && hearRaw.status !== 200) {
    const msg = parsePortalJsonMessage(hearRaw.text) ?? `ヒアリングシートの取得に失敗しました（HTTP ${hearRaw.status}）。`;
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="alert">
        <p className="text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  }

  const resolvedTemplateId = resolveHearingTemplateId(project);
  if (shouldSeedHearingTemplate(project, bodyRaw) && initialRows.length === 0) {
    initialRows = getDefaultRowsForTemplate(resolvedTemplateId);
  }

  return (
    <ProjectHearingSheetClient
      projectId={pid}
      project={project}
      resolvedTemplateId={resolvedTemplateId}
      initialRows={initialRows}
      initialStatus={initialStatus}
      canEdit={canEdit}
    />
  );
}
