"use client";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { HEARING_TEMPLATE_LABELS, isHearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { useCallback, useEffect, useState } from "react";

type MergedUpdate = {
  id: string;
  datetime: string;
  version?: string;
  title: string;
  summary?: string;
  kind: "deploy" | "template";
  template_id?: string | null;
  template_version_before?: number | null;
  template_version_after?: number | null;
  detail?: unknown;
};

/** 自動生成タイトルに付いていた「更新：」前置きを表示から除く */
function stripUpdateLabelPrefix(title: string): string {
  return String(title ?? "")
    .trim()
    .replace(/^更新[:：]\s*/u, "")
    .trim();
}

function formatMinutesLikeDateTime(value: string): string {
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (num: number): string => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function SystemUpdatesCard() {
  const [updates, setUpdates] = useState<MergedUpdate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [active, setActive] = useState<MergedUpdate | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/system-updates", { credentials: "include" });
      const j = (await res.json()) as { success?: boolean; updates?: MergedUpdate[] };
      if (!res.ok || !j.success || !Array.isArray(j.updates)) {
        setLoadError("更新履歴を読み込めませんでした。");
        return;
      }
      setUpdates(j.updates);
    } catch {
      setLoadError("更新履歴を読み込めませんでした。");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = (item: MergedUpdate) => {
    if (item.kind !== "template") {
      return;
    }
    setActive(item);
    setDetailOpen(true);
  };

  const templateLabel = (tid: string | null | undefined): string => {
    if (!tid || !isHearingTemplateId(tid)) {
      return tid ?? "—";
    }
    return HEARING_TEMPLATE_LABELS[tid];
  };

  return (
    <>
      <Card className="backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle>システム更新履歴（更新内容はGeminiが要約して自動反映しています）</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {loadError}
            </p>
          ) : null}
          <div className="modern-scrollbar max-h-72 overflow-y-auto pr-1">
            <ul className="space-y-2">
              {updates.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-soft)_88%,black_12%)] p-3"
                >
                  <p className="text-xs text-[var(--muted)]">
                    {formatMinutesLikeDateTime(item.datetime)}
                    {item.version ? ` / ${item.version}` : ""}
                    {item.kind === "template" ? (
                      <span className="ml-1 rounded bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--foreground)]">
                        テンプレ
                      </span>
                    ) : null}
                  </p>
                  {item.kind === "template" ? (
                    <button
                      type="button"
                      className="mt-1 w-full text-left text-sm font-medium text-[color:color-mix(in_srgb,var(--accent)_88%,var(--foreground)_12%)] underline-offset-2 hover:underline"
                      onClick={() => openDetail(item)}
                    >
                      {stripUpdateLabelPrefix(item.title)}
                    </button>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                      {stripUpdateLabelPrefix(item.title)}
                    </p>
                  )}
                  {item.summary ? (
                    <p className="mt-1 text-sm text-[color:color-mix(in_srgb,var(--foreground)_88%,transparent)]">
                      {item.summary}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>テンプレート更新の詳細</DialogTitle>
          </DialogHeader>
          {active ? (
            <div className="space-y-3 text-sm text-[var(--foreground)]">
              <p>
                <span className="text-[var(--muted)]">テンプレート種別: </span>
                {templateLabel(active.template_id)}
                {active.template_id ? (
                  <span className="ml-2 font-mono text-xs text-[var(--muted)]">({active.template_id})</span>
                ) : null}
              </p>
              <p>
                <span className="text-[var(--muted)]">バージョン: </span>
                {active.template_version_before ?? "—"} → {active.template_version_after ?? "—"}
              </p>
              <div>
                <p className="text-xs font-medium text-[var(--muted)]">差分サマリ（detail）</p>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_95%,transparent)] p-3 text-xs">
                  {active.detail !== undefined && active.detail !== null
                    ? JSON.stringify(active.detail, null, 2)
                    : "—"}
                </pre>
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="default" size="sm" onClick={() => setDetailOpen(false)}>
                  閉じる
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
