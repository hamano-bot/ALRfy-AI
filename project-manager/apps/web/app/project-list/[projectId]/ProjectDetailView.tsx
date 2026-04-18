import {
  fetchPortalProjectPermissionRaw,
  parseProjectPermissionSuccess,
  sourceLabelJa,
} from "@/lib/portal-project-permission";
import {
  fetchPortalProjectRaw,
  parsePortalJsonMessage,
  parsePortalProjectSuccess,
} from "@/lib/portal-project";
import { DUMMY_PROJECT_LIST_ROWS, getDummyPortalProjectDetail } from "@/lib/project-list-dummy";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ProjectDetailClient } from "./ProjectDetailClient";

type ProjectDetailViewProps = {
  projectId: string;
};

function isDemoMode(): boolean {
  const v = process.env.NEXT_PUBLIC_PROJECT_LIST_DEMO;
  return v === "1" || v === "true";
}

export default async function ProjectDetailView({ projectId }: ProjectDetailViewProps) {
  const pid = Number.parseInt(projectId, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    notFound();
  }

  const cookie = (await headers()).get("cookie");

  if (isDemoMode()) {
    const detail = getDummyPortalProjectDetail(pid);
    if (!detail) {
      notFound();
    }
    const row = DUMMY_PROJECT_LIST_ROWS.find((r) => r.id === pid);
    /** デモは API 未接続のため閲覧のみ（編集 UI は本番相当で検証） */
    const canEdit = false;
    const permissionPanel = (
      <section className="surface-card overflow-hidden p-0">
        <div className="border-b border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border)_65%)] bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">この案件での権限（デモ）</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">NEXT_PUBLIC_PROJECT_LIST_DEMO 有効時は API を呼ばず一覧ダミーのロールを表示します。</p>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <p className="text-[var(--foreground)]">
            一覧上のロール: <span className="font-mono font-semibold">{row?.role ?? "—"}</span>
          </p>
        </div>
      </section>
    );
    return (
      <ProjectDetailClient projectId={pid} initialProject={detail} canEdit={canEdit ?? false} permissionPanel={permissionPanel} />
    );
  }

  const [projRaw, permRaw] = await Promise.all([
    fetchPortalProjectRaw(cookie, pid),
    fetchPortalProjectPermissionRaw(cookie, pid),
  ]);

  const permissionPanel = (() => {
    if (permRaw.ok === false && permRaw.reason === "missing_config") {
      return (
        <section
          className="surface-card border border-amber-500/35 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] p-5"
          role="alert"
        >
          <h2 className="text-lg font-semibold text-[var(--foreground)]">この案件での実効ロール</h2>
          <p className="mt-2 text-sm text-[var(--foreground)]">
            <code className="text-[var(--muted)]">PORTAL_API_BASE_URL</code> が未設定のため、
            <code className="text-[var(--muted)]">GET /portal/api/project-permission</code> を呼べません。
          </p>
        </section>
      );
    }
    if (permRaw.ok === false && permRaw.reason === "upstream_unreachable") {
      return (
        <section className="surface-card border border-red-500/30 p-5" role="alert">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">この案件での実効ロール</h2>
          <p className="mt-2 text-sm text-[var(--foreground)]">ポータル API に接続できませんでした。</p>
        </section>
      );
    }
    if (!permRaw.ok) {
      return null;
    }

    if (permRaw.status === 401) {
      const msg = parsePortalJsonMessage(permRaw.text) ?? "ログインが必要です。";
      return (
        <section className="surface-card p-5" role="status">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">この案件での実効ロール</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{msg}</p>
        </section>
      );
    }

    if (permRaw.status === 409) {
      const msg = parsePortalJsonMessage(permRaw.text) ?? "所属先が未設定のため利用できません。";
      return (
        <section className="surface-card border border-amber-500/35 p-5" role="status">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">この案件での実効ロール</h2>
          <p className="mt-2 text-sm text-[var(--foreground)]">{msg}</p>
        </section>
      );
    }

    if (permRaw.status === 403) {
      const msg = parsePortalJsonMessage(permRaw.text) ?? "このプロジェクトへのアクセス権限がありません。";
      return (
        <section className="surface-card border border-amber-500/35 p-5" role="status">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">この案件での実効ロール</h2>
          <p className="mt-2 text-sm text-[var(--foreground)]">{msg}</p>
        </section>
      );
    }

    if (permRaw.status !== 200) {
      const msg = parsePortalJsonMessage(permRaw.text) ?? `取得に失敗しました（HTTP ${permRaw.status}）。`;
      return (
        <section className="surface-card border border-red-500/30 p-5" role="alert">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">この案件での実効ロール</h2>
          <p className="mt-2 text-sm text-[var(--foreground)]">{msg}</p>
        </section>
      );
    }

    const parsed = parseProjectPermissionSuccess(permRaw.text);
    if (!parsed) {
      return (
        <section className="surface-card border border-amber-500/35 p-5" role="alert">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">この案件での実効ロール</h2>
          <p className="mt-2 text-sm text-[var(--foreground)]">レスポンスの形式が想定と異なります。</p>
        </section>
      );
    }

    const srcJa = sourceLabelJa(parsed.source);
    const { project_role: pr, resource_role: rr } = parsed.candidates;

    return (
      <section className="surface-card overflow-hidden p-0">
        <div className="border-b border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border)_65%)] bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">この案件での実効ロール</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            上流は <code className="text-[var(--muted)]">GET /portal/api/project-permission?project_id={pid}</code>
          </p>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <p className="text-[var(--foreground)]">
            実効ロール:{" "}
            <span className="rounded-full bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] px-2.5 py-0.5 text-sm font-semibold text-[var(--accent)]">
              {parsed.effective_role}
            </span>
            <span className="ml-2 text-[var(--muted)]">根拠: {srcJa}</span>
            <span className="ml-1 text-xs text-[var(--muted)]">（{parsed.source}）</span>
          </p>
          <dl className="grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
            <div>
              <dt className="font-medium text-[var(--foreground)]">candidates.project_role</dt>
              <dd className="mt-0.5 font-mono">{pr ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--foreground)]">candidates.resource_role</dt>
              <dd className="mt-0.5 font-mono">{rr ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </section>
    );
  })();

  if (projRaw.ok === false && projRaw.reason === "missing_config") {
    return (
      <section
        className="surface-card border border-amber-500/35 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] p-5"
        role="alert"
      >
        <p className="text-sm font-semibold text-[var(--foreground)]">案件を表示できません</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">
          <code className="text-[var(--muted)]">PORTAL_API_BASE_URL</code> が未設定のため、案件の取得に失敗しました。
        </p>
      </section>
    );
  }

  if (projRaw.ok === false && projRaw.reason === "upstream_unreachable") {
    return (
      <section className="surface-card border border-red-500/30 p-5" role="alert">
        <p className="text-sm font-semibold text-[var(--foreground)]">案件を表示できません</p>
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

  let canEdit = false;
  if (permRaw.ok && permRaw.status === 200) {
    const p = parseProjectPermissionSuccess(permRaw.text);
    if (p) {
      const er = p.effective_role.trim().toLowerCase();
      canEdit = er === "owner" || er === "editor";
    }
  }

  return (
    <ProjectDetailClient projectId={pid} initialProject={project} canEdit={canEdit} permissionPanel={permissionPanel} />
  );
}
