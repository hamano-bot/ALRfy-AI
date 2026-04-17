import type { Metadata } from "next";
import { SystemUpdatesCard } from "./components/SystemUpdatesCard";

export const metadata: Metadata = {
  title: "ダッシュボード",
  description: "アプリ一覧・ショートカット（Next.js）",
};

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <section className="surface-card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -top-12 right-0 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl" />
        <p className="inline-flex rounded-full border border-blue-400/40 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-300">
          Dashboard
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">ようこそ</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          この画面は共通レイアウトの `MainContent` エリアです。ルート遷移後もヘッダー・左サイド・AIチャット導線は維持されます。
        </p>
      </section>

      <SystemUpdatesCard />
    </div>
  );
}
