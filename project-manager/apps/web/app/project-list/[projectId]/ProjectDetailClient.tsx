"use client";

import { ProjectCreateForm } from "@/app/project-list/new/ProjectCreateForm";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { PROJECT_DOCUMENT_TEMPLATES } from "@/lib/project-document-templates";
import { formatSiteTypeLabel } from "@/lib/portal-my-projects";
import type { PortalProjectDetail } from "@/lib/portal-project";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ProjectDetailClientProps = {
  projectId: number;
  initialProject: PortalProjectDetail;
  canEdit: boolean;
  permissionPanel: React.ReactNode;
};

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="text-sm text-[var(--foreground)]">{children}</div>
    </div>
  );
}

export function ProjectDetailClient({ projectId, initialProject, canEdit, permissionPanel }: ProjectDetailClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [project, setProject] = useState<PortalProjectDetail>(initialProject);

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject]);

  if (editing) {
    return (
      <div className="space-y-6">
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
        {permissionPanel}
      </div>
    );
  }

  const owners = project.participants.filter((p) => p.role === "owner");
  const editors = project.participants.filter((p) => p.role === "editor");
  const viewers = project.participants.filter((p) => p.role === "viewer");

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-8">
        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] pb-4">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-xl font-semibold tracking-tight">{project.name}</CardTitle>
              <p className="font-mono text-xs text-[var(--muted)]">
                slug: {project.slug ?? "—"} · #{project.id}
              </p>
            </div>
            {canEdit ? (
              <Button type="button" variant="default" size="sm" className="shrink-0" onClick={() => setEditing(true)}>
                編集
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">基本情報</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="クライアント名">{project.client_name ?? "—"}</ReadOnlyField>
                <ReadOnlyField label="サイト種別">
                  {formatSiteTypeLabel(project.site_type, project.site_type_other)}
                </ReadOnlyField>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">リニューアル</h3>
              <p className="text-sm text-[var(--foreground)]">{project.is_renewal ? "リニューアル" : "新規"}</p>
              {project.is_renewal && project.renewal_urls.length > 0 ? (
                <ul className="list-inside list-disc space-y-1 text-sm text-[var(--foreground)]">
                  {project.renewal_urls.map((u) => (
                    <li key={u}>
                      <a href={u} className="text-[color:color-mix(in_srgb,var(--accent)_85%,var(--foreground)_15%)] hover:underline" target="_blank" rel="noreferrer">
                        {u}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="flex flex-col gap-4 sm:flex-row sm:gap-12">
              <ReadOnlyField label="キックオフ日">{project.kickoff_date ?? "—"}</ReadOnlyField>
              <ReadOnlyField label="リリース予定日">{project.release_due_date ?? "—"}</ReadOnlyField>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Redmine</h3>
              {project.redmine_links.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">—</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {project.redmine_links.map((r) => (
                    <li key={`${r.redmine_project_id}-${r.redmine_base_url ?? ""}`} className="font-mono text-[var(--foreground)]">
                      プロジェクト ID {r.redmine_project_id}
                      {r.redmine_base_url ? ` · ${r.redmine_base_url}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">各種リンク</h3>
              {project.misc_links.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">—</p>
              ) : (
                <ul className="space-y-2 text-sm">
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
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">参加者</h3>
              <div className="grid gap-4 md:grid-cols-3">
                {(
                  [
                    { key: "owner" as const, title: "オーナー", rows: owners },
                    { key: "editor" as const, title: "編集権限", rows: editors },
                    { key: "viewer" as const, title: "参照権限", rows: viewers },
                  ] as const
                ).map((col) => (
                  <div
                    key={col.key}
                    className="rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] p-3"
                  >
                    <p className="mb-2 text-xs font-medium text-[var(--muted)]">{col.title}</p>
                    <ul className="space-y-2 text-sm">
                      {col.rows.length === 0 ? (
                        <li className="text-[var(--muted)]">—</li>
                      ) : (
                        col.rows.map((p) => (
                          <li key={p.user_id} className="text-[var(--foreground)]">
                            <span className="font-medium">{p.display_name ?? `user ${p.user_id}`}</span>
                            <span className="ml-1.5 font-mono text-xs text-[var(--muted)]">#{p.user_id}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </CardContent>
        </Card>

        <div className="space-y-6">{permissionPanel}</div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">ドキュメント</h3>
        <p className="text-xs text-[var(--muted)]">標準テンプレート（種別の提示。別画面への遷移は今後対応予定です）</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECT_DOCUMENT_TEMPLATES.map((t) => {
            const Icon = t.icon;
            return (
              <Card
                key={t.key}
                className={cn(
                  "flex flex-col shadow-sm transition-colors",
                  "border-[color:color-mix(in_srgb,var(--border)_90%,transparent)]",
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]">
                      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold leading-snug">{t.title}</CardTitle>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{t.description}</p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
