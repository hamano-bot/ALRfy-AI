"use client";

import { accentButtonSurfaceBaseClassName, Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { MOCK_DOCUMENT_TEMPLATES, MOCK_PROJECT } from "@/lib/detail-layout-mock-data";
import { displayText } from "@/lib/empty-display";
import { formatSiteTypeLabel } from "@/lib/portal-my-projects";
import { buildRedmineProjectUrl } from "@/lib/redmine-url";
import { getParticipantViewLine, type PortalProjectDetail } from "@/lib/portal-project";
import { PROJECT_ROLE_LABEL_JA } from "@/lib/project-role-labels";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

const VARIANT_TABS = [
  { id: "1" as const, label: "案1：タブ" },
  { id: "2" as const, label: "案2：スプリット" },
  { id: "3" as const, label: "案3：クイックアクセス" },
  { id: "4" as const, label: "案4：ミニ目次" },
] as const;

type VariantId = (typeof VARIANT_TABS)[number]["id"];

function MockReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="text-sm leading-relaxed text-[var(--foreground)]">{children}</div>
    </div>
  );
}

function MetaSections({ project }: { project: PortalProjectDetail }) {
  const owners = project.participants.filter((p) => p.role === "owner");
  const editors = project.participants.filter((p) => p.role === "editor");
  const viewers = project.participants.filter((p) => p.role === "viewer");
  const participantColumns = [
    { key: "owner" as const, title: PROJECT_ROLE_LABEL_JA.owner, rows: owners },
    { key: "editor" as const, title: PROJECT_ROLE_LABEL_JA.editor, rows: editors },
    { key: "viewer" as const, title: PROJECT_ROLE_LABEL_JA.viewer, rows: viewers },
  ] as const;

  return (
    <>
      <section className="space-y-4">
        <h3 className="pm-section-heading">基本情報</h3>
        <div className="grid gap-6 sm:grid-cols-2 sm:items-start lg:gap-8">
          <MockReadOnlyField label="サイト種別">{formatSiteTypeLabel(project.site_type, project.site_type_other)}</MockReadOnlyField>
          <MockReadOnlyField label="区分">
            <>
              <p className="text-sm leading-relaxed text-[var(--foreground)]">{project.is_renewal ? "リニューアル" : "新規"}</p>
              {project.is_renewal && project.renewal_urls.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-2 text-sm leading-relaxed text-[var(--foreground)]">
                  {project.renewal_urls.map((u) => (
                    <li key={u}>
                      <a
                        href={u}
                        className="text-[color:color-mix(in_srgb,var(--accent)_85%,var(--foreground)_15%)] hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {u}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          </MockReadOnlyField>
        </div>
      </section>

      <section className="space-y-4">
        <div className="grid gap-6 sm:grid-cols-2 sm:items-start lg:gap-8">
          <MockReadOnlyField label="キックオフ日">{displayText(project.kickoff_date)}</MockReadOnlyField>
          <MockReadOnlyField label="リリース予定日">{displayText(project.release_due_date)}</MockReadOnlyField>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <h3 className="pm-section-heading">Redmine</h3>
          {project.redmine_links.length === 0 ? null : (
            <ul className="space-y-2 text-sm leading-relaxed">
              {project.redmine_links.map((r) => {
                const redmineHref = buildRedmineProjectUrl(r.redmine_base_url, r.redmine_project_id);
                const linkText =
                  r.redmine_project_name && r.redmine_project_name.trim() !== ""
                    ? r.redmine_project_name.trim()
                    : project.redmine_links.length === 1 && project.name.trim() !== ""
                      ? project.name.trim()
                      : `プロジェクト #${r.redmine_project_id}`;
                return (
                  <li key={`${r.redmine_project_id}-${r.redmine_base_url ?? ""}`} className="text-[var(--foreground)]">
                    {redmineHref ? (
                      <a
                        href={redmineHref}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:color-mix(in_srgb,var(--accent)_85%,var(--foreground)_15%)] hover:underline"
                      >
                        {linkText}
                      </a>
                    ) : (
                      <span>{linkText}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="space-y-4">
          <h3 className="pm-section-heading">各種リンク</h3>
          {project.misc_links.length === 0 ? null : (
            <ul className="space-y-2 text-sm leading-relaxed">
              {project.misc_links.map((m) => (
                <li key={`${m.label}-${m.url}`}>
                  <span className="text-[var(--foreground)]">{m.label}: </span>
                  <a
                    href={m.url}
                    className="break-all text-[color:color-mix(in_srgb,var(--accent)_85%,var(--foreground)_15%)] hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {m.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="pm-section-heading">参加者</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {participantColumns.map((col) => (
            <div
              key={col.key}
              className="rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] p-3.5"
            >
              <p className="mb-2.5 text-xs font-medium text-[var(--muted)]">{col.title}</p>
              <ul className="space-y-2 text-sm leading-relaxed">
                {col.rows.length === 0 ? null : (
                  col.rows.map((p) => {
                    const { primary, showUserIdSuffix } = getParticipantViewLine(p);
                    return (
                      <li key={p.user_id} className="text-[var(--foreground)]">
                        <span className="font-medium">{primary}</span>
                        {showUserIdSuffix ? (
                          <span className="ml-1.5 font-mono text-xs text-[var(--muted)]">#{p.user_id}</span>
                        ) : null}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function DocumentCards({
  listClassName,
  cardGrid,
  /** 右カラム用: 2列グリッドにせず、狭幅でも横書きで読めるレイアウト */
  sidebarColumn,
}: {
  listClassName?: string;
  cardGrid?: boolean;
  sidebarColumn?: boolean;
}) {
  const listGap = sidebarColumn ? "flex flex-col gap-3" : cardGrid ? "mt-3 grid gap-3 sm:grid-cols-2" : "mt-3 flex flex-col gap-3";

  return (
    <div>
      <h2 id="layout-mock-docs-heading" className="sr-only">
        ドキュメント
      </h2>
      <ul className={cn(listGap, listClassName)}>
        {MOCK_DOCUMENT_TEMPLATES.map((t) => {
          const Icon = t.icon;
          const open = Boolean(t.href && t.href.trim() !== "");
          return (
            <li key={t.key}>
              <Card
                className={cn(
                  "shadow-sm transition-colors",
                  "border-[color:color-mix(in_srgb,var(--border)_90%,transparent)]",
                  open &&
                    "border-[color:color-mix(in_srgb,var(--accent)_42%,var(--border)_58%)] bg-[color:color-mix(in_srgb,var(--accent)_11%,var(--surface)_89%)]",
                )}
              >
                <CardContent
                  className={cn(
                    "flex gap-3",
                    sidebarColumn
                      ? "flex-col p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 lg:flex-col lg:items-stretch lg:gap-3 lg:p-3"
                      : "flex-col p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={cn(
                        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_12px_rgba(15,23,42,0.32)] motion-safe:transition motion-safe:duration-200",
                        accentButtonSurfaceBaseClassName,
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-[var(--foreground)]">{t.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{t.description}</p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex shrink-0 justify-end sm:pl-2",
                      sidebarColumn && "lg:w-full lg:justify-stretch lg:pl-0",
                    )}
                  >
                    {open ? (
                      <Button
                        type="button"
                        variant="accent"
                        size="sm"
                        className={cn("gap-1", sidebarColumn && "lg:w-full")}
                        asChild
                      >
                        <a href={t.href} target="_blank" rel="noreferrer">
                          開く
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className={cn(sidebarColumn && "lg:w-full")}
                        disabled
                        title="連携先の画面は準備中です"
                      >
                        準備中
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MockPageHeading({ project }: { project: PortalProjectDetail }) {
  return (
    <section className="surface-card pm-page-hero relative shrink-0 overflow-hidden px-5">
      <div className="pointer-events-none absolute -top-10 right-0 h-36 w-36 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] blur-3xl" />
      <div className="relative flex h-full min-h-0 items-center justify-between gap-3">
        <div className="flex min-h-0 min-w-0 flex-1 items-start gap-3">
          <Link
            href="/project-list"
            prefetch
            className="shrink-0 pt-0.5 text-sm text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline"
          >
            ← 戻る
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold leading-tight tracking-tight text-[var(--foreground)] md:text-2xl">
              {project.name}
            </h1>
            <p className="mt-1 min-w-0 truncate text-sm leading-relaxed text-[var(--foreground)]">{displayText(project.client_name)}</p>
          </div>
        </div>
        <Button type="button" variant="default" size="sm" className="shrink-0 self-center" disabled title="モックでは操作しません">
          編集
        </Button>
      </div>
    </section>
  );
}

function Variant1Tabs({ project }: { project: PortalProjectDetail }) {
  const [panel, setPanel] = useState<"overview" | "docs">("overview");
  const tabId = useId();

  return (
    <div className="space-y-4">
      <MockPageHeading project={project} />
      <Card className="overflow-hidden shadow-sm">
      <div className="border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-4 pt-2">
        <div className="flex gap-1" role="tablist" aria-label="案件ビュー">
          <button
            type="button"
            role="tab"
            id={`${tabId}-overview`}
            aria-selected={panel === "overview"}
            aria-controls={`${tabId}-overview-panel`}
            className={cn(
              "rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              panel === "overview"
                ? "border-b-2 border-[var(--accent)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            )}
            onClick={() => setPanel("overview")}
          >
            概要
          </button>
          <button
            type="button"
            role="tab"
            id={`${tabId}-docs`}
            aria-selected={panel === "docs"}
            aria-controls={`${tabId}-docs-panel`}
            className={cn(
              "rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              panel === "docs"
                ? "border-b-2 border-[var(--accent)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            )}
            onClick={() => setPanel("docs")}
          >
            ドキュメント
          </button>
        </div>
      </div>
      {panel === "overview" ? (
        <CardContent id={`${tabId}-overview-panel`} role="tabpanel" aria-labelledby={`${tabId}-overview`} className="space-y-8 pt-6">
          <MetaSections project={project} />
        </CardContent>
      ) : (
        <CardContent id={`${tabId}-docs-panel`} role="tabpanel" aria-labelledby={`${tabId}-docs`} className="space-y-8 pt-6">
          <DocumentCards cardGrid />
        </CardContent>
      )}
      </Card>
    </div>
  );
}

function Variant2Split({ project }: { project: PortalProjectDetail }) {
  return (
    <div className="flex flex-col gap-5">
      <MockPageHeading project={project} />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="space-y-10 pt-6">
              <div id="layout-mock-meta">
                <MetaSections project={project} />
              </div>
            </CardContent>
          </Card>
        </div>
        <aside className="mt-6 min-w-0 lg:mt-0 lg:sticky lg:top-4 lg:self-start">
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <DocumentCards sidebarColumn />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Variant3QuickAccess({ project }: { project: PortalProjectDetail }) {
  return (
    <div className="space-y-6">
      <MockPageHeading project={project} />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] px-4 py-3">
        <span className="text-xs font-medium text-[var(--muted)]">クイック:</span>
        {MOCK_DOCUMENT_TEMPLATES.map((t) => (
          <Button key={t.key} type="button" size="sm" variant="default" className="h-8 text-xs" disabled title="モック">
            {t.title}
          </Button>
        ))}
      </div>
      <Card className="overflow-hidden shadow-sm">
        <CardContent className="space-y-8 pt-6">
          <MetaSections project={project} />
        </CardContent>
      </Card>
      <section className="min-w-0">
        <DocumentCards />
      </section>
    </div>
  );
}

function Variant4MiniToc({ project }: { project: PortalProjectDetail }) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_11rem] lg:items-start lg:gap-6">
      <div className="min-w-0 space-y-6">
        <MockPageHeading project={project} />
        <Card className="overflow-hidden shadow-sm">
          <CardContent className="space-y-8 pt-6">
            <div id="layout-mock-meta-top">
              <MetaSections project={project} />
            </div>
          </CardContent>
        </Card>
        <section id="layout-mock-docs-block" aria-labelledby="layout-mock-docs-heading">
          <DocumentCards />
        </section>
      </div>
      <aside
        className="sticky top-4 mt-6 hidden h-fit min-w-0 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] p-3 text-sm lg:mt-0 lg:block"
        aria-label="この案件のジャンプ"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">移動</p>
        <ul className="space-y-2">
          <li>
            <a href="#layout-mock-meta-top" className="text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline">
              基本情報〜参加者
            </a>
          </li>
          <li>
            <a href="#layout-mock-docs-heading" className="text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline">
              ドキュメント
            </a>
          </li>
        </ul>
      </aside>
    </div>
  );
}

export function DetailLayoutMockVariants() {
  const [variant, setVariant] = useState<VariantId>("1");
  const listId = useId();

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg border border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] px-4 py-3 text-sm text-[var(--foreground)]"
        role="status"
      >
        <span className="font-semibold">レイアウト比較モック</span>
        <span className="text-[var(--muted)]"> — </span>
        本番の案件詳細とは独立したダミーデータです。案1〜4を切り替えて比較してください。
      </div>

      <div>
        <p id={`${listId}-label`} className="mb-2 text-xs font-medium text-[var(--muted)]">
          表示パターン
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${listId}-label`}>
          {VARIANT_TABS.map((v) => (
            <Button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={variant === v.id}
              variant={variant === v.id ? "default" : "ghost"}
              size="sm"
              className="rounded-full"
              onClick={() => setVariant(v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>
      </div>

      {variant === "1" ? <Variant1Tabs project={MOCK_PROJECT} /> : null}
      {variant === "2" ? <Variant2Split project={MOCK_PROJECT} /> : null}
      {variant === "3" ? <Variant3QuickAccess project={MOCK_PROJECT} /> : null}
      {variant === "4" ? <Variant4MiniToc project={MOCK_PROJECT} /> : null}
    </div>
  );
}
