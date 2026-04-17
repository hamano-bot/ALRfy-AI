import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "案件管理",
  description: "案件・ドキュメント管理（Next.js）",
};

export default function ProjectManagerHomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 pb-16 pt-8">
      <p className="text-sm font-medium text-blue-400">project-manager / apps/web</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">
        案件管理
      </h1>
      <p className="mt-4 text-slate-400">
        Next.js スキャフォールドが有効です。ここから一覧・詳細・ドキュメント編集へ拡張します。
      </p>
      <ul className="mt-8 list-inside list-disc space-y-2 text-sm text-slate-500">
        <li>
          ドキュメント雛形: <code className="text-slate-400">docs/projects/_sample</code>
        </li>
        <li>
          ローカル: <code className="text-slate-400">npm run dev</code> →{" "}
          <code className="text-slate-400">/</code>（ダッシュボード）・
          <code className="text-slate-400">/project-manager</code>（本ページ）
        </li>
        <li>
          開発 URL: <code className="text-slate-400">npm run dev:lan</code> →{" "}
          <code className="text-slate-400">http://dev-ALRfy-AI.com:8001/</code>
          {" · "}
          <code className="text-slate-400">http://dev-ALRfy-AI.com:8001/project-manager</code>
        </li>
      </ul>
    </main>
  );
}
