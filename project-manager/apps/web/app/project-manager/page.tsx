import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "案件管理",
  description: "案件・ドキュメント管理（案件管理 Web）",
};

export default function ProjectManagerHomePage() {
  return (
    <section className="space-y-4">
      <p className="text-sm font-medium text-[color:color-mix(in_srgb,var(--accent)_82%,white_18%)]">
        project-manager / apps/web
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
        案件管理
      </h1>
      <p className="mt-4 text-[var(--muted)]">
        Next.js スキャフォールドが有効です。ここから一覧・詳細・ドキュメント編集へ拡張します。
      </p>
      <ul className="mt-6 list-inside list-disc space-y-2 text-sm text-[var(--muted)]">
        <li>
          ドキュメント雛形: <code className="text-[var(--muted)]">docs/projects/_sample</code>
        </li>
        <li>
          ローカル: <code className="text-[var(--muted)]">npm run dev</code> →{" "}
          <code className="text-[var(--muted)]">/</code>（ダッシュボード）・
          <code className="text-[var(--muted)]">/project-manager</code>（本ページ）
        </li>
        <li>
          開発 URL: <code className="text-[var(--muted)]">npm run dev:lan</code> →{" "}
          <code className="text-[var(--muted)]">http://dev-ALRfy-AI.com:8001/</code>
          {" · "}
          <code className="text-[var(--muted)]">http://dev-ALRfy-AI.com:8001/project-manager</code>
        </li>
      </ul>
    </section>
  );
}
