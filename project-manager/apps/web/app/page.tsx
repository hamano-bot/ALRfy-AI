import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ダッシュボード",
  description: "アプリ一覧・ショートカット（Next.js）",
};

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm font-medium text-blue-400">ダッシュボード</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
        ようこそ
      </h1>
      <p className="mt-3 text-slate-400">
        platform-common のダッシュボードとは別の、Next.js 内の入口です。上部ナビの「案件管理」からアプリ本体へ移動できます。
      </p>
      <ul className="mt-8 space-y-3 text-sm text-slate-500">
        <li>
          ここにカード一覧・権限に応じたアプリリンク（portal API 連携）を置けます。
        </li>
      </ul>
    </main>
  );
}
