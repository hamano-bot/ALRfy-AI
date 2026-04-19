"use client";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { GeminiMarkIcon } from "./GeminiMarkIcon";
import {
  hearingRedmineDescription,
  hearingRedmineDueForApi,
  hearingRedmineFallbackSubject,
  matchesRedmineSearchTokens,
  tokenizeAndSearch,
} from "@/lib/hearing-redmine-ui";
import type { HearingRowRedmineTicket, HearingSheetRow } from "@/lib/hearing-sheet-types";
import type { PortalProjectDetail } from "@/lib/portal-project";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type SuggestProject = {
  id: number;
  name: string;
  identifier: string;
  redmine_base_url: string;
};

type MergedProject = SuggestProject & { pinned: boolean };

function highlightText(text: string, tokens: string[]): ReactNode {
  if (tokens.length === 0) {
    return text;
  }
  const escaped = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter((x) => x !== "");
  if (escaped.length === 0) {
    return text;
  }
  try {
    const re = new RegExp(`(${escaped.join("|")})`, "giu");
    const parts = text.split(re);
    return parts.map((part, i) => {
      const hit = tokens.some((t) => t !== "" && part.toLowerCase() === t.toLowerCase());
      return hit ? (
        <mark
          key={`${i}-${part}`}
          className="rounded bg-amber-200/80 px-0.5 text-[var(--foreground)] dark:bg-amber-900/50"
        >
          {part}
        </mark>
      ) : (
        <span key={`${i}-${part}`}>{part}</span>
      );
    });
  } catch {
    return text;
  }
}

type HearingRedmineIssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: PortalProjectDetail;
  row: HearingSheetRow | null;
  canEdit: boolean;
  /** ヒアリングシートへの保存に成功したら true */
  onIssueCreated: (rowId: string, ticket: HearingRowRedmineTicket) => Promise<boolean>;
};

