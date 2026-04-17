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
        <div className="pointer-events-none absolute -top-12 right-0 h-40 w-40 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_28%,transparent)] blur-3xl" />
        <p className="inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_16%,transparent)] px-2 py-1 text-xs font-medium text-[color:color-mix(in_srgb,var(--accent)_82%,white_18%)]">
          Dashboard
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">ようこそ</h1>
        <p className="mt-3 max-w-3xl text-[color:color-mix(in_srgb,var(--foreground)_88%,transparent)]">
          この画面は共通レイアウトの `MainContent` エリアです。ルート遷移後もヘッダー・左サイド・AIチャット導線は維持されます。
        </p>
      </section>

      <SystemUpdatesCard />
    </div>
  );
}
