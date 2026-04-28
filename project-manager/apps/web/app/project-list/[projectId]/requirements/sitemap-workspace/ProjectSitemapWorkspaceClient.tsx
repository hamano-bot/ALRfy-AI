"use client";

import { RequirementsSitemapEditor } from "@/app/components/requirements/RequirementsSitemapEditor";
import { Button } from "@/app/components/ui/button";
import type { RequirementsDocBody } from "@/lib/requirements-doc-types";
import { requirementsDocFingerprint } from "@/lib/requirements-doc-fingerprint";
import type { RequirementsPageContentSitemap } from "@/lib/requirements-sitemap-schema";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const AUTO_SAVE_INTERVAL_MS = 120_000;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function withSaveDatesForPage(body: RequirementsDocBody, pageId: string): RequirementsDocBody {
  const d = todayIsoDate();
  return {
    ...body,
    pages: body.pages.map((p) => {
      if (p.id !== pageId) {
        return p;
      }
      return {
        ...p,
        createdOn: p.createdOn ?? d,
        updatedOn: d,
      };
    }),
  };
}

type Props = {
  projectId: number;
  canEdit: boolean;
  initialBody: RequirementsDocBody;
  targetPageId: string;
};

export function ProjectSitemapWorkspaceClient({ projectId, canEdit, initialBody, targetPageId }: Props) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [savedFingerprint, setSavedFingerprint] = useState(() => requirementsDocFingerprint(initialBody));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBody(initialBody);
    setSavedFingerprint(requirementsDocFingerprint(initialBody));
  }, [initialBody]);

  const targetPage = useMemo(() => {
    const p = body.pages.find((x) => x.id === targetPageId && !x.deleted);
    return p ?? null;
  }, [body.pages, targetPageId]);

  const currentFingerprint = useMemo(() => requirementsDocFingerprint(body), [body]);
  const isDirty = canEdit && currentFingerprint !== savedFingerprint;

  const replaceSitemapContent = useCallback(
    (nextContent: RequirementsPageContentSitemap) => {
      if (!canEdit) {
        return;
      }
      setBody((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id === targetPageId && p.inputMode === "sitemap") {
            return { ...p, content: nextContent };
          }
          return p;
        }),
      }));
    },
    [canEdit, targetPageId],
  );

  const saveBody = useCallback(
    async (next: RequirementsDocBody): Promise<boolean> => {
      if (!canEdit) {
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/portal/project-requirements", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            body_json: next,
          }),
        });
        const text = await res.text();
        let msg = "保存に失敗しました。";
        try {
          const j = JSON.parse(text) as { message?: string };
          if (typeof j.message === "string") {
            msg = j.message;
          }
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          setError(msg);
          return false;
        }
        try {
          const j = JSON.parse(text) as {
            success?: boolean;
            requirements?: { body_json?: unknown };
          };
          if (j.success && j.requirements?.body_json !== undefined && j.requirements.body_json !== null) {
            const { normalizeRequirementsDocBody } = await import("@/lib/requirements-doc-normalize");
            const normalized = normalizeRequirementsDocBody(j.requirements.body_json);
            setBody(normalized);
            setSavedFingerprint(requirementsDocFingerprint(normalized));
          }
        } catch {
          /* ignore */
        }
        router.refresh();
        return true;
      } catch {
        setError("保存に失敗しました。");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [canEdit, projectId, router],
  );

  const performSave = useCallback(async () => {
    return saveBody(withSaveDatesForPage(body, targetPageId));
  }, [body, saveBody, targetPageId]);

  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;
  const isDirtyRef = useRef(isDirty);
  const savingRef = useRef(saving);
  isDirtyRef.current = isDirty;
  savingRef.current = saving;

  useEffect(() => {
    if (!isDirty || !canEdit) {
      return;
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, canEdit]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }
    const id = window.setInterval(() => {
      if (!isDirtyRef.current || savingRef.current) {
        return;
      }
      void performSaveRef.current();
    }, AUTO_SAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [canEdit]);

  if (!targetPage) {
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="alert">
        <p className="text-sm text-[var(--foreground)]">指定したページが見つからないか、削除されています。</p>
        <Button asChild variant="default" size="sm" className="mt-3">
          <Link href={`/project-list/${projectId}/requirements`}>要件定義に戻る</Link>
        </Button>
      </section>
    );
  }

  if (targetPage.inputMode !== "sitemap") {
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="alert">
        <p className="text-sm text-[var(--foreground)]">このページはサイトマップではありません。</p>
        <Button asChild variant="default" size="sm" className="mt-3">
          <Link href={`/project-list/${projectId}/requirements`}>要件定義に戻る</Link>
        </Button>
      </section>
    );
  }

  const sitemapContent = targetPage.content;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {error ? (
        <p
          className="pointer-events-auto fixed bottom-3 left-1/2 z-[90] max-w-[min(90vw,28rem)] -translate-x-1/2 rounded-lg border border-red-500/40 bg-[color:color-mix(in_srgb,var(--surface)_94%,red_6%)] px-3 py-2 text-center text-xs text-red-700 shadow-lg dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="pointer-events-none absolute right-3 top-3 z-[70] rounded-md bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] px-2 py-1 text-[11px] text-[var(--muted)]">
          閲覧のみ
        </p>
      ) : null}

      <RequirementsSitemapEditor
        editorLayout="workspace"
        workspaceBackHref={`/project-list/${projectId}/requirements`}
        onWorkspaceSave={() => void performSave()}
        workspaceSaveDisabled={!canEdit || saving || !isDirty}
        workspaceSaving={saving}
        content={sitemapContent}
        readOnly={!canEdit}
        onChange={replaceSitemapContent}
      />
    </div>
  );
}