export function HearingRedmineIssueDialog({
  open,
  onOpenChange,
  project,
  row,
  canEdit,
  onIssueCreated,
}: HearingRedmineIssueDialogProps) {
  const [redmineConfigured, setRedmineConfigured] = useState(false);
  const [userRedmineBase, setUserRedmineBase] = useState<string | null>(null);
  const [selected, setSelected] = useState<MergedProject | null>(null);
  const [q, setQ] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);
  const [apiItems, setApiItems] = useState<SuggestProject[]>([]);
  const [subject, setSubject] = useState("");
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiErr, setGeminiErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const links = project.redmine_links;

  const pinnedCandidates: MergedProject[] = useMemo(() => {
    const baseFallback = userRedmineBase?.trim() || "";
    return links.map((l) => ({
      id: l.redmine_project_id,
      name: l.redmine_project_name?.trim() || `プロジェクト #${l.redmine_project_id}`,
      identifier: String(l.redmine_project_id),
      redmine_base_url: (l.redmine_base_url?.trim() || baseFallback).replace(/\/+$/, ""),
      pinned: true,
    }));
  }, [links, userRedmineBase]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/portal/me", { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as {
          redmine?: { configured?: boolean; base_url?: string | null };
        };
        if (cancelled) {
          return;
        }
        setRedmineConfigured(!!data.redmine?.configured);
        const b = data.redmine?.base_url;
        setUserRedmineBase(typeof b === "string" && b.trim() !== "" ? b.trim().replace(/\/+$/, "") : null);
      } catch {
        if (!cancelled) {
          setRedmineConfigured(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !row) {
      return;
    }
    setSubmitErr(null);
    setGeminiErr(null);
    setListErr(null);
    setQ("");
    setSubject(hearingRedmineFallbackSubject(row));
    const first = pinnedCandidates[0];
    setSelected(first ?? null);
    setListOpen(false);
  }, [open, row, pinnedCandidates]);

  const fetchSuggest = useCallback(
    async (query: string) => {
      if (!redmineConfigured) {
        return;
      }
      setLoading(true);
      setListErr(null);
      try {
        const u = new URL("/api/portal/redmine-project-suggest", window.location.origin);
        u.searchParams.set("q", query);
        const res = await fetch(u.toString(), { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as { success?: boolean; projects?: SuggestProject[]; message?: string };
        if (!res.ok || !data.success) {
          setListErr(data.message ?? `取得に失敗しました（${res.status}）`);
          setApiItems([]);
          return;
        }
        setApiItems(Array.isArray(data.projects) ? data.projects : []);
      } catch {
        setListErr("接続に失敗しました。");
        setApiItems([]);
      } finally {
        setLoading(false);
      }
    },
    [redmineConfigured],
  );

  const scheduleFetchSuggest = useCallback(
    (query: string) => {
      if (!redmineConfigured) {
        return;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        void fetchSuggest(query);
      }, 280);
    },
    [redmineConfigured, fetchSuggest],
  );

  useEffect(() => {
    if (!open && debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setListOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const tokens = useMemo(() => tokenizeAndSearch(q), [q]);

  const mergedList: MergedProject[] = useMemo(() => {
    const seen = new Set<number>();
    const out: MergedProject[] = [];
    for (const p of pinnedCandidates) {
      const hay = `${p.name} ${p.identifier}`;
      if (!matchesRedmineSearchTokens(hay, tokens)) {
        continue;
      }
      seen.add(p.id);
      out.push(p);
    }
    for (const p of apiItems) {
      if (seen.has(p.id)) {
        continue;
      }
      const hay = `${p.name} ${p.identifier}`;
      if (!matchesRedmineSearchTokens(hay, tokens)) {
        continue;
      }
      out.push({ ...p, pinned: false });
    }
    return out;
  }, [pinnedCandidates, apiItems, tokens]);

  const hearingPageUrl =
    typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";

  const previewText = useMemo(() => {
    if (!row) {
      return "";
    }
    return hearingRedmineDescription(row, hearingPageUrl);
  }, [row, hearingPageUrl]);

  const runGeminiSubject = useCallback(async () => {
    if (!row) {
      return;
    }
    setGeminiLoading(true);
    setGeminiErr(null);
    try {
      const res = await fetch("/api/hearing-sheet/redmine-subject", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          project: {
            name: project.name,
            client_name: project.client_name,
            site_type: project.site_type,
            site_type_other: project.site_type_other,
            is_renewal: project.is_renewal,
            kickoff_date: project.kickoff_date,
            release_due_date: project.release_due_date,
            renewal_urls: project.renewal_urls,
          },
          row: {
            category: row.category,
            heading: row.heading,
            question: row.question,
            answer: row.answer,
            assignee: row.assignee,
            due: row.due,
            row_status: row.row_status,
          },
        }),
      });
      const data = (await res.json()) as { success?: boolean; subject?: string; message?: string };
      if (!res.ok || !data.success || typeof data.subject !== "string") {
        setGeminiErr(data.message ?? "題名の生成に失敗しました。");
        return;
      }
      setSubject(data.subject.trim().slice(0, 255));
    } catch {
      setGeminiErr("題名の生成に失敗しました。");
    } finally {
      setGeminiLoading(false);
    }
  }, [row, project]);

  const submit = useCallback(async () => {
    if (!row || !selected) {
      return;
    }
    const sub = subject.trim();
    if (sub === "") {
      setSubmitErr("題名を入力してください。");
      return;
    }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const description = hearingRedmineDescription(row, hearingPageUrl);
      const due = hearingRedmineDueForApi(row);
      const res = await fetch("/api/portal/project-redmine-issue-create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          redmine_project_id: selected.id,
          subject: sub.slice(0, 255),
          description,
          ...(due ? { due_date: due } : {}),
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        issue?: { id?: number; issue_url?: string | null };
        redmine_base_url_used?: string;
      };
      if (!res.ok || !data.success || !data.issue?.id) {
        setSubmitErr(data.message ?? "チケットの作成に失敗しました。");
        return;
      }
      const issueId = data.issue.id;
      const baseUsed = (data.redmine_base_url_used ?? selected.redmine_base_url ?? "").trim().replace(/\/+$/, "");
      const ticket: HearingRowRedmineTicket = {
        issue_id: issueId,
        project_id: selected.id,
        base_url: baseUsed.includes("://") ? baseUsed : null,
      };
      const saved = await onIssueCreated(row.id, ticket);
      if (!saved) {
        setSubmitErr("ヒアリングシートへの保存に失敗しました。チケットは作成済みです。");
        return;
      }
      const openedUrl = data.issue.issue_url?.trim() ?? "";
      if (openedUrl !== "") {
        window.open(openedUrl, "_blank", "noopener,noreferrer");
      }
      onOpenChange(false);
    } catch {
      setSubmitErr("チケットの作成に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }, [row, selected, subject, project, hearingPageUrl, onIssueCreated, onOpenChange]);

  const disabledReason = useMemo(() => {
    if (!canEdit) {
      return "閲覧のみのため利用できません。";
    }
    if (links.length === 0) {
      return "案件に Redmine プロジェクトが紐づいていません。";
    }
    if (!redmineConfigured) {
      return "ヘッダーの設定で Redmine の URL と API キーを登録してください。";
    }
    return null;
  }, [canEdit, links.length, redmineConfigured]);

  const inputDisabled = !!disabledReason;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(92vh,720px)] min-h-0 w-[min(96vw,52rem)] max-w-[min(96vw,52rem)] flex-col overflow-hidden gap-0 p-4 sm:p-5",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Redmine にチケットを作成</DialogTitle>
        </DialogHeader>

        <>
            <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden text-sm">
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-5 lg:gap-y-3">
                <div className="flex min-h-0 max-h-[min(42vh,22rem)] flex-col gap-3 overflow-y-auto px-1 lg:max-h-none lg:min-h-0 lg:overflow-y-auto">
                  {disabledReason ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">{disabledReason}</p>
                  ) : null}

                  <div ref={wrapRef} className="relative space-y-1.5 px-0.5">
                    <Label htmlFor="hearing-redmine-project-q">作成先 Redmine プロジェクト</Label>
                    <Input
                      id="hearing-redmine-project-q"
                      name="hearing-redmine-project-q"
                      type="text"
                      disabled={inputDisabled}
                      placeholder="プロジェクト名・ID で検索（スペース=AND）"
                      className="ring-offset-2 ring-offset-[color-mix(in_srgb,var(--background)_94%,black_6%)]"
                      value={selected ? `${selected.name} (${selected.identifier})` : q}
                      onChange={(e) => {
                        const v = e.target.value;
                        setQ(v);
                        setSelected(null);
                        setListOpen(true);
                        scheduleFetchSuggest(v);
                      }}
                      onFocus={() => {
                        setListOpen(true);
                        void fetchSuggest(selected ? "" : q);
                      }}
                    />
                    {listOpen && !inputDisabled ? (
                      <div
                        className={cn(
                          "absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)] shadow-lg",
                          "pm-scrollbar-themed",
                        )}
                      >
                        {loading ? (
                          <p className="px-3 py-2 text-xs text-[var(--muted)]">読み込み中…</p>
                        ) : mergedList.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-[var(--muted)]">候補がありません</p>
                        ) : (
                          <>
                            {pinnedCandidates.some((p) => mergedList.some((m) => m.id === p.id && m.pinned)) ? (
                              <p className="border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                                案件に紐づくプロジェクト
                              </p>
                            ) : null}
                            {mergedList
                              .filter((m) => m.pinned)
                              .map((p) => (
                                <button
                                  key={`p-${p.id}`}
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setSelected(p);
                                    setQ("");
                                    setListOpen(false);
                                  }}
                                >
                                  {highlightText(p.name, tokens)}{" "}
                                  <span className="text-[var(--muted)]">
                                    ({highlightText(p.identifier, tokens)})
                                  </span>
                                </button>
                              ))}
                            {mergedList.some((m) => !m.pinned) ? (
                              <p className="border-b border-t border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                                その他
                              </p>
                            ) : null}
                            {mergedList
                              .filter((m) => !m.pinned)
                              .map((p) => (
                                <button
                                  key={`o-${p.id}`}
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setSelected({ ...p, pinned: false });
                                    setQ("");
                                    setListOpen(false);
                                  }}
                                >
                                  {highlightText(p.name, tokens)}{" "}
                                  <span className="text-[var(--muted)]">
                                    ({highlightText(p.identifier, tokens)})
                                  </span>
                                </button>
                              ))}
                          </>
                        )}
                      </div>
                    ) : null}
                    {listErr ? <p className="text-xs text-red-500">{listErr}</p> : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="hearing-redmine-subject">題名</Label>
                    <Input
                      id="hearing-redmine-subject"
                      name="hearing-redmine-subject"
                      type="text"
                      disabled={inputDisabled}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value.slice(0, 255))}
                      maxLength={255}
                    />
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="inline-flex items-center gap-1.5"
                      disabled={inputDisabled || geminiLoading}
                      onClick={() => void runGeminiSubject()}
                    >
                      <GeminiMarkIcon className="h-4 w-4 shrink-0" />
                      {geminiLoading ? "生成中…" : "Gemini で題名を生成"}
                    </Button>
                    {geminiErr ? <p className="text-xs text-red-500">{geminiErr}</p> : null}
                  </div>

                  {submitErr ? <p className="text-xs text-red-500">{submitErr}</p> : null}
                </div>

                <div className="flex min-h-[min(36vh,18rem)] flex-col gap-1.5 lg:h-full lg:min-h-0">
                  <p className="shrink-0 text-xs font-medium text-[var(--muted)]">本文プレビュー</p>
                  <div
                    className={cn(
                      "min-h-[12rem] flex-1 overflow-y-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]",
                      "bg-[var(--edit-mode-surface)] p-3 text-xs leading-relaxed whitespace-pre-wrap text-[var(--foreground)] sm:text-sm",
                      "lg:min-h-0",
                    )}
                  >
                    {previewText === "" ? (
                      <span className="text-[var(--muted)]">（入力がある項目のみ表示されます）</span>
                    ) : (
                      previewText
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] pt-3">
              <Button type="button" variant="default" size="sm" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={inputDisabled || submitting || !selected || !row}
                onClick={() => void submit()}
              >
                {submitting ? "作成中…" : "チケットを作成"}
              </Button>
            </div>
          </>
      </DialogContent>
    </Dialog>
  );
}
