import type { Metadata } from "next";
import { PortalAppCards } from "./components/PortalAppCards";
import { SystemUpdatesCard } from "./components/SystemUpdatesCard";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "アプリ一覧・ショートカット（Project Web）",
};

export default function DashboardPage() {
  return (
    <div className="modern-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-5">
      <section className="surface-card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -top-12 right-0 h-40 w-40 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_28%,transparent)] blur-3xl" />
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">ようこそ ALRfy-AIへ</h1>
        <p className="mt-3 max-w-3xl text-[color:color-mix(in_srgb,var(--foreground)_88%,transparent)]">
          すべてAIで構築したシステムです。Project や AI チャットなど、あなたの業務をサポートします。
        </p>
      </section>

      <PortalAppCards />

      <SystemUpdatesCard />
      </div>
    </div>
  );
}
