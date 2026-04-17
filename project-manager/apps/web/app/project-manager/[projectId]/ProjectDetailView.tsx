import {
  fetchPortalProjectPermissionRaw,
  parseProjectPermissionSuccess,
  sourceLabelJa,
} from "@/lib/portal-project-permission";
import {
  fetchPortalMyProjectsRaw,
  parseMyProjectsSuccess,
  parsePortalJsonMessage,
} from "@/lib/portal-my-projects";
import { headers } from "next/headers";

type ProjectDetailViewProps = {
  projectId: string;
};

export default async function ProjectDetailView({ projectId }: ProjectDetailViewProps) {
  const pid = Number.parseInt(projectId, 10);
  const cookie = (await headers()).get("cookie");

  const [listRaw, permRaw] = await Promise.all([
    fetchPortalMyProjectsRaw(cookie),
    fetchPortalProjectPermissionRaw(cookie, pid),
  ]);

  let projectName: string | null = null;
  let projectSlug: string | null = null;
  let membershipRole: string | null = null;

  if (listRaw.ok === true && listRaw.status === 200) {
    const rows = parseMyProjectsSuccess(listRaw.text);
    if (rows) {
      const row = rows.find((r) => r.id === pid);
      if (row) {
        projectName = row.name !== "" ? row.name : null;
        projectSlug = row.slug;
        membershipRole = row.role;
      }
    }
  }

  const metaTitle = projectName ?? `案件 #${pid}`;

  const permSection = () => {
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
          <p className="mt-2 text-xs text-[var(--muted)]">
            ダッシュボードの帯（<code className="text-[var(--muted)]">EffectiveProjectRoleBanner</code>）も、同一の{" "}
            <code className="text-[var(--muted)]">GET /portal/api/project-permission</code>（BFF:{" "}
            <code className="text-[var(--muted)]">/api/portal/project-permission</code>）です。
          </p>
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
            上流は <code className="text-[var(--muted)]">GET /portal/api/project-permission?project_id={pid}</code>。ダッシュボード帯と同一データ源（RSC でサーバー取得）。
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
  };

  return (
    <div className="space-y-5">
      <section className="surface-card p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">{metaTitle}</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          slug・一覧上のロールは <code className="text-[var(--muted)]">GET /portal/api/my-projects</code> の行から解決（同一セッションで{" "}
          <code className="text-[var(--muted)]">project-permission</code> と並列取得）。
        </p>
        <h2 className="mt-5 text-sm font-semibold text-[var(--foreground)]">一覧由来の属性</h2>
        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">project_id</dt>
            <dd className="mt-1 font-mono text-[var(--foreground)]">{pid}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">slug</dt>
            <dd className="mt-1 font-mono text-[var(--foreground)]">{projectSlug ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">一覧上のロール（project_members）</dt>
            <dd className="mt-1 text-[var(--foreground)]">{membershipRole ?? "（一覧に該当行なし・未取得）"}</dd>
          </div>
        </dl>
      </section>

      {permSection()}

      <section className="surface-card p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">ドキュメント一覧・編集（ルート案）</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          次段で実装する際の App Router の分割案です。リポジトリ内の Markdown 雛形（例:{" "}
          <code className="text-[var(--foreground)]">docs/projects/_sample</code>）と揃える想定です。
        </p>
        <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-[var(--muted)]">
          <li>
            <code className="text-[var(--foreground)]">/project-manager/[projectId]</code> — 概要・権限（本ページ）
          </li>
          <li>
            <code className="text-[var(--foreground)]">/project-manager/[projectId]/documents</code> — ドキュメント一覧（種別・更新日・リンク）
          </li>
          <li>
            <code className="text-[var(--foreground)]">/project-manager/[projectId]/documents/[docSlug]</code> — 1 ドキュメントの閲覧・編集（
            <code className="text-[var(--foreground)]">docSlug</code> はファイル名や論理キー）
          </li>
          <li>
            権限ゲートは本ページと同様 <code className="text-[var(--foreground)]">project-permission</code> を RSC で確認し、編集は{" "}
            <code className="text-[var(--foreground)]">editor</code> 以上などポリシー化
          </li>
        </ul>
      </section>
    </div>
  );
}
