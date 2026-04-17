"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

type DashboardShellProps = {
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
};

const navItems: readonly NavItem[] = [
  { href: "/", label: "ダッシュボード", icon: "▦" },
  {
    href: process.env.NEXT_PUBLIC_MEETING_URL || "http://minutes-record.com:8080/",
    label: "Meeting",
    icon: <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />,
    external: true,
  },
  { href: "/project-manager", label: "案件管理", icon: "⌘" },
];

const AI_OPEN_STORAGE_KEY = "alrfy-ai-chat-open";
const THEME_STORAGE_KEY = "alrfy-theme";
const PROFILE_API_ENDPOINT = process.env.NEXT_PUBLIC_PROFILE_API_ENDPOINT;
const supportedThemes = new Set(["default", "cute", "midnight", "ocean", "system", "dark", "violet"]);

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

type ThemeName = "default" | "cute" | "midnight" | "ocean";

function normalizeTheme(theme: string | null | undefined): ThemeName {
  if (!theme) {
    return "default";
  }
  if (theme === "system") {
    return "default";
  }
  // Backward compatibility for old theme names.
  if (theme === "dark") {
    return "midnight";
  }
  if (theme === "violet") {
    return "cute";
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
    if (!PROFILE_API_ENDPOINT) {
      return;
    }

    const controller = new AbortController();
    const fetchProfile = async () => {
      try {
        const response = await fetch(PROFILE_API_ENDPOINT, {
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
      <header className="sticky top-0 z-40 h-14 border-b border-[color:color-mix(in_srgb,var(--border)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_92%,black)]/95 backdrop-blur md:h-16">
        <div
          className="mx-auto flex h-full w-full items-center justify-between gap-3"
          style={{ paddingInline: "clamp(12px, 2vw, 24px)" }}
        >
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <Button
              variant="default"
              size="sm"
              className="h-8 w-[72px] rounded-lg bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))] text-xs tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_20px_rgba(15,23,42,0.45)] hover:border-[color:color-mix(in_srgb,var(--accent)_45%,white_55%)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_10px_28px_rgba(59,130,246,0.2)]"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              aria-label="左サイドメニューを開閉"
            >
              Menu
            </Button>
            <div className="min-w-0">
              <p className="brand-led text-lg font-bold tracking-tight md:text-2xl">ALRfy-AI</p>
              <p className="hidden text-xs text-[var(--muted)] md:block">
                All-REC to Record: Link & Datafy by AI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-lg px-2 py-1 text-xs"
              aria-label="設定"
              onClick={() => setIsThemeModalOpen(true)}
            >
              ⚙
            </Button>
            <span
              className="max-w-[10rem] truncate rounded-lg border border-[color:color-mix(in_srgb,var(--border)_92%,transparent)] px-2 py-1 text-xs text-[var(--muted)]"
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
            "modern-scrollbar h-[calc(100vh-6rem)] shrink-0 overflow-x-hidden overflow-y-auto rounded-2xl border border-slate-800/80 bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)] p-2",
            isSidebarOpen ? "w-[240px]" : "w-[72px]",
            isDesktop ? "relative" : "fixed inset-y-20 left-3 z-30",
            !isDesktop && !isSidebarOpen ? "hidden" : "",
          ].join(" ")}
          aria-label="左サイドメニュー"
        >
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = !item.external && isActivePath(pathname, item.href);
              const itemClassName = [
                "flex h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                active
                  ? "bg-[color:color-mix(in_srgb,var(--accent)_22%,var(--surface)_78%)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:bg-[color:color-mix(in_srgb,var(--surface)_92%,black_8%)] hover:text-[var(--foreground)]",
              ].join(" ");

              const itemContent = (
                <>
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--border)_90%,white_10%)] text-xs font-semibold">
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
                  {item.external ? (
                    <ExternalLink
                      className={[
                        "h-3.5 w-3.5 shrink-0 motion-safe:transition-all motion-safe:duration-200",
                        isSidebarOpen ? "ml-auto opacity-80" : "opacity-0",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                  ) : null}
                </>
              );

              if (item.external) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={itemClassName}
                    title={isSidebarOpen ? undefined : `${item.label} (new tab)`}
                  >
                    {itemContent}
                  </a>
                );
              }

              return (
                <Link key={item.href} href={item.href} className={itemClassName} title={isSidebarOpen ? undefined : item.label}>
                  {itemContent}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="surface-card min-h-[calc(100vh-7rem)] min-w-0 flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>

      <Button
        variant="accent"
        className="fixed bottom-16 right-5 z-[70] rounded-full px-4 py-2 text-sm font-semibold shadow-lg shadow-slate-900/40"
        onClick={() => setIsAiOpen((prev) => !prev)}
        aria-label="AIチャットを開閉"
      >
        AI Chat
      </Button>
      <p className="fixed bottom-9 right-5 z-[70] text-[11px] text-[var(--muted)]">Ctrl/Cmd + K</p>

      <Sheet open={isAiOpen} onOpenChange={setIsAiOpen}>
        {isDesktop ? (
          <SheetContent
            side="right"
            className="top-16 h-[calc(100vh-4rem)]"
            aria-label="AIチャットドロワー"
          >
            <SheetHeader>
              <SheetTitle>AI Chat (実装までしらばらくお待ちください)</SheetTitle>
              <span className="text-[11px] text-[var(--muted)]">Toggle: Ctrl/Cmd + K</span>
            </SheetHeader>
            <div className="modern-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
              {dummyMessages.map((message) => (
                <div key={message.id} className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_92%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_84%,black_16%)] p-2">
                  <p className="text-[11px] text-[var(--muted)]">{message.role}</p>
                  <p className="text-sm text-[var(--foreground)]">{message.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] pt-3">
              <input
                type="text"
                disabled
                placeholder="入力欄（ダミー）"
                className="w-full rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_94%,black_6%)] px-3 py-2 text-sm text-[var(--muted)]"
              />
              <Button variant="default" className="mt-3 w-full text-sm" onClick={() => setIsAiOpen(false)}>
                Close (Ctrl/Cmd + K)
              </Button>
            </div>
          </SheetContent>
        ) : (
          <SheetContent side="bottom" aria-label="AIチャットBottomSheet">
            <SheetHeader>
              <SheetTitle>AI Chat (実装までしらばらくお待ちください)</SheetTitle>
              <span className="text-[11px] text-[var(--muted)]">Ctrl/Cmd + K</span>
            </SheetHeader>
            <div className="modern-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
              {dummyMessages.map((message) => (
                <div key={message.id} className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_92%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_84%,black_16%)] p-2">
                  <p className="text-[11px] text-[var(--muted)]">{message.role}</p>
                  <p className="text-sm text-[var(--foreground)]">{message.text}</p>
                </div>
              ))}
            </div>
            <Button variant="default" className="mt-3 w-full text-sm" onClick={() => setIsAiOpen(false)}>
              Close (Ctrl/Cmd + K)
            </Button>
          </SheetContent>
        )}
      </Sheet>

      <Dialog open={isThemeModalOpen} onOpenChange={setIsThemeModalOpen}>
        <DialogContent aria-label="テーマ設定" className="w-full max-w-sm p-4">
          <DialogHeader className="mb-3 flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-sm">テーマ設定</DialogTitle>
            <DialogClose asChild>
              <Button variant="default" size="sm" className="h-7 px-2 py-1 text-xs">
                Close
              </Button>
            </DialogClose>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              variant={theme === "default" ? "accent" : "default"}
              className="w-full justify-start text-sm"
              onClick={() => {
                setTheme("default");
                setIsThemeModalOpen(false);
              }}
            >
              Default (Minutes)
            </Button>
            <Button
              variant={theme === "midnight" ? "accent" : "default"}
              className="w-full justify-start text-sm"
              onClick={() => {
                setTheme("midnight");
                setIsThemeModalOpen(false);
              }}
            >
              Midnight
            </Button>
            <Button
              variant={theme === "ocean" ? "accent" : "default"}
              className="w-full justify-start text-sm"
              onClick={() => {
                setTheme("ocean");
                setIsThemeModalOpen(false);
              }}
            >
              Ocean
            </Button>
            <Button
              variant={theme === "cute" ? "accent" : "default"}
              className="w-full justify-start text-sm"
              onClick={() => {
                setTheme("cute");
                setIsThemeModalOpen(false);
              }}
            >
              Cute
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
