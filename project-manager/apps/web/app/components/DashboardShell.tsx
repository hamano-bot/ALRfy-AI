"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

type DashboardShellProps = {
  children: ReactNode;
};

const navItems = [
  { href: "/", label: "ダッシュボード", icon: "▦" },
  { href: "/project-manager", label: "案件管理", icon: "⌘" },
] as const;

const AI_OPEN_STORAGE_KEY = "alrfy-ai-chat-open";
const THEME_STORAGE_KEY = "alrfy-theme";
const supportedThemes = new Set(["default", "dark", "ocean", "violet", "system"]);

const dummyMessages = [
  { id: "m1", role: "AI", text: "こんにちは。何を整理しますか？（ダミー表示）" },
  { id: "m2", role: "You", text: "最新の案件状況をまとめてください。" },
  { id: "m3", role: "AI", text: "ここに要約結果が表示されます。（未実装）" },
] as const;

function clampLoginName(value: string): string {
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 16)}...`;
}

type ThemeName = "default" | "dark" | "ocean" | "violet";

function normalizeTheme(theme: string | null | undefined): ThemeName {
  if (!theme) {
    return "default";
  }
  if (theme === "system") {
    return "default";
  }
  return supportedThemes.has(theme) ? (theme as ThemeName) : "default";
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/" || pathname === "";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("default");
  const [rawLoginName, setRawLoginName] = useState("minutes-user-demo-account@example.com");
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  const loginDisplayName = useMemo(() => clampLoginName(rawLoginName), [rawLoginName]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const syncDesktop = () => setIsDesktop(media.matches);
    syncDesktop();
    media.addEventListener("change", syncDesktop);
    return () => media.removeEventListener("change", syncDesktop);
  }, []);

  useEffect(() => {
    const rawValue = window.sessionStorage.getItem(AI_OPEN_STORAGE_KEY);
    setIsAiOpen(rawValue === "1");
  }, []);

  useEffect(() => {
    const savedTheme = normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    setTheme(savedTheme);

    const controller = new AbortController();
    const fetchProfile = async () => {
      try {
        const response = await fetch("/portal/api/me", {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          success?: boolean;
          user?: { display_name?: string; email?: string; theme?: string };
        };
        if (!payload.success || !payload.user) {
          return;
        }
        if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
          setTheme(normalizeTheme(payload.user.theme));
        }
        setRawLoginName(payload.user.display_name || payload.user.email || "minutes-user-demo-account@example.com");
      } catch {
        // Keep defaults when API is unavailable from local frontend.
      }
    };
    void fetchProfile();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.sessionStorage.setItem(AI_OPEN_STORAGE_KEY, isAiOpen ? "1" : "0");
  }, [isAiOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) {
        return;
      }
      event.preventDefault();
      setIsAiOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]" data-theme={theme}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.14),_transparent_52%)]" />
      <header className="sticky top-0 z-40 h-14 border-b border-slate-800/80 bg-[color:color-mix(in_srgb,var(--background)_92%,black)]/95 backdrop-blur md:h-16">
        <div
          className="mx-auto flex h-full w-full items-center justify-between gap-3"
          style={{ paddingInline: "clamp(12px, 2vw, 24px)" }}
        >
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <button
              type="button"
              className="inline-flex h-8 w-[72px] items-center justify-center rounded-lg border border-slate-600/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))] text-xs font-medium tracking-wide text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_20px_rgba(15,23,42,0.45)] transition hover:border-slate-400/70 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_10px_28px_rgba(59,130,246,0.2)]"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              aria-label="左サイドメニューを開閉"
            >
              Menu
            </button>
            <div className="min-w-0">
              <p className="brand-led text-lg font-bold tracking-tight md:text-2xl">ALRfy-AI</p>
              <p className="hidden text-xs text-slate-400 md:block">
                All-REC to Record: Link & Datafy by AI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
              aria-label="設定"
              onClick={() => setIsThemeModalOpen(true)}
            >
              ⚙
            </button>
            <span
              className="max-w-[10rem] truncate rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300"
              title={rawLoginName}
            >
              {loginDisplayName}
            </span>
          </div>
        </div>
      </header>

      <div
        className="mx-auto flex w-full gap-3 py-4"
        style={{ paddingInline: "clamp(12px, 2vw, 24px)" }}
      >
        <aside
          className={[
            "modern-scrollbar h-[calc(100vh-6rem)] shrink-0 overflow-x-hidden overflow-y-auto rounded-2xl border border-slate-800/80 bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)] p-2 motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out",
            isSidebarOpen ? "w-[240px]" : "w-[72px]",
            isDesktop ? "relative" : "fixed inset-y-20 left-3 z-30",
            !isDesktop && !isSidebarOpen ? "hidden" : "",
          ].join(" ")}
          aria-label="左サイドメニュー"
        >
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                    active
                      ? "bg-slate-800/90 text-white shadow-sm"
                      : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100",
                  ].join(" ")}
                  title={isSidebarOpen ? undefined : item.label}
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-600 text-xs font-semibold">
                    {item.icon}
                  </span>
                  <span
                    className={[
                      "origin-left whitespace-nowrap text-sm motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out",
                      isSidebarOpen
                        ? "max-w-[156px] translate-x-0 opacity-100"
                        : "max-w-0 -translate-x-1 opacity-0",
                    ].join(" ")}
                    aria-hidden={!isSidebarOpen}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="surface-card min-h-[calc(100vh-7rem)] min-w-0 flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>

      <button
        type="button"
        className="fixed bottom-16 right-5 z-[70] rounded-full border border-blue-400/50 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:brightness-110"
        onClick={() => setIsAiOpen((prev) => !prev)}
        aria-label="AIチャットを開閉"
      >
        AI Chat
      </button>
      <p className="fixed bottom-9 right-5 z-[70] text-[11px] text-slate-400">Ctrl/Cmd + K</p>

      {isAiOpen && (
        <div
          className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[1px]"
          onClick={() => setIsAiOpen(false)}
          aria-hidden="true"
        />
      )}

      {isAiOpen && isDesktop && (
        <section
          className="fixed right-0 top-16 z-[90] flex h-[calc(100vh-4rem)] w-[380px] flex-col border-l border-slate-700 bg-[color:color-mix(in_srgb,var(--surface-soft)_94%,black)] p-4 shadow-2xl shadow-slate-950/60"
          aria-label="AIチャットドロワー"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">AI Chat (Dummy)</h2>
            <span className="text-[11px] text-slate-400">Toggle: Ctrl/Cmd + K</span>
          </div>
          <div className="modern-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
            {dummyMessages.map((message) => (
              <div key={message.id} className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
                <p className="text-[11px] text-slate-400">{message.role}</p>
                <p className="text-sm text-slate-200">{message.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-slate-800 pt-3">
            <input
              type="text"
              disabled
              placeholder="入力欄（ダミー）"
              className="w-full rounded-lg border border-slate-700 bg-[#0f1419] px-3 py-2 text-sm text-slate-500"
            />
            <button
              type="button"
              className="mt-3 w-full rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
              onClick={() => setIsAiOpen(false)}
            >
              Close (Ctrl/Cmd + K)
            </button>
          </div>
        </section>
      )}

      {isAiOpen && !isDesktop && (
        <section
          className="fixed inset-x-0 bottom-0 z-[90] flex max-h-[75vh] flex-col rounded-t-2xl border-t border-slate-700 bg-[color:color-mix(in_srgb,var(--surface-soft)_94%,black)] p-4 shadow-2xl shadow-slate-950/70"
          aria-label="AIチャットBottomSheet"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">AI Chat (Dummy)</h2>
            <span className="text-[11px] text-slate-400">Ctrl/Cmd + K</span>
          </div>
          <div className="modern-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
            {dummyMessages.map((message) => (
              <div key={message.id} className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
                <p className="text-[11px] text-slate-400">{message.role}</p>
                <p className="text-sm text-slate-200">{message.text}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            onClick={() => setIsAiOpen(false)}
          >
            Close (Ctrl/Cmd + K)
          </button>
        </section>
      )}

      {isThemeModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="テーマ設定"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-[color:color-mix(in_srgb,var(--surface)_94%,black)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">テーマ設定</h2>
              <button
                type="button"
                className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300"
                onClick={() => setIsThemeModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                className={[
                  "w-full rounded px-3 py-2 text-left text-sm",
                  theme === "default" ? "bg-slate-700 text-slate-100" : "text-slate-300 hover:bg-slate-800",
                ].join(" ")}
                onClick={() => {
                  setTheme("default");
                  setIsThemeModalOpen(false);
                }}
              >
                Default (Minutes)
              </button>
              <button
                type="button"
                className={[
                  "w-full rounded px-3 py-2 text-left text-sm",
                  theme === "dark" ? "bg-slate-700 text-slate-100" : "text-slate-300 hover:bg-slate-800",
                ].join(" ")}
                onClick={() => {
                  setTheme("dark");
                  setIsThemeModalOpen(false);
                }}
              >
                Dark
              </button>
              <button
                type="button"
                className={[
                  "w-full rounded px-3 py-2 text-left text-sm",
                  theme === "ocean" ? "bg-slate-700 text-slate-100" : "text-slate-300 hover:bg-slate-800",
                ].join(" ")}
                onClick={() => {
                  setTheme("ocean");
                  setIsThemeModalOpen(false);
                }}
              >
                Ocean
              </button>
              <button
                type="button"
                className={[
                  "w-full rounded px-3 py-2 text-left text-sm",
                  theme === "violet" ? "bg-slate-700 text-slate-100" : "text-slate-300 hover:bg-slate-800",
                ].join(" ")}
                onClick={() => {
                  setTheme("violet");
                  setIsThemeModalOpen(false);
                }}
              >
                Violet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
