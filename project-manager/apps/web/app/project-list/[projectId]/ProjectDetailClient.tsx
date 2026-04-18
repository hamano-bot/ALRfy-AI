"use client";

import { ProjectCreateForm } from "@/app/project-list/new/ProjectCreateForm";
import { ProjectRedmineTicketsCard } from "./ProjectRedmineTicketsCard";
import { accentButtonSurfaceBaseClassName, Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { displayText } from "@/lib/empty-display";
import { PROJECT_DOCUMENT_TEMPLATES } from "@/lib/project-document-templates";
import { formatSiteTypeLabel } from "@/lib/portal-my-projects";
import { buildRedmineProjectUrl } from "@/lib/redmine-url";
import { getParticipantViewLine, type PortalProjectDetail } from "@/lib/portal-project";
import { projectPageLgMainSidebarGridClassName } from "@/lib/project-page-layout";
import { PROJECT_ROLE_LABEL_JA } from "@/lib/project-role-labels";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ProjectDetailClientProps = {
  projectId: number;
  initialProject: PortalProjectDetail;
  canEdit: boolean;
};

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="text-sm leading-relaxed text-[var(--foreground)]">{children}</div>
    </div>
  );
}

export function ProjectDetailClient({ projectId, initialProject, canEdit }: ProjectDetailClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [project, setProject] = useState<PortalProjectDetail>(initialProject);

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject]);

  if (editing) {
    return (
      <div
        className="min-h-[min(100vh,56rem)] rounded-xl border border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] bg-[var(--edit-mode-surface)] p-4 md:p-6"
        data-edit-mode="true"
      >
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] bg-[var(--edit-mode-banner)] px-4 py-2.5 text-sm text-[var(--foreground)]"
        >
          <span>
            <span className="font-semibold">編集モード</span>
            <span className="text-[var(--muted)]">：</span>
            案件を更新しています。保存するまで一覧には反映されません。
          </span>
          <Button type="button" variant="default" size="sm" className="shrink-0" onClick={() => setEditing(false)}>
            閲覧に戻る
          </Button>
        </div>
        <ProjectCreateForm
          mode="edit"
          editProjectId={projectId}
          initialDetail={project}
          onEditCancel={() => setEditing(false)}
          onEditSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      </div>
    );
  }

  const owners = project.participants.filter((p) => p.role === "owner");
  const editors = project.participants.filter((p) => p.role === "editor");
  const viewers = project.participants.filter((p) => p.role === "viewer");

  const participantColumns = [
    { key: "owner" as const, title: PROJECT_ROLE_LABEL_JA.owner, rows: owners },
    { key: "editor" as const, title: PROJECT_ROLE_LABEL_JA.editor, rows: editors },
    { key: "viewer" as const, title: PROJECT_ROLE_LABEL_JA.viewer, rows: viewers },
  ] as const;

  const pageHeading = (
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
        {canEdit ? (
          <Button
            type="button"
            variant="accent"
            size="sm"
            className="shrink-0 self-center rounded-lg"
            onClick={() => setEditing(true)}
          >
            編集
          </Button>
        ) : null}
      </div>
    </section>
  );

  const metaSections = (
    <>
      <section className="space-y-4">
        <h3 className="pm-section-heading">基本情報</h3>
        <div className="grid gap-6 sm:grid-cols-2 sm:items-start lg:gap-8">
          <ReadOnlyField label="サイト種別">{formatSiteTypeLabel(project.site_type, project.site_type_other)}</ReadOnlyField>
          <ReadOnlyField label="区分">
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
          </ReadOnlyField>
        </div>
      </section>

      <section className="space-y-4">
        <div className="grid gap-6 sm:grid-cols-2 sm:items-start lg:gap-8">
          <ReadOnlyField label="キックオフ日">{displayText(project.kickoff_date)}</ReadOnlyField>
          <ReadOnlyField label="リリース予定日">{displayText(project.release_due_date)}</ReadOnlyField>
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

  const documentList = (
    <ul className="flex flex-col gap-3">
      {PROJECT_DOCUMENT_TEMPLATES.map((t) => {
        const Icon = t.icon;
        const hearingHref = t.key === "hearing" ? `/project-list/${projectId}/hearing` : null;
        const externalOpen = Boolean(t.href && t.href.trim() !== "");
        const internalOpen = Boolean(hearingHref);
        const open = internalOpen || externalOpen;
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
                  "flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                  "lg:flex-col lg:items-stretch lg:gap-3 lg:p-3",
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
                <div className="flex shrink-0 justify-end sm:pl-2 lg:w-full lg:justify-stretch lg:pl-0">
                  {internalOpen ? (
                    <Button type="button" variant="accent" size="sm" className="gap-1 lg:w-full" asChild>
                      <Link href={hearingHref!} prefetch>
                        開く
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Button>
                  ) : open ? (
                    <Button type="button" variant="accent" size="sm" className="gap-1 lg:w-full" asChild>
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
                      className="lg:w-full"
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
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {pageHeading}

      <div className={projectPageLgMainSidebarGridClassName}>
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="space-y-10 pt-6">{metaSections}</CardContent>
          </Card>
          <ProjectRedmineTicketsCard
            projectId={projectId}
            redmineLinks={project.redmine_links}
            projectName={project.name}
            canEdit={canEdit}
          />
        </div>

        <aside className="mt-6 min-w-0 lg:mt-0 lg:sticky lg:top-4 lg:self-start">
          <Card className="overflow-hidden shadow-sm">
            <h2 id="project-detail-docs-heading" className="sr-only">
              ドキュメント
            </h2>
            <CardContent className="p-4 sm:p-5">{documentList}</CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
