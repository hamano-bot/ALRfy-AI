"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type BannerState =
  | { kind: "none" }
  | { kind: "loading"; projectId: number }
  | { kind: "ok"; projectId: number; effectiveRole: string; source: string }
  | { kind: "error"; projectId: number; message: string; httpStatus: number };

function resolveProjectIdFromSearch(search: string): number | null {
  const params = new URLSearchParams(search);
  const fromQuery = params.get("project_id")?.trim() ?? "";
  const fromEnv = typeof process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID === "string" ? process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID.trim() : "";
  const raw = fromQuery !== "" ? fromQuery : fromEnv;
  if (raw === "" || !/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 案件単位の実効ロール（GET /portal/api/project-permission の BFF 経由）。
 * `useSearchParams` は開発時に Webpack ランタイム不整合を起こす環境があるため、
 * `window.location.search` + `usePathname` でクエリを読む。
 */
export function EffectiveProjectRoleBanner() {
  const pathname = usePathname();
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch(typeof window !== "undefined" ? window.location.search : "");
  }, [pathname]);

  const projectId = useMemo(() => resolveProjectIdFromSearch(search), [search]);
  const [state, setState] = useState<BannerState>({ kind: "none" });

  useEffect(() => {
    if (projectId === null) {
      setState({ kind: "none" });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading", projectId });

    const run = async () => {
      try {
        const response = await fetch(`/api/portal/project-permission?project_id=${encodeURIComponent(String(projectId))}`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const rawText = await response.text();
        let body: unknown = null;
        try {
          body = rawText ? JSON.parse(rawText) : {};
        } catch {
          if (!cancelled) {
            setState({
              kind: "error",
              projectId,
              message: "権限情報の応答を解析できませんでした。",
              httpStatus: response.status,
            });
          }
          return;
        }
        if (cancelled) {
          return;
        }
        const message =
          typeof body === "object" && body !== null && "message" in body && typeof (body as { message: unknown }).message === "string"
            ? (body as { message: string }).message
            : null;

        if (!response.ok) {
          const code =
            typeof body === "object" && body !== null && "code" in body && typeof (body as { code: unknown }).code === "string"
              ? (body as { code: string }).code
              : null;
          let userMessage = message ?? `権限情報の取得に失敗しました（${response.status}）。`;
          if (code === "missing_config" || response.status === 503) {
            userMessage =
              "ポータル連携の設定がありません。`project-manager/apps/web/.env.local` に PHP のオリジンを `PORTAL_API_BASE_URL`（末尾スラッシュなし）で書き、Project Web を再起動してください。例: `PORTAL_API_BASE_URL=http://127.0.0.1:8000`（README「PHP と Next の併用」参照）。";
          } else if (code === "upstream_unreachable" || response.status === 502) {
            userMessage =
              message ??
              "PHP（platform-common）に接続できません。`PORTAL_API_BASE_URL` のホスト・ポートが正しいか、先で `dev-router.ps1` 等が動いているか確認してください。";
          }
          setState({
            kind: "error",
            projectId,
            message: userMessage,
            httpStatus: response.status,
          });
          return;
        }

        const payload = body as {
          success?: boolean;
          project_id?: number;
          effective_role?: string;
          source?: string;
        };
        if (payload.success === true && typeof payload.effective_role === "string") {
          setState({
            kind: "ok",
            projectId: typeof payload.project_id === "number" ? payload.project_id : projectId,
            effectiveRole: payload.effective_role,
            source: typeof payload.source === "string" ? payload.source : "",
          });
        } else {
          setState({
            kind: "error",
            projectId,
            message: message ?? "権限情報の形式が不正です。",
            httpStatus: response.status,
          });
        }
      } catch {
        if (!cancelled) {
          setState({ kind: "error", projectId, message: "ネットワークエラーが発生しました。", httpStatus: 0 });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (projectId === null || state.kind === "none") {
    return null;
  }

  if (state.kind === "loading") {
    return (
      <div
        className="border-b border-[color:color-mix(in_srgb,var(--border)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-[clamp(12px,2vw,24px)] py-1.5 text-center text-[11px] text-[var(--muted)] md:text-xs"
        role="status"
        aria-live="polite"
      >
        案件 #{state.projectId} の実効ロールを確認しています…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="border-b border-amber-500/30 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] px-[clamp(12px,2vw,24px)] py-2 text-left text-[11px] leading-snug text-amber-100 md:text-xs"
        role="alert"
      >
        <p className="font-medium">案件 #{state.projectId} の実効ロールを表示できません</p>
        <p className="mt-1 text-[color:color-mix(in_srgb,amber_100_92%,white_8%)]">{state.message}</p>
      </div>
    );
  }

  return (
    <div
      className="border-b border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border)_65%)] bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)] px-[clamp(12px,2vw,24px)] py-1.5 text-center text-[11px] text-[var(--foreground)] md:text-xs"
      title={state.source ? `判定根拠: ${state.source}` : undefined}
    >
      案件 #{state.projectId} での実効ロール: <span className="font-semibold">{state.effectiveRole}</span>
      {state.source ? <span className="text-[var(--muted)]">（{state.source}）</span> : null}
    </div>
  );
}
