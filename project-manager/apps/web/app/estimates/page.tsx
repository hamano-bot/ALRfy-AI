import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/app/components/ui/button";
import { EstimatesListClient } from "./EstimatesListClient";

export const metadata: Metadata = {
  title: "Estimates",
  description: "見積一覧",
};

export default function EstimatesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
      <section className="surface-card relative shrink-0 overflow-hidden px-5 py-4">
        <div className="pointer-events-none absolute -top-10 right-0 h-36 w-36 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] blur-3xl" />
        <div className="relative flex min-h-0 flex-row items-center justify-between gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-[var(--foreground)] sm:text-2xl">Estimates</h1>
            <p className="line-clamp-2 text-xs leading-snug text-[color:color-mix(in_srgb,var(--foreground)_88%,transparent)] sm:text-sm">
              見積一覧です。下書き / 提出済み / 受注 / 失注を管理します。
            </p>
          </div>
          <div className="flex shrink-0 self-center">
            <Button asChild variant="accent" size="sm" className="rounded-lg">
              <Link href="/estimates/new" prefetch>
                新規作成
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <EstimatesListClient />
    </div>
  );
}
