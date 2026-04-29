"use client";

import { ProjectCreateForm } from "@/app/project-list/new/ProjectCreateForm";
import { ProjectRedmineTicketsCard } from "./ProjectRedmineTicketsCard";
import { accentButtonSurfaceBaseClassName, Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { displayText } from "@/lib/empty-display";
import { formatDateDisplayYmd } from "@/lib/format-date-display";
import { PROJECT_DOCUMENT_TEMPLATES } from "@/lib/project-document-templates";
import { formatProjectCategoryLabelJa, formatSiteTypeLabel } from "@/lib/portal-my-projects";
import { buildRedmineProjectUrl } from "@/lib/redmine-url";
import { getParticipantViewLine, type PortalProjectDetail } from "@/lib/portal-project";
import { projectPageLgMainSidebarGridClassName } from "@/lib/project-page-layout";
import { PROJECT_ROLE_LABEL_JA } from "@/lib/project-role-labels";
import { UNSAVED_LEAVE_CONFIRM_MESSAGE } from "@/lib/unsaved-navigation";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/app/components/ui/hover-card";
import { Eye, Loader2, PlusCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type ProjectDetailClientProps = {
  projectId: number;
  initialProject: PortalProjectDetail;
  canEdit: boolean;
  canDeleteProject: boolean;
};

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="text-sm leading-relaxed text-[var(--foreground)]">{children}</div>
    </div>
  );
}

const projectDetailHoverExportHtmlCache = new Map<number, string>();
const HOVER_PREVIEW_DOC_WIDTH_PX = 794;

