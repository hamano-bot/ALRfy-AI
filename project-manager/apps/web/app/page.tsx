export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
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
          開発: <code className="text-slate-400">npm run dev</code>（ポート 3000）
        </li>
      </ul>
    </main>
  );
}
