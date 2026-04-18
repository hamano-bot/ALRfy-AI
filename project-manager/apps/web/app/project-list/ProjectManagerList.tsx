import { headers } from "next/headers";
import { ProjectListTable } from "./ProjectListTable";
import {
  fetchPortalMyProjectsRaw,
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
        <p className="text-sm font-semibold text-[var(--foreground)]">一覧を表示できません</p>
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
        <p className="text-sm font-semibold text-[var(--foreground)]">一覧を表示できません</p>
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
        <p className="text-sm font-semibold text-[var(--foreground)]">案件一覧</p>
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
        <p className="text-sm font-semibold text-[var(--foreground)]">案件一覧</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  }

  if (raw.status !== 200) {
    const msg = parsePortalJsonMessage(raw.text) ?? `一覧の取得に失敗しました（HTTP ${raw.status}）。`;
    return (
      <section className="surface-card border border-red-500/30 p-5" role="alert">
        <p className="text-sm font-semibold text-[var(--foreground)]">一覧を表示できません</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  }

  const projects = parseMyProjectsSuccess(raw.text);
  if (!projects) {
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="alert">
        <p className="text-sm font-semibold text-[var(--foreground)]">一覧を表示できません</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">レスポンスの形式が想定と異なります。</p>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section className="surface-card p-5" aria-label="案件一覧">
        <p className="text-sm text-[var(--muted)]">
          <code className="text-[var(--muted)]">project_members</code> に行がまだ無いか、案件が未登録です。共有 DB のシードまたは管理画面から所属を追加してください。
        </p>
      </section>
    );
  }

  return (
    <section
      id="project-list"
      className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      aria-label="案件一覧"
    >
      <ProjectListTable initialProjects={projects} />
    </section>
  );
}
