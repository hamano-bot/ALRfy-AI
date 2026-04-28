"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ExternalLink, FileText } from "lucide-react";
import { isExternalPortalRoute, isPortalAppInteractive } from "../lib/portal-app-helpers";
import { PortalAppIcon } from "../lib/portal-app-icons";
import { Button, accentButtonSurfaceBaseClassName } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { DashboardSidebarOpenProvider } from "./DashboardSidebarContext";
import { EffectiveProjectRoleBanner } from "./EffectiveProjectRoleBanner";
import { usePortalApps } from "./PortalAppsProvider";
import { THEME_STORAGE_KEY } from "../theme-init";

type DashboardShellProps = {
  children: ReactNode;
};

type SidebarNavItem = {
  key: string;
  href: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
};

const AI_OPEN_STORAGE_KEY = "alrfy-ai-chat-open";
/** 同一オリジン BFF → PHP `GET /portal/api/me`（`PORTAL_API_BASE_URL` はサーバー専用） */
const PROFILE_BFF_PATH = "/api/portal/me";
const supportedThemes = new Set(["default", "cute", "midnight", "ocean", "system", "dark", "violet"]);

const dummyMessages = [
  { id: "m1", role: "AI", text: "こんにちは。何を整理しますか？（ダミー表示）" },
  { id: "m2", role: "あなた", text: "最新の案件状況をまとめてください。" },
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
  const isRequirementsPrintPreview = pathname?.includes("/requirements/print-preview") ?? false;
  const isHearingPrintPreview = pathname?.includes("/hearing/print-preview") ?? false;
  const isEstimatePrintPreview = /^\/estimates\/\d+\/preview\/?$/.test(pathname ?? "");
  const isSitemapWorkspace = pathname?.includes("/requirements/sitemap-workspace") ?? false;
  const { apps: portalApps } = usePortalApps();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("default");
  /** 初回の useEffect([theme]) が default で data-theme を上書きしない（theme-init スクリプト／初回ロードと整合） */
  const skipNextThemeDomSync = useRef(true);
  const [rawLoginName, setRawLoginName] = useState("minutes-user-demo-account@example.com");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"theme" | "redmine">("theme");
  const [redmineBaseUrl, setRedmineBaseUrl] = useState("");
  const [redmineApiKey, setRedmineApiKey] = useState("");
  const [redmineTestMsg, setRedmineTestMsg] = useState<string | null>(null);
  const [redmineSaving, setRedmineSaving] = useState(false);
  const [redmineTesting, setRedmineTesting] = useState(false);

  const loginDisplayName = useMemo(() => clampLoginName(rawLoginName), [rawLoginName]);

  const sidebarNavItems = useMemo((): SidebarNavItem[] => {
    const items: SidebarNavItem[] = [{ key: "dashboard", href: "/", label: "Dashboard", icon: "▦" }];
    const pmApp = portalApps.find((a) => a.app_key === "project-manager");
    const appsWithoutPm = portalApps.filter((a) => a.app_key !== "project-manager");
    for (const app of appsWithoutPm) {
      const interactive = isPortalAppInteractive(app.visibility);
      const external = interactive && isExternalPortalRoute(app.route);
      items.push({
        key: `portal-${app.app_key}`,
        href: app.route || "#",
        label: app.title,
        icon: <PortalAppIcon appKey={app.app_key} className="h-3.5 w-3.5" />,
        external,
        disabled: !interactive,
        disabledReason: app.reason,
      });
    }
    const pmInteractive = pmApp ? isPortalAppInteractive(pmApp.visibility) : true;
    items.push({
      key: "project-manager-fixed",
      href: "/project-list",
      label: pmApp?.title ?? "Project",
      icon: <PortalAppIcon appKey="project-manager" className="h-3.5 w-3.5" />,
      external: false,
      disabled: !pmInteractive,
      disabledReason: pmApp?.reason ?? null,
    });
    items.push({
      key: "estimate-manager-fixed",
      href: "/estimates",
      label: "Estimates",
      icon: <FileText className="h-3.5 w-3.5" aria-hidden />,
      external: false,
      disabled: false,
      disabledReason: null,
    });
    items.push({
      key: "settings-users-fixed",
      href: "/settings/users",
      label: "Settings",
      icon: "⚙",
      external: false,
      disabled: false,
      disabledReason: null,
    });
    return items;
  }, [portalApps]);

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
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    const savedTheme = normalizeTheme(raw);
    document.documentElement.dataset.theme = savedTheme;
    setTheme(savedTheme);
    if (raw !== null && raw !== "") {
      window.localStorage.setItem(THEME_STORAGE_KEY, savedTheme);
    }
    skipNextThemeDomSync.current = true;

    const controller = new AbortController();
    const fetchProfile = async () => {
      try {
        const response = await fetch(PROFILE_BFF_PATH, {
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
          const fromApi = normalizeTheme(payload.user.theme);
          setTheme(fromApi);
          document.documentElement.dataset.theme = fromApi;
          window.localStorage.setItem(THEME_STORAGE_KEY, fromApi);
        }
        setRawLoginName(payload.user.display_name || payload.user.email || "minutes-user-demo-account@example.com");
      } catch {
        // Keep defaults when BFF / portal is unavailable.
      }
    };
    void fetchProfile();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (skipNextThemeDomSync.current) {
      skipNextThemeDomSync.current = false;
      return;
    }
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.sessionStorage.setItem(AI_OPEN_STORAGE_KEY, isAiOpen ? "1" : "0");
  }, [isAiOpen]);

  useEffect(() => {
    const openRedmine = () => {
      setSettingsTab("redmine");
      setIsSettingsModalOpen(true);
    };
    window.addEventListener("open-redmine-settings", openRedmine);
    return () => window.removeEventListener("open-redmine-settings", openRedmine);
  }, []);

  useEffect(() => {
    if (!isSettingsModalOpen || settingsTab !== "redmine") {
      return;
    }
    const load = async () => {
      try {
        const res = await fetch("/api/portal/me?unassigned_ok=1", { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as {
          redmine?: { base_url?: string | null };
        };
        if (data.redmine?.base_url) {
          setRedmineBaseUrl(data.redmine.base_url);
        }
      } catch {
        /* ignore */
      }
    };
    void load();
  }, [isSettingsModalOpen, settingsTab]);

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

  if (isRequirementsPrintPreview || isHearingPrintPreview || isEstimatePrintPreview || isSitemapWorkspace) {
    return (
      <div className="h-full min-h-0 bg-[var(--background)] text-[var(--foreground)]">
        <main
          className={
            isSitemapWorkspace
              ? "h-full min-h-0 overflow-hidden p-0"
              : "requirements-print-shell-main h-full min-h-0 overflow-auto"
          }
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]" data-theme={theme}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.14),_transparent_52%)]" />
      <header className="sticky top-0 z-40 h-14 border-b border-[color:color-mix(in_srgb,var(--border)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_92%,black)]/95 backdrop-blur md:h-16">
        <div
          className="mx-auto flex h-full w-full items-center justify-between gap-3"
          style={{ paddingInline: "clamp(12px, 2vw, 24px)" }}
        >
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="group h-8 min-w-[72px] gap-1.5 rounded-lg bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))] px-2 text-xs tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_20px_rgba(15,23,42,0.45)] hover:border-[color:color-mix(in_srgb,var(--accent)_45%,white_55%)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_10px_28px_rgba(59,130,246,0.2)]"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              aria-expanded={isSidebarOpen}
              aria-controls="dashboard-sidebar-nav"
              aria-label="左サイドバーを開閉"
            >
              <ChevronLeft
                className={[
                  "h-3.5 w-3.5 shrink-0 text-[var(--foreground)] transition-[transform,color] duration-200 ease-out motion-reduce:transition-none",
                  "group-hover:text-[color:color-mix(in_srgb,var(--accent)_78%,var(--foreground)_22%)] motion-safe:group-hover:scale-110",
                  isSidebarOpen ? "rotate-0" : "rotate-180",
                ].join(" ")}
                aria-hidden
                strokeWidth={2.25}
              />
              <span>Menu</span>
            </Button>
            <Link
              href="/"
              className="group/brand flex min-w-0 items-center gap-2.5 md:gap-3"
              aria-label="ALRfy-AI ホームへ"
            >
              <span className="relative flex shrink-0 items-center justify-center" aria-hidden="true">
                <img
                  src="/brand/alrfy-ai-logo.svg"
                  alt=""
                  width={34}
                  height={40}
                  className="h-8 w-auto object-contain [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.35))] md:h-9"
                  decoding="async"
                />
              </span>
              <div className="min-w-0">
                <p className="brand-led text-lg font-bold tracking-tight md:text-2xl" lang="en" translate="no">
                  ALRfy-AI
                </p>
                <p className="hidden text-xs text-[var(--muted)] md:block" lang="en">
                  All-REC to Record: Link & Datafy by AI
                </p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              className="h-9 w-9 shrink-0 rounded-full p-0 text-base leading-none shadow-lg shadow-slate-900/40"
              aria-label="設定"
              onClick={() => {
                setSettingsTab("theme");
                setIsSettingsModalOpen(true);
              }}
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

      <EffectiveProjectRoleBanner />

      <DashboardSidebarOpenProvider value={isSidebarOpen}>
        <div
          className="mx-auto flex min-h-0 w-full flex-1 items-stretch gap-3 overflow-hidden py-4"
          style={{ paddingInline: "clamp(12px, 2vw, 24px)" }}
        >
          <aside
            id="dashboard-sidebar-nav"
            className={[
              "relative z-0 shrink-0 overflow-x-hidden overflow-y-auto rounded-2xl border border-slate-800/80 bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)] p-2 modern-scrollbar",
              "min-h-0 min-w-0 self-stretch transition-[width] duration-200 ease-out motion-reduce:transition-none",
              isSidebarOpen ? "w-[168px]" : "w-[72px]",
            ].join(" ")}
            aria-label="左サイドメニュー"
          >
          <nav className="min-w-0 space-y-1">
            {sidebarNavItems.map((item) => {
              const active = !item.external && !item.disabled && isActivePath(pathname, item.href);
              const itemClassName = [
                "flex h-10 w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                item.disabled
                  ? "cursor-not-allowed text-[var(--muted)] opacity-60"
                  : [
                      "group",
                      active
                        ? "bg-[color:color-mix(in_srgb,var(--accent)_22%,var(--surface)_78%)] text-[var(--foreground)] shadow-sm"
                        : "text-[var(--muted)] hover:bg-[color:color-mix(in_srgb,var(--surface)_92%,black_8%)] hover:text-[var(--foreground)]",
                    ].join(" "),
              ].join(" ");

              const itemContent = (
                <>
                  <span
                    className={
                      item.disabled
                        ? "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--border)_90%,white_10%)] text-xs font-semibold text-[var(--muted)]"
                        : [
                            accentButtonSurfaceBaseClassName,
                            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_12px_rgba(15,23,42,0.32)] motion-safe:transition motion-safe:duration-200 motion-safe:ease-out group-hover:brightness-110",
                            active ? "ring-2 ring-[color:color-mix(in_srgb,var(--accent)_50%,transparent)]" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")
                    }
                  >
                    {item.icon}
                  </span>
                  <span
                    className={[
                      "origin-left whitespace-nowrap text-sm motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out",
                      isSidebarOpen
                        ? "max-w-[109px] translate-x-0 opacity-100"
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

              if (item.disabled) {
                const reason = item.disabledReason ? `（${item.disabledReason}）` : "";
                return (
                  <div
                    key={item.key}
                    className={itemClassName}
                    title={isSidebarOpen ? undefined : `${item.label}${reason}`}
                    aria-disabled="true"
                  >
                    {itemContent}
                  </div>
                );
              }

              if (item.external) {
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={itemClassName}
                    title={isSidebarOpen ? undefined : `${item.label}（新しいタブ）`}
                  >
                    {itemContent}
                  </a>
                );
              }

              return (
                <Link key={item.key} href={item.href} className={itemClassName} title={isSidebarOpen ? undefined : item.label}>
                  {itemContent}
                </Link>
              );
            })}
          </nav>
          </aside>

          <main className="surface-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
            {children}
          </main>
        </div>
      </DashboardSidebarOpenProvider>

      {/*
      <Button
        type="button"
        variant="accent"
        className="fixed bottom-16 right-5 z-[70] rounded-full px-4 py-2 text-sm font-semibold shadow-lg shadow-slate-900/40"
        onClick={() => setIsAiOpen((prev) => !prev)}
        aria-label="AIチャットを開閉"
      >
        AIチャット
      </Button>
      <p className="fixed bottom-9 right-5 z-[70] text-[11px] text-[var(--muted)]" translate="no">
        Ctrl / ⌘ + K
      </p>
      */}

      <Sheet open={isAiOpen} onOpenChange={setIsAiOpen}>
        {isAiOpen ? (
          isDesktop ? (
            <SheetContent
              key="ai-chat-sheet-desktop"
              side="right"
              className="top-16 h-[calc(100vh-4rem)]"
              aria-label="AIチャットドロワー"
            >
              <SheetHeader>
                <SheetTitle>AIチャット（実装までしばらくお待ちください）</SheetTitle>
                <span className="text-[11px] text-[var(--muted)]">
                  切り替え: <span translate="no">Ctrl / ⌘ + K</span>
                </span>
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
                  id="pm-ai-chat-dummy-input"
                  name="pm-ai-chat-dummy-input"
                  type="text"
                  disabled
                  placeholder="入力欄（ダミー）"
                  className="w-full rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_94%,black_6%)] px-3 py-2 text-sm text-[var(--muted)]"
                />
                <Button type="button" variant="default" className="mt-3 w-full text-sm" onClick={() => setIsAiOpen(false)}>
                  Close (<span translate="no">Ctrl / ⌘ + K</span>)
                </Button>
              </div>
            </SheetContent>
          ) : (
            <SheetContent key="ai-chat-sheet-mobile" side="bottom" aria-label="AIチャットBottomSheet">
              <SheetHeader>
                <SheetTitle>AIチャット（実装までしばらくお待ちください）</SheetTitle>
                <span className="text-[11px] text-[var(--muted)]">
                  切り替え: <span translate="no">Ctrl / ⌘ + K</span>
                </span>
              </SheetHeader>
              <div className="modern-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
                {dummyMessages.map((message) => (
                  <div key={message.id} className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_92%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_84%,black_16%)] p-2">
                    <p className="text-[11px] text-[var(--muted)]">{message.role}</p>
                    <p className="text-sm text-[var(--foreground)]">{message.text}</p>
                  </div>
                ))}
              </div>
              <Button type="button" variant="default" className="mt-3 w-full text-sm" onClick={() => setIsAiOpen(false)}>
                Close (<span translate="no">Ctrl / ⌘ + K</span>)
              </Button>
            </SheetContent>
          )
        ) : null}
      </Sheet>

      <Dialog open={isSettingsModalOpen} onOpenChange={setIsSettingsModalOpen}>
        <DialogContent aria-label="設定" className="w-full max-w-md p-4">
          <DialogHeader className="mb-3 flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-sm">設定</DialogTitle>
            <DialogClose asChild>
              <Button type="button" variant="default" size="sm" className="h-7 px-2 py-1 text-xs">
                Close
              </Button>
            </DialogClose>
          </DialogHeader>
          <div className="mb-3 flex gap-2 border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] pb-2">
            <Button
              type="button"
              size="sm"
              variant={settingsTab === "theme" ? "accent" : "default"}
              onClick={() => setSettingsTab("theme")}
            >
              テーマ
            </Button>
            <Button
              type="button"
              size="sm"
              variant={settingsTab === "redmine" ? "accent" : "default"}
              onClick={() => setSettingsTab("redmine")}
            >
              Redmine 連携
            </Button>
          </div>
          {settingsTab === "theme" ? (
            <div className="space-y-2">
              <Button
                type="button"
                variant={theme === "default" ? "accent" : "default"}
                className="w-full justify-start text-sm"
                onClick={() => {
                  setTheme("default");
                  setIsSettingsModalOpen(false);
                }}
              >
                デフォルト
              </Button>
              <Button
                type="button"
                variant={theme === "midnight" ? "accent" : "default"}
                className="w-full justify-start text-sm"
                onClick={() => {
                  setTheme("midnight");
                  setIsSettingsModalOpen(false);
                }}
              >
                ミッドナイト
              </Button>
              <Button
                type="button"
                variant={theme === "ocean" ? "accent" : "default"}
                className="w-full justify-start text-sm"
                onClick={() => {
                  setTheme("ocean");
                  setIsSettingsModalOpen(false);
                }}
              >
                オーシャン
              </Button>
              <Button
                type="button"
                variant={theme === "cute" ? "accent" : "default"}
                className="w-full justify-start text-sm"
                onClick={() => {
                  setTheme("cute");
                  setIsSettingsModalOpen(false);
                }}
              >
                キュート
              </Button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <label className="block text-xs text-[var(--muted)]">
                Redmine の URL（ベース）
                <input
                  id="pm-settings-redmine-base-url"
                  name="pm-settings-redmine-base-url"
                  type="url"
                  className="mt-1 w-full rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_94%,black_6%)] px-3 py-2 text-sm"
                  placeholder="https://redmine.example.com"
                  value={redmineBaseUrl}
                  onChange={(e) => setRedmineBaseUrl(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block text-xs text-[var(--muted)]">
                API キー（変更時のみ入力）
                <input
                  id="pm-settings-redmine-api-key"
                  name="pm-settings-redmine-api-key"
                  type="password"
                  className="mt-1 w-full rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_94%,black_6%)] px-3 py-2 text-sm"
                  placeholder="••••••••"
                  value={redmineApiKey}
                  onChange={(e) => setRedmineApiKey(e.target.value)}
                  autoComplete="off"
                />
              </label>
              {redmineTestMsg ? (
                <p className="text-xs text-[var(--muted)]" role="status">
                  {redmineTestMsg}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={redmineTesting}
                  onClick={async () => {
                    setRedmineTesting(true);
                    setRedmineTestMsg(null);
                    try {
                      const body: Record<string, string> = {};
                      if (redmineBaseUrl.trim() !== "") {
                        body.redmine_base_url = redmineBaseUrl.trim();
                      }
                      if (redmineApiKey.trim() !== "") {
                        body.redmine_api_key = redmineApiKey.trim();
                      }
                      const res = await fetch("/api/portal/user/redmine/test", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json", Accept: "application/json" },
                        body: JSON.stringify(body),
                      });
                      const data = (await res.json()) as { success?: boolean; message?: string };
                      setRedmineTestMsg(data.message ?? (res.ok ? "OK" : "失敗"));
                    } catch {
                      setRedmineTestMsg("接続テストに失敗しました。");
                    } finally {
                      setRedmineTesting(false);
                    }
                  }}
                >
                  {redmineTesting ? "テスト中…" : "接続テスト"}
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  disabled={redmineSaving}
                  onClick={async () => {
                    setRedmineSaving(true);
                    setRedmineTestMsg(null);
                    try {
                      const body: Record<string, string | null> = {
                        redmine_base_url: redmineBaseUrl.trim() === "" ? null : redmineBaseUrl.trim(),
                      };
                      if (redmineApiKey.trim() !== "") {
                        body.redmine_api_key = redmineApiKey.trim();
                      }
                      const res = await fetch("/api/portal/user/redmine", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json", Accept: "application/json" },
                        body: JSON.stringify(body),
                      });
                      const data = (await res.json()) as { success?: boolean; message?: string };
                      if (!res.ok) {
                        setRedmineTestMsg(data.message ?? "保存に失敗しました。");
                        return;
                      }
                      setRedmineApiKey("");
                      setRedmineTestMsg("保存しました。");
                      window.dispatchEvent(new Event("redmine-config-updated"));
                    } catch {
                      setRedmineTestMsg("保存に失敗しました。");
                    } finally {
                      setRedmineSaving(false);
                    }
                  }}
                >
                  {redmineSaving ? "保存中…" : "保存"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