function ProjectEstimatePreviewHoverCard({ estimateId, children }: { estimateId: number; children: ReactNode }) {
  const openRef = useRef(false);
  const fetchGenRef = useRef(0);
  const [panel, setPanel] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const handleOpenChange = (open: boolean) => {
    openRef.current = open;
    if (!open) {
      fetchGenRef.current += 1;
      return;
    }
    const cached = projectDetailHoverExportHtmlCache.get(estimateId);
    if (cached) {
      setPanel("ready");
      return;
    }
    setPanel("loading");
    const gen = fetchGenRef.current;
    void (async () => {
      try {
        const res = await fetch("/api/portal/estimate-export-html", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estimate_id: estimateId }),
        });
        const data = (await res.json()) as { success?: boolean; html?: string };
        if (!openRef.current || gen !== fetchGenRef.current) {
          return;
        }
        if (!res.ok || !data.success || typeof data.html !== "string" || data.html.trim() === "") {
          setPanel("error");
          return;
        }
        projectDetailHoverExportHtmlCache.set(estimateId, data.html);
        setPanel("ready");
      } catch {
        if (!openRef.current || gen !== fetchGenRef.current) {
          return;
        }
        setPanel("error");
      }
    })();
  };

  const html = projectDetailHoverExportHtmlCache.get(estimateId);

  return (
    <HoverCard openDelay={180} closeDelay={140} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="left"
        align="start"
        sideOffset={12}
        className={cn(
          "w-[min(96vw,780px)] max-w-[780px] overflow-hidden p-0",
          "rounded-2xl border border-[color:color-mix(in_srgb,var(--border)_78%,transparent)]",
          "bg-[var(--surface)] shadow-[0_24px_64px_rgba(0,0,0,0.42)] ring-1 ring-[color:color-mix(in_srgb,var(--accent)_18%,transparent)]",
        )}
      >
        <div className="h-1 w-full bg-[color:color-mix(in_srgb,var(--accent)_65%,var(--foreground)_35%)]" aria-hidden />
        <div className="flex items-center justify-between gap-2 border-b border-[color:color-mix(in_srgb,var(--border)_72%,transparent)] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Eye className="h-4 w-4 shrink-0 text-[color:color-mix(in_srgb,var(--accent)_80%,var(--muted)_20%)]" aria-hidden />
            <span className="truncate text-sm font-semibold tracking-tight text-[var(--foreground)]">見積プレビュー</span>
          </div>
          <span className="shrink-0 text-xs text-[var(--muted)]">クリックで別タブ</span>
        </div>
        {panel === "loading" || (panel === "idle" && !html) ? (
          <div className="modern-scrollbar flex h-[min(72vh,540px)] flex-col items-center justify-center gap-3 bg-[color:color-mix(in_srgb,var(--background)_55%,var(--surface)_45%)]">
            <Loader2 className="h-8 w-8 shrink-0 animate-spin text-[color:color-mix(in_srgb,var(--accent)_55%,var(--muted)_45%)]" aria-hidden />
            <p className="text-sm text-[var(--muted)]">レイアウトを読み込んでいます…</p>
          </div>
        ) : null}
        {panel === "error" ? (
          <div className="flex h-[min(72vh,540px)] flex-col items-center justify-center gap-2 bg-[color:color-mix(in_srgb,var(--background)_40%,var(--surface)_60%)] px-6 text-center">
            <p className="text-sm text-[var(--muted)]">プレビューを表示できませんでした。</p>
            <p className="text-xs text-[var(--muted)]">別タブのフルプレビューをお試しください。</p>
          </div>
        ) : null}
        {panel === "ready" && html ? (
          <div className="modern-scrollbar h-[min(72vh,540px)] overflow-auto bg-[color:color-mix(in_srgb,#94a3b8_14%,var(--background)_86%)]">
            <div className="flex justify-center p-3 sm:p-5">
              <div
                className="shrink-0 rounded-xl bg-white shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-[color:color-mix(in_srgb,var(--border)_55%,transparent)]"
                style={{ width: HOVER_PREVIEW_DOC_WIDTH_PX }}
              >
                <iframe
                  title={`estimate-hover-preview-${estimateId}`}
                  srcDoc={html}
                  sandbox=""
                  className="block w-full rounded-xl border-0 bg-white"
                  style={{ width: HOVER_PREVIEW_DOC_WIDTH_PX, height: "min(66vh, 520px)" }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

export function ProjectDetailClient({ projectId, initialProject, canEdit, canDeleteProject }: ProjectDetailClientProps) {
  type EstimateSummary = {
    id: number;
    estimate_number: string;
    title: string;
    estimate_status: string;
    client_name?: string | null;
    issue_date?: string | null;
    sales_user_label?: string | null;
    total_including_tax?: number | null;
    effective_role?: string;
  };

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [editFormDirty, setEditFormDirty] = useState(false);
  const [project, setProject] = useState<PortalProjectDetail>(initialProject);
  const [linkedEstimates, setLinkedEstimates] = useState<EstimateSummary[]>([]);
  const [isEstimateLinkModalOpen, setIsEstimateLinkModalOpen] = useState(false);
  const [allEstimates, setAllEstimates] = useState<EstimateSummary[]>([]);
  const [selectedEstimateIds, setSelectedEstimateIds] = useState<number[]>([]);
  const [estimateClientFilter, setEstimateClientFilter] = useState("");
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject]);

  useEffect(() => {
    const loadRelations = async () => {
      try {
        const estRes = await fetch(`/api/portal/project-estimates?project_id=${projectId}`, { credentials: "include", cache: "no-store" });
        if (estRes.ok) {
          const estimateData = (await estRes.json()) as {
            success?: boolean;
            estimates?: EstimateSummary[];
          };
          if (estimateData.success && Array.isArray(estimateData.estimates)) {
            setLinkedEstimates(estimateData.estimates);
          }
        }
      } catch {
        // ignore
      }
    };
    void loadRelations();
  }, [projectId]);

  const setEditModeQuery = useCallback(
    (nextEdit: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextEdit) {
        params.set("mode", "edit");
      } else if (params.get("mode") === "edit") {
        params.delete("mode");
      }
      const qs = params.toString();
      router.replace(qs === "" ? pathname : `${pathname}?${qs}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const urlEditing = searchParams.get("mode") === "edit";
    if (canEdit && urlEditing) {
      setEditing(true);
      return;
    }
    if (!urlEditing) {
      setEditing(false);
      setEditFormDirty(false);
    }
  }, [canEdit, searchParams]);

  useEffect(() => {
    if (!editing || !editFormDirty || !canEdit) {
      return;
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editing, editFormDirty, canEdit]);

  const leaveEditMode = useCallback(() => {
    setEditFormDirty(false);
    setEditing(false);
    setEditModeQuery(false);
  }, [setEditModeQuery]);

  const onBackToViewClick = useCallback(() => {
    if (editFormDirty) {
      setLeaveConfirmOpen(true);
      return;
    }
    leaveEditMode();
  }, [editFormDirty, leaveEditMode]);

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
          <Button type="button" variant="default" size="sm" className="shrink-0" onClick={onBackToViewClick}>
            閲覧に戻る
          </Button>
        </div>
        <ProjectCreateForm
          mode="edit"
          editProjectId={projectId}
          initialDetail={project}
          canDeleteProject={canDeleteProject}
          onEditDirtyChange={setEditFormDirty}
          onEditCancel={leaveEditMode}
          onEditSaved={(savedProject) => {
            setProject(savedProject);
            leaveEditMode();
            router.refresh();
          }}
        />
        <Dialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>未保存の変更があります</DialogTitle>
              <DialogDescription>{UNSAVED_LEAVE_CONFIRM_MESSAGE}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="default" size="sm" onClick={() => setLeaveConfirmOpen(false)}>
                キャンセル
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setLeaveConfirmOpen(false);
                  leaveEditMode();
                }}
              >
                破棄して戻る
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
            onClick={() => {
              setEditing(true);
              setEditModeQuery(true);
            }}
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
        <div className="grid gap-6 sm:grid-cols-5 sm:items-stretch lg:gap-8">
          <div className="h-full">
            <ReadOnlyField label="サイト種別">{formatSiteTypeLabel(project.site_type, project.site_type_other)}</ReadOnlyField>
          </div>
          <div className="h-full">
            <ReadOnlyField label="区分">
              <>
                <p className="text-sm leading-relaxed text-[var(--foreground)]">{formatProjectCategoryLabelJa(project.project_category)}</p>
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
          <div className="h-full">
            <ReadOnlyField label="キックオフ日">{formatDateDisplayYmd(project.kickoff_date)}</ReadOnlyField>
          </div>
          <div className="h-full">
            <ReadOnlyField label="リリース予定日">{formatDateDisplayYmd(project.release_due_date)}</ReadOnlyField>
          </div>
          <div className="h-full">
            <ReadOnlyField label="リリース済み">{project.is_released ? "はい" : "いいえ"}</ReadOnlyField>
          </div>
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
        const internalDocumentHref =
          t.key === "hearing"
            ? `/project-list/${projectId}/hearing`
            : t.key === "requirements"
              ? `/project-list/${projectId}/requirements`
              : null;
        const externalOpen = Boolean(t.href && t.href.trim() !== "");
        const internalOpen = Boolean(internalDocumentHref);
        const open = internalOpen || externalOpen;
        const cardSurfaceClass = cn(
          "rounded-2xl border shadow-sm transition-colors",
          "border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_95%,black_5%)]",
          open &&
            "border-[color:color-mix(in_srgb,var(--accent)_42%,var(--border)_58%)] bg-[color:color-mix(in_srgb,var(--accent)_11%,var(--surface)_89%)]",
        );
        const focusRingClass =
          "outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]";
        const inner = (
          <>
            <span
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_12px_rgba(15,23,42,0.32)] motion-safe:transition motion-safe:duration-200",
                accentButtonSurfaceBaseClassName,
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-[var(--foreground)]">{t.title}</p>
            </div>
            {!open ? (
              <span
                className="shrink-0 self-center rounded-md border border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] px-2.5 py-1 text-xs text-[var(--muted)]"
                title="連携先の画面は準備中です"
              >
                準備中
              </span>
            ) : null}
          </>
        );
        return (
          <li key={t.key}>
            {internalOpen ? (
              <Link
                href={internalDocumentHref!}
                prefetch
                className={cn(
                  cardSurfaceClass,
                  focusRingClass,
                  "flex cursor-pointer items-start gap-3 p-4 no-underline sm:items-center",
                  "motion-safe:transition motion-safe:hover:border-[color:color-mix(in_srgb,var(--accent)_55%,var(--border)_45%)]",
                )}
              >
                {inner}
              </Link>
            ) : open ? (
              <a
                href={t.href}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  cardSurfaceClass,
                  focusRingClass,
                  "flex cursor-pointer items-start gap-3 p-4 no-underline sm:items-center",
                  "motion-safe:transition motion-safe:hover:border-[color:color-mix(in_srgb,var(--accent)_55%,var(--border)_45%)]",
                )}
              >
                {inner}
              </a>
            ) : (
              <Card className={cn(cardSurfaceClass, "cursor-default")}>
                <CardContent className="flex items-start gap-3 p-4 sm:items-center">{inner}</CardContent>
              </Card>
            )}
          </li>
        );
      })}
    </ul>
  );

  const openEstimateLinkModal = async () => {
    try {
      const res = await fetch("/api/portal/estimates", { credentials: "include", cache: "no-store" });
      const data = (await res.json()) as {
        success?: boolean;
        estimates?: EstimateSummary[];
      };
      if (!res.ok || !data.success || !Array.isArray(data.estimates)) {
        return;
      }
      setAllEstimates(data.estimates);
      setSelectedEstimateIds(linkedEstimates.map((estimate) => estimate.id));
      setEstimateClientFilter((project.client_name ?? "").trim());
      setIsEstimateLinkModalOpen(true);
    } catch {
      // ignore
    }
  };

  const saveProjectEstimateLinks = async () => {
    await fetch("/api/portal/project-estimates", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        estimate_ids: selectedEstimateIds,
      }),
    });
    try {
      const res = await fetch(`/api/portal/project-estimates?project_id=${projectId}`, { credentials: "include", cache: "no-store" });
      const data = (await res.json()) as {
        success?: boolean;
        estimates?: EstimateSummary[];
      };
      if (res.ok && data.success && Array.isArray(data.estimates)) {
        setLinkedEstimates(data.estimates);
      }
    } catch {
      // ignore
    }
    setIsEstimateLinkModalOpen(false);
  };

  const unlinkSingleEstimate = async (estimateId: number) => {
    const nextEstimateIds = linkedEstimates.filter((estimate) => estimate.id !== estimateId).map((estimate) => estimate.id);
    await fetch("/api/portal/project-estimates", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        estimate_ids: nextEstimateIds,
      }),
    });
    setLinkedEstimates((prev) => prev.filter((estimate) => estimate.id !== estimateId));
  };

  const normalizedProjectClientName = (project.client_name ?? "").trim().toLowerCase();
  const normalizedClientFilter = estimateClientFilter.trim().toLowerCase();
  const estimateCandidates = [...allEstimates]
    .filter((estimate) => {
      if (normalizedClientFilter === "") {
        return true;
      }
      return (estimate.client_name ?? "").toLowerCase().includes(normalizedClientFilter);
    })
    .sort((a, b) => {
      const aClient = (a.client_name ?? "").trim().toLowerCase();
      const bClient = (b.client_name ?? "").trim().toLowerCase();
      const aMatched = normalizedProjectClientName !== "" && aClient === normalizedProjectClientName;
      const bMatched = normalizedProjectClientName !== "" && bClient === normalizedProjectClientName;
      if (aMatched !== bMatched) {
        return aMatched ? -1 : 1;
      }
      return a.id - b.id;
    });

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
          <div className="space-y-4">
            <Card className="overflow-hidden shadow-sm">
              <h2 id="project-detail-docs-heading" className="sr-only">
                ドキュメント
              </h2>
              <CardContent className="p-4 sm:p-5">{documentList}</CardContent>
            </Card>

            <Card className="overflow-hidden shadow-sm">
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">関連見積</h3>
                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="default" size="sm" onClick={() => void openEstimateLinkModal()} className="gap-1.5">
                        追加する
                        <PlusCircle className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {linkedEstimates.map((estimate) => (
                    <div
                      key={`project-estimate-${estimate.id}`}
                      className="relative rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] p-3"
                    >
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-2 h-6 w-6 shrink-0 p-0"
                          onClick={() => void unlinkSingleEstimate(estimate.id)}
                          title="関連見積の紐づきを解除"
                          aria-label="関連見積の紐づきを解除"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </Button>
                      ) : null}
                      <div className="space-y-1 pr-8">
                        <p className="line-clamp-2 text-sm font-semibold text-[var(--foreground)]">{displayText(estimate.title)}</p>
                        <p className="text-xs text-[var(--muted)]">{displayText(estimate.client_name)}</p>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <ProjectEstimatePreviewHoverCard estimateId={estimate.id}>
                          <a
                            href={`/estimates/${estimate.id}/preview`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] text-[color:color-mix(in_srgb,var(--muted)_90%,var(--foreground)_10%)] transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)] hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)] hover:text-[var(--accent)]"
                            title="ホバーで一覧用プレビュー、クリックで別タブのフルプレビュー"
                            aria-label="見積プレビュー（別タブで開く）"
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </a>
                        </ProjectEstimatePreviewHoverCard>
                        <Button asChild type="button" variant="default" size="sm" className="h-8 rounded-md">
                          <Link href={`/estimates/${estimate.id}`}>詳細へ</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                  {linkedEstimates.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] px-3 py-5 text-center text-sm text-[var(--muted)]">
                      関連見積はありません。
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      <Dialog open={isEstimateLinkModalOpen} onOpenChange={setIsEstimateLinkModalOpen}>
        <DialogContent aria-label="関連見積を追加する" className="w-[min(96vw,1180px)] max-w-[1180px]">
          <DialogHeader>
            <DialogTitle>関連見積を追加する</DialogTitle>
            <DialogDescription>クライアント名で絞り込みしながら、案件に紐づける見積を選択できます。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <label htmlFor="estimate-client-filter" className="text-xs font-medium text-[var(--muted)]">
                クライアント名で絞り込み
              </label>
              <input
                id="estimate-client-filter"
                type="text"
                value={estimateClientFilter}
                onChange={(e) => setEstimateClientFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] px-3 text-sm outline-none ring-0 transition-colors placeholder:text-[color:color-mix(in_srgb,var(--muted)_78%,transparent)] focus:border-[color:color-mix(in_srgb,var(--accent)_55%,var(--border)_45%)]"
                placeholder="クライアント名を入力"
              />
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
              <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="pm-table-head text-left">
                  <th className="px-2 py-1">選択</th>
                  <th className="px-2 py-1">見積番号</th>
                  <th className="px-2 py-1">件名</th>
                  <th className="px-2 py-1">顧客名</th>
                  <th className="px-2 py-1">担当営業</th>
                  <th className="px-2 py-1">発行日</th>
                  <th className="px-2 py-1 text-right">税込合計</th>
                </tr>
              </thead>
              <tbody>
                {estimateCandidates.map((estimate) => {
                  const checked = selectedEstimateIds.includes(estimate.id);
                  return (
                    <tr key={`estimate-link-candidate-${estimate.id}`} className="border-b border-[var(--border)]">
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedEstimateIds((prev) =>
                              e.target.checked ? [...prev, estimate.id] : prev.filter((id) => id !== estimate.id),
                            );
                          }}
                        />
                      </td>
                      <td className="px-2 py-1">{estimate.estimate_number}</td>
                      <td className="px-2 py-1">{estimate.title}</td>
                      <td className="px-2 py-1">{displayText(estimate.client_name)}</td>
                      <td className="px-2 py-1">{displayText(estimate.sales_user_label)}</td>
                      <td className="px-2 py-1">{String(estimate.issue_date ?? "").slice(0, 10)}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">
                        {Number(estimate.total_including_tax ?? 0).toLocaleString("ja-JP")}
                      </td>
                    </tr>
                  );
                })}
                {estimateCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-[var(--muted)]">
                      条件に一致する見積がありません。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => setIsEstimateLinkModalOpen(false)}>
              キャンセル
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={() => void saveProjectEstimateLinks()}>
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
