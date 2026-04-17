"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type PortalApp = {
  app_key: string;
  title: string;
  route: string;
  required_role: string;
  visibility: string;
  reason: string | null;
};

type PortalAppsContextValue = {
  apps: PortalApp[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

const PortalAppsContext = createContext<PortalAppsContextValue | null>(null);

export function usePortalApps(): PortalAppsContextValue {
  const ctx = useContext(PortalAppsContext);
  if (!ctx) {
    throw new Error("usePortalApps must be used within PortalAppsProvider");
  }
  return ctx;
}

type PortalAppsProviderProps = {
  children: ReactNode;
};

export function PortalAppsProvider({ children }: PortalAppsProviderProps) {
  const [apps, setApps] = useState<PortalApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/portal/apps", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const raw = await response.text();
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        setApps([]);
        setError("アプリ一覧の応答を解析できませんでした。");
        return;
      }

      const message =
        typeof body === "object" && body !== null && "message" in body && typeof (body as { message: unknown }).message === "string"
          ? (body as { message: string }).message
          : null;

      if (!response.ok) {
        setApps([]);
        setError(message ?? `アプリ一覧の取得に失敗しました（${response.status}）。`);
        return;
      }

      const payload = body as { success?: boolean; apps?: unknown };
      if (payload.success !== true || !Array.isArray(payload.apps)) {
        setApps([]);
        setError("アプリ一覧の形式が不正です。");
        return;
      }

      const next: PortalApp[] = [];
      for (const row of payload.apps) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const r = row as Record<string, unknown>;
        const app_key = typeof r.app_key === "string" ? r.app_key : "";
        const title = typeof r.title === "string" ? r.title : "";
        const route = typeof r.route === "string" ? r.route : "";
        const required_role = typeof r.required_role === "string" ? r.required_role : "";
        const visibility = typeof r.visibility === "string" ? r.visibility : "";
        const reason = r.reason === null || typeof r.reason === "string" ? (r.reason as string | null) : null;
        if (!app_key || !title) {
          continue;
        }
        next.push({ app_key, title, route, required_role, visibility, reason });
      }
      setApps(next);
    } catch {
      setApps([]);
      setError("アプリ一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<PortalAppsContextValue>(
    () => ({
      apps,
      loading,
      error,
      refetch: load,
    }),
    [apps, loading, error, load],
  );

  return <PortalAppsContext.Provider value={value}>{children}</PortalAppsContext.Provider>;
}
