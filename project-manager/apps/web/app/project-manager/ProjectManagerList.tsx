import Link from "next/link";
import { headers } from "next/headers";
import {
  fetchPortalMyProjectsRaw,
  formatSiteTypeLabel,
  parseMyProjectsSuccess,
  parsePortalJsonMessage,
} from "@/lib/portal-my-projects";

export default async function ProjectManagerList() {
  const cookie = (await headers()).get("cookie");
  const raw = await fetchPortalMyProjectsRaw(cookie);

  if (raw.ok === false && raw.reason === "missing_config") {
    return (
      <section
        className="surface-card border border-amber-500/35 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] p-5"
        role="alert"
      >
        <h2 className="text-lg font-semibold text-[var(--foreground)]">所属案件</h2>
        <p className="mt-2 text-sm text-[var(--foreground)]">
          <code className="text-[var(--muted)]">PORTAL_API_BASE_URL</code> が未設定のため、ポータルから案件一覧を取得できません。
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          <code className="text-[var(--muted)]">project-manager/apps/web/.env.local</code> に PHP のオリジン（例:{" "}
          <code className="text-[var(--muted)]">http://127.0.0.1:8000</code>）を設定し、Next を再起動してください。
        </p>
      </section>
    );
  }

  if (raw.ok === false && raw.reason === "upstream_unreachable") {
    return (
      <section className="surface-card border border-red-500/30 bg-[color:color-mix(in_srgb,var(--surface)_94%,red_6%)] p-5" role="alert">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">所属案件</h2>
        <p className="mt-2 text-sm text-[var(--foreground)]">ポータル API に接続できませんでした（ネットワークまたは PHP 未起動）。</p>
      </section>
    );
  }

  if (!raw.ok) {
    return null;
  }

  if (raw.status === 401) {
    const msg = parsePortalJsonMessage(raw.text) ?? "ログインが必要です。";
    return (
      <section className="surface-card p-5" role="status">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">所属案件</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{msg}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          セッションは platform-common（PHP）と共有します。PHP 側でログインしたうえで、同一ブラウザからこのアプリを開いてください。
        </p>
      </section>
    );
  }

  if (raw.status === 409) {
    const msg = parsePortalJsonMessage(raw.text) ?? "所属先が未設定のため利用できません。";
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="status">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">所属案件</h2>
        <p className="mt-2 text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  }

  if (raw.status !== 200) {
    const msg = parsePortalJsonMessage(raw.text) ?? `一覧の取得に失敗しました（HTTP ${raw.status}）。`;
    return (
      <section className="surface-card border border-red-500/30 p-5" role="alert">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">所属案件</h2>
        <p className="mt-2 text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  }

  const projects = parseMyProjectsSuccess(raw.text);
  if (!projects) {
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="alert">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">所属案件</h2>
        <p className="mt-2 text-sm text-[var(--foreground)]">レスポンスの形式が想定と異なります。</p>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section className="surface-card p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">所属案件</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          <code className="text-[var(--muted)]">project_members</code> に行がまだ無いか、案件が未登録です。共有 DB のシードまたは管理画面から所属を追加してください。
        </p>
      </section>
    );
  }

  return (
    <section className="surface-card overflow-hidden p-0" aria-label="所属案件一覧">
      <div className="border-b border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] px-5 py-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">所属案件</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          データは <code className="text-[var(--muted)]">GET /portal/api/my-projects</code>（BFF:{" "}
          <code className="text-[var(--muted)]">/api/portal/my-projects</code>
          ）と同一です。新規作成は <code className="text-[var(--muted)]">POST /api/portal/projects</code>。
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-[color:color-mix(in_srgb,var(--surface)_96%,var(--accent)_4%)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-5 py-3 font-medium">案件名</th>
              <th className="px-3 py-3 font-medium">クライアント</th>
              <th className="px-3 py-3 font-medium">サイト種別</th>
              <th className="px-3 py-3 font-medium">リニューアル</th>
              <th className="px-3 py-3 font-medium">キックオフ</th>
              <th className="px-3 py-3 font-medium">リリース予定</th>
              <th className="px-3 py-3 font-medium">ID</th>
              <th className="px-3 py-3 font-medium">slug</th>
              <th className="px-5 py-3 font-medium">あなたのロール</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:color-mix(in_srgb,var(--border)_85%,transparent)]">
            {projects.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)]">
                <td className="px-5 py-3">
                  <Link
                    href={`/project-manager/${p.id}`}
                    className="font-medium text-[color:color-mix(in_srgb,var(--accent)_88%,var(--foreground)_12%)] underline-offset-2 hover:underline"
                  >
                    {p.name || `（無題 #${p.id}）`}
                  </Link>
                </td>
                <td className="max-w-[10rem] truncate px-3 py-3 text-[var(--muted)]" title={p.client_name ?? undefined}>
                  {p.client_name ?? "—"}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-3 text-[var(--muted)]" title={formatSiteTypeLabel(p.site_type, p.site_type_other)}>
                  {formatSiteTypeLabel(p.site_type, p.site_type_other)}
                </td>
                <td className="px-3 py-3 text-[var(--muted)]">{p.is_renewal ? "はい" : "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)]">{p.kickoff_date ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)]">{p.release_due_date ?? "—"}</td>
                <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">{p.id}</td>
                <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">{p.slug ?? "—"}</td>
                <td className="px-5 py-3">
                  <span className="inline-block rounded-full bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]">
                    {p.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
