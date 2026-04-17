"use client";

import Link from "next/link";
import { CalendarDays, ExternalLink } from "lucide-react";
import { isExternalPortalRoute, isPortalAppInteractive } from "../lib/portal-app-helpers";
import { usePortalApps } from "./PortalAppsProvider";
import { accentButtonSurfaceBaseClassName } from "./ui/button";

const MEETING_HREF = process.env.NEXT_PUBLIC_MEETING_URL || "http://minutes-record.com:8080/";

function visibilityLabel(visibility: string): string {
  if (visibility === "visible_enabled") {
    return "利用可能";
  }
  if (visibility === "visible_disabled") {
    return "権限により利用不可";
  }
  return visibility;
}

export function PortalAppCards() {
  const { apps, loading, error } = usePortalApps();

  if (loading) {
    return (
      <section className="surface-card p-5" aria-busy="true" aria-label="アプリ一覧を読み込み中">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">アプリ</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">読み込み中…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="surface-card border border-amber-500/35 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] p-5" role="alert">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">アプリ</h2>
        <p className="mt-2 text-sm text-[var(--foreground)]">{error}</p>
        <p className="mt-3 text-xs text-[var(--muted)]">ポータルに繋がない間でも Meeting へ移動できます。</p>
        <a
          href={MEETING_HREF}
          target="_blank"
          rel="noreferrer noopener"
          className="group mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-3 py-2.5 text-sm text-[var(--foreground)] shadow-sm transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)] hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)]"
          title="Meeting — 外部サイトへ移動します（別タブ）"
          aria-label="Meeting 外部リンク（新しいタブで開く）"
        >
          <span
            className={[
              accentButtonSurfaceBaseClassName,
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_12px_rgba(15,23,42,0.32)] transition-[filter] duration-200 group-hover:brightness-110",
            ].join(" ")}
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 font-medium transition-colors group-hover:text-[color:color-mix(in_srgb,var(--accent)_88%,var(--foreground)_12%)]">
            Meeting
          </span>
          <ExternalLink
            className="h-4 w-4 shrink-0 text-[var(--muted)] opacity-75 transition-opacity group-hover:opacity-100 group-hover:text-[var(--foreground)]"
            aria-hidden
          />
        </a>
      </section>
    );
  }

  if (apps.length === 0) {
    return (
      <section className="surface-card p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">アプリ</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">表示できるアプリがありません。</p>
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="アプリ一覧">
      <h2 className="text-lg font-semibold text-[var(--foreground)]">アプリ</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => {
          const interactive = isPortalAppInteractive(app.visibility);
          const external = interactive && isExternalPortalRoute(app.route);
          const muted = !interactive;

          const cardBody = (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{app.app_key}</p>
              <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">{app.title}</h3>
              <p className="mt-2 text-xs text-[var(--muted)]">{visibilityLabel(app.visibility)}</p>
              {app.reason ? <p className="mt-1 text-xs text-[var(--muted)]">理由: {app.reason}</p> : null}
            </>
          );

          const surfaceClass = [
            "surface-card block h-full rounded-xl border p-4 text-left transition-colors",
            muted
              ? "cursor-not-allowed border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] opacity-70"
              : "border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)]",
          ].join(" ");

          if (!interactive) {
            return (
              <div key={app.app_key} className={surfaceClass}>
                {cardBody}
              </div>
            );
          }

          if (external) {
            return (
              <a key={app.app_key} href={app.route} className={surfaceClass} rel="noreferrer noopener" target="_blank">
                {cardBody}
              </a>
            );
          }

          return (
            <Link key={app.app_key} href={app.route} className={surfaceClass}>
              {cardBody}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
