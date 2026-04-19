import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailLayoutMockVariants } from "./DetailLayoutMockVariants";

export const metadata: Metadata = {
  title: "案件詳細レイアウト比較（モック）",
  robots: { index: false, follow: false },
};

export default function DetailLayoutMocksPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="modern-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-5">
        <nav className="text-xs text-[var(--muted)]">
          <Link
            href="/project-list"
            className="text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline"
          >
            Project一覧
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-[var(--foreground)]">レイアウト比較モック</span>
        </nav>

        <DetailLayoutMockVariants />
      </div>
    </div>
  );
}
