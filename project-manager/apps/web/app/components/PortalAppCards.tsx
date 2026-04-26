"use client";

import Link from "next/link";
import { Briefcase, CalendarDays, ExternalLink, FileText } from "lucide-react";
import { isExternalPortalRoute, isPortalAppInteractive } from "../lib/portal-app-helpers";
import { PortalAppIcon } from "../lib/portal-app-icons";
import { usePortalApps } from "./PortalAppsProvider";
import { accentButtonSurfaceBaseClassName } from "./ui/button";

const portalCardIconBoxClass = [
  accentButtonSurfaceBaseClassName,
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_12px_rgba(15,23,42,0.32)]",
].join(" ");

/** ポータル未接続時の議事録フォールバック（通常は API の `minutes-record` の `title` / `route` を表示）。 */
const MEETING_FALLBACK_HREF = "http://minutes-record.com:8080/";

function visibilityLabel(visibility: string): string {
  if (visibility === "visible_enabled") {
    return "利用可能";
  }
  if (visibility === "visible_disabled") {
    return "権限により利用不可";
  }
  return visibility;
}

function cardSurfaceClass(interactive: boolean): string {
  return [
    "surface-card block h-full rounded-xl border p-4 text-left transition-colors",
    interactive
      ? "border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)]"
      : "cursor-not-allowed border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] opacity-70",
  ].join(" ");
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
        <p className="mt-3 text-xs text-[var(--muted)]">ポータルに繋がない間でも、下記から移動できます。</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a
            href={MEETING_FALLBACK_HREF}
            target="_blank"
            rel="noreferrer noopener"
            className="group inline-flex max-w-full items-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-3 py-2.5 text-sm text-[var(--foreground)] shadow-sm transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)] hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)]"
            title="議事録（外部サイト・別タブ）"
            aria-label="議事録サイトを新しいタブで開く"
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
              議事録（外部）
            </span>
            <ExternalLink
              className="h-4 w-4 shrink-0 text-[var(--muted)] opacity-75 transition-opacity group-hover:opacity-100 group-hover:text-[var(--foreground)]"
              aria-hidden
            />
          </a>
          <Link
            href="/project-list"
            className="group inline-flex max-w-full items-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-3 py-2.5 text-sm text-[var(--foreground)] shadow-sm transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)] hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)]"
            aria-label="Project へ"
          >
            <span
              className={[
                accentButtonSurfaceBaseClassName,
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_12px_rgba(15,23,42,0.32)] transition-[filter] duration-200 group-hover:brightness-110",
              ].join(" ")}
            >
              <Briefcase className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 font-medium transition-colors group-hover:text-[color:color-mix(in_srgb,var(--accent)_88%,var(--foreground)_12%)]">
              Project
            </span>
          </Link>
          <Link
            href="/estimates"
            className="group inline-flex max-w-full items-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-3 py-2.5 text-sm text-[var(--foreground)] shadow-sm transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)] hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)]"
            aria-label="Estimates へ"
          >
            <span
              className={[
                accentButtonSurfaceBaseClassName,
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_12px_rgba(15,23,42,0.32)] transition-[filter] duration-200 group-hover:brightness-110",
              ].join(" ")}
            >
              <FileText className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 font-medium transition-colors group-hover:text-[color:color-mix(in_srgb,var(--accent)_88%,var(--foreground)_12%)]">
              Estimates
            </span>
          </Link>
        </div>
      </section>
    );
  }

  if (apps.length === 0) {
    return (
      <section className="surface-card p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">アプリ</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">表示できるアプリがありません。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <a
            href={MEETING_FALLBACK_HREF}
            target="_blank"
            rel="noreferrer noopener"
            className={cardSurfaceClass(true)}
            title="議事録（外部・別タブ）"
          >
            <div className="flex items-start gap-3">
              <span className={portalCardIconBoxClass}>
                <PortalAppIcon appKey="minutes-record" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]" lang="en" translate="no">
                  minutes-record
                </p>
                <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">議事録（外部）</h3>
                <p className="mt-2 text-xs text-[var(--muted)]">ポータルにアプリ行が無いときのショートカット</p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-label="別タブで開く" />
            </div>
          </a>
          <Link href="/project-list" className={cardSurfaceClass(true)}>
            <div className="flex items-start gap-3">
              <span className={portalCardIconBoxClass}>
                <PortalAppIcon appKey="project-manager" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]" lang="en" translate="no">
                  project-manager
                </p>
                <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">Project</h3>
                <p className="mt-2 text-xs text-[var(--muted)]">同一オリジン</p>
              </div>
            </div>
          </Link>
          <Link href="/estimates" className={cardSurfaceClass(true)}>
            <div className="flex items-start gap-3">
              <span className={portalCardIconBoxClass}>
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]" lang="en" translate="no">
                  estimate-manager
                </p>
                <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">Estimates</h3>
                <p className="mt-2 text-xs text-[var(--muted)]">同一オリジン</p>
              </div>
            </div>
          </Link>
        </div>
      </section>
    );
  }

  const pmApp = apps.find((a) => a.app_key === "project-manager");
  const appsWithoutPm = apps.filter((a) => a.app_key !== "project-manager");
  const pmInteractive = pmApp ? isPortalAppInteractive(pmApp.visibility) : true;

  const projectManagerBody = (
    <div className="flex items-start gap-3">
      <span className={portalCardIconBoxClass}>
        <PortalAppIcon appKey="project-manager" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]" lang="en" translate="no">
          project-manager
        </p>
        <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">{pmApp?.title ?? "Project"}</h3>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {pmApp ? visibilityLabel(pmApp.visibility) : "利用可能"}
        </p>
        {pmApp?.reason ? <p className="mt-1 text-xs text-[var(--muted)]">理由: {pmApp.reason}</p> : null}
      </div>
    </div>
  );

  const projectManagerCard = pmInteractive ? (
    <Link key="project-manager-card" href="/project-list" className={cardSurfaceClass(true)}>
      {projectManagerBody}
    </Link>
  ) : (
    <div key="project-manager-card" className={cardSurfaceClass(false)}>
      {projectManagerBody}
    </div>
  );

  return (
    <section className="space-y-3" aria-label="アプリ一覧">
      <h2 className="text-lg font-semibold text-[var(--foreground)]">アプリ</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {appsWithoutPm.map((app) => {
          const interactive = isPortalAppInteractive(app.visibility);
          const external = interactive && isExternalPortalRoute(app.route);
          const muted = !interactive;

          const cardBody = (
            <div className="flex items-start gap-3">
              <span className={portalCardIconBoxClass}>
                <PortalAppIcon appKey={app.app_key} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]" lang="en" translate="no">
                  {app.app_key}
                </p>
                <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">{app.title}</h3>
                <p className="mt-2 text-xs text-[var(--muted)]">{visibilityLabel(app.visibility)}</p>
                {app.reason ? <p className="mt-1 text-xs text-[var(--muted)]">理由: {app.reason}</p> : null}
              </div>
              {interactive && external ? (
                <span className="mt-0.5 shrink-0 text-[var(--muted)]" title="別タブで開く" aria-hidden="true">
                  <ExternalLink className="h-4 w-4" />
                </span>
              ) : null}
            </div>
          );

          const surfaceClass = cardSurfaceClass(!muted);

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
        {projectManagerCard}
        <Link key="estimate-manager-card" href="/estimates" className={cardSurfaceClass(true)}>
          <div className="flex items-start gap-3">
            <span className={portalCardIconBoxClass}>
              <FileText className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]" lang="en" translate="no">
                estimate-manager
              </p>
              <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">Estimates</h3>
              <p className="mt-2 text-xs text-[var(--muted)]">利用可能</p>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
