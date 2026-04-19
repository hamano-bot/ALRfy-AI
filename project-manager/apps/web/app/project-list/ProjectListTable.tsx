"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ThemeDateField } from "@/app/components/ThemeDateField";
import { Button } from "@/app/components/ui/button";
import { Input, inputBaseClassName } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/app/components/ui/sheet";
import {
  EMPTY_PROJECT_LIST_FILTERS,
  ensureProjectListFilters,
  filterProjectRows,
  ownersFirstProjects,
  sortProjectRows,
  syncNameClientFromId,
  uniqueClientsOwnerFirst,
  type ProjectListAppliedFilters,
  type ProjectListRoleFilter,
  type ProjectListSortColumn,
  type ProjectListSortDir,
} from "@/lib/project-list-table-helpers";
import {
  formatProjectRoleLabelJa,
  formatSiteTypeLabel,
  SITE_TYPE_LABEL_JA,
  type PortalMyProjectRow,
} from "@/lib/portal-my-projects";
import { displayText } from "@/lib/empty-display";
import { cn } from "@/lib/utils";

const SITE_TYPE_OPTIONS = Object.entries(SITE_TYPE_LABEL_JA) as [string, string][];

const ROLE_FILTER_OPTIONS: { value: ProjectListRoleFilter; label: string }[] = [
  { value: "owner", label: "オーナー" },
  { value: "editor", label: "編集" },
  { value: "viewer", label: "参照" },
];

/** outline はブラウザ既定で白っぽくフラッシュしやすいので ring のみにする */
const checkboxClass =
  "h-4 w-4 shrink-0 rounded border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_94%,black_6%)] accent-[var(--accent)] outline-none ring-offset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_55%,transparent)]";

const radioClass =
  "h-4 w-4 shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_94%,black_6%)] accent-[var(--accent)] outline-none ring-offset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_55%,transparent)]";

type Props = {
  initialProjects: PortalMyProjectRow[];
};

function SortGlyph({ active, dir }: { active: boolean; dir: ProjectListSortDir }) {
  if (!active) {
    return (
      <span className="ml-1 inline-flex flex-col text-[10px] leading-none text-[var(--muted)] opacity-60" aria-hidden>
        <span>▲</span>
        <span>▼</span>
      </span>
    );
  }
  return (
    <span className="ml-1 text-[10px] text-[color:color-mix(in_srgb,var(--accent)_88%,var(--foreground)_12%)]" aria-hidden>
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

function toggleSiteType(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
}

function toggleRole(current: ProjectListRoleFilter[], value: ProjectListRoleFilter): ProjectListRoleFilter[] {
  return current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
}

function useEnsuredFiltersState(): [
  ProjectListAppliedFilters,
  Dispatch<SetStateAction<ProjectListAppliedFilters>>,
] {
  const [raw, setRaw] = useState<ProjectListAppliedFilters>(EMPTY_PROJECT_LIST_FILTERS);
  const safe = useMemo(() => ensureProjectListFilters(raw), [raw]);
  const setSafe = useCallback((u: SetStateAction<ProjectListAppliedFilters>) => {
    setRaw((prev) => {
      const base = ensureProjectListFilters(prev);
      const next = typeof u === "function" ? u(base) : u;
      return ensureProjectListFilters(next);
    });
  }, []);
  return [safe, setSafe];
}

const projectRowClass =
  "group border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] last:border-b-0 cursor-pointer transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--accent)_16%,var(--surface)_84%)] focus-visible:bg-[color:color-mix(in_srgb,var(--accent)_16%,var(--surface)_84%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_50%,transparent)] focus-visible:ring-inset";

/** App Router の `push` が Promise を返す場合の未処理拒否（[object Event] 等）を防ぐ */
function pushSafe(router: ReturnType<typeof useRouter>, href: string) {
  startTransition(() => {
    try {
      const ret = router.push(href) as unknown;
      if (ret != null && typeof ret === "object" && typeof (ret as Promise<unknown>).catch === "function") {
        void (ret as Promise<unknown>).catch(() => {});
      }
    } catch {
      /* 同期エラーは握りつぶす（遷移失敗は別途 UI で扱う） */
    }
  });
}

export function ProjectListTable({ initialProjects }: Props) {
  const router = useRouter();
  const initialRows = useMemo(
    () => (Array.isArray(initialProjects) ? initialProjects : []),
    [initialProjects],
  );

  const [ownerOnly, setOwnerOnly] = useState(true);
  const [appliedFilters, setAppliedFilters] = useEnsuredFiltersState();
  const [draftFilters, setDraftFilters] = useEnsuredFiltersState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<ProjectListSortColumn | null>(null);
  const [sortDir, setSortDir] = useState<ProjectListSortDir>("asc");

  const [projectSuggestOpen, setProjectSuggestOpen] = useState(false);
  const [clientSuggestOpen, setClientSuggestOpen] = useState(false);
  const projectSuggestRef = useRef<HTMLDivElement>(null);
  const clientSuggestRef = useRef<HTMLDivElement>(null);

  const [siteTypePopoverOpen, setSiteTypePopoverOpen] = useState(false);
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);

  const openSheet = useCallback(() => {
    setDraftFilters(appliedFilters);
    setSheetOpen(true);
  }, [appliedFilters, setDraftFilters]);

  const applyAndClose = useCallback(() => {
    setAppliedFilters(draftFilters);
    setSheetOpen(false);
  }, [draftFilters, setAppliedFilters]);

  const clearDraft = useCallback(() => {
    setDraftFilters(EMPTY_PROJECT_LIST_FILTERS);
  }, [setDraftFilters]);

  const clearApplied = useCallback(() => {
    setAppliedFilters(EMPTY_PROJECT_LIST_FILTERS);
    setDraftFilters(EMPTY_PROJECT_LIST_FILTERS);
  }, [setAppliedFilters, setDraftFilters]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!projectSuggestRef.current?.contains(t)) {
        setProjectSuggestOpen(false);
      }
      if (!clientSuggestRef.current?.contains(t)) {
        setClientSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const idEmpty = draftFilters.idQuery.trim() === "";

  const projectSuggestRows = useMemo(() => {
    const q = draftFilters.nameQuery.trim().toLowerCase();
    const base = ownersFirstProjects(initialRows);
    if (!q) {
      return base;
    }
    return base.filter((p) => {
      const n = typeof p.name === "string" ? p.name : String(p.name ?? "");
      return n.toLowerCase().includes(q);
    });
  }, [initialRows, draftFilters.nameQuery]);

  const clientSuggestList = useMemo(() => {
    const q = draftFilters.clientQuery.trim().toLowerCase();
    const base = uniqueClientsOwnerFirst(initialRows);
    if (!q) {
      return base;
    }
    return base.filter((c) => c.toLowerCase().includes(q));
  }, [initialRows, draftFilters.clientQuery]);

  const filtered = useMemo(
    () => filterProjectRows(initialRows, appliedFilters, ownerOnly),
    [initialRows, appliedFilters, ownerOnly],
  );

  const rows = useMemo(() => sortProjectRows(filtered, sortColumn, sortDir), [filtered, sortColumn, sortDir]);

  const onHeaderClick = useCallback(
    (col: ProjectListSortColumn) => {
      if (sortColumn === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(col);
        setSortDir("asc");
      }
    },
    [sortColumn],
  );

  const headerBtnClass =
    "inline-flex h-8 w-full min-w-0 items-center justify-start gap-0.5 whitespace-nowrap px-3 py-1 text-left text-sm font-semibold text-[var(--foreground)] tracking-normal hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,var(--accent)_12%)]";

  const siteTypeTriggerLabel =
    draftFilters.siteTypes.length === 0 ? "すべて" : `${draftFilters.siteTypes.length}件選択`;

  const roleTriggerLabel =
    draftFilters.roles.length === 0 ? "すべて" : `${draftFilters.roles.length}件選択`;

  const prefetchSafe = useCallback(
    (href: string) => {
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    },
    [router],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col border-b border-[color:color-mix(in_srgb,var(--border)_90%,transparent)]">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="accent"
            size="sm"
            className="h-9 gap-1.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            aria-label="詳細検索を開く"
            onClick={openSheet}
          >
            <Search className="h-4 w-4 shrink-0 text-[var(--accent-contrast)]" aria-hidden />
          </Button>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="project-list-owner-only"
              name="project-list-owner-only"
              checked={ownerOnly}
              onChange={(e) => setOwnerOnly(e.target.checked)}
              className={checkboxClass}
            />
            <Label htmlFor="project-list-owner-only" className="cursor-pointer text-sm text-[var(--foreground)]">
              オーナーのみ
            </Label>
          </div>
        </div>
        <p
          className="ml-auto shrink-0 text-sm tabular-nums text-[var(--muted)]"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="font-semibold text-[var(--foreground)]">{rows.length}</span>
          件
        </p>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="mb-0 flex flex-row items-center justify-between space-y-0 border-b border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] px-6 py-4">
            <SheetTitle className="text-base">詳細検索</SheetTitle>
            <SheetClose asChild>
              <Button type="button" variant="default" size="sm" className="h-7 shrink-0 px-2 py-1 text-xs">
                Close
              </Button>
            </SheetClose>
          </SheetHeader>
          <div className="flex max-h-[calc(100vh-8rem)] flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="flt-id">ID</Label>
                <Input
                  id="flt-id"
                  name="flt-id"
                  placeholder="完全一致"
                  inputMode="numeric"
                  value={draftFilters.idQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraftFilters((f) => {
                      const next = { ...f, idQuery: v };
                      const sync = syncNameClientFromId(v, initialRows);
                      if (sync) {
                        next.nameQuery = sync.name;
                        next.clientQuery = sync.client;
                      }
                      return next;
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flt-name">プロジェクト</Label>
                <div ref={projectSuggestRef} className="relative">
                  <Input
                    id="flt-name"
                    name="flt-name"
                    autoComplete="off"
                    value={draftFilters.nameQuery}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, nameQuery: e.target.value }))}
                    onFocus={() => {
                      if (idEmpty) {
                        setProjectSuggestOpen(true);
                        setClientSuggestOpen(false);
                      }
                    }}
                  />
                  {projectSuggestOpen && idEmpty ? (
                    <div className="absolute left-0 right-0 top-full z-[140] mt-1 max-h-56 overflow-y-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)] shadow-lg">
                      {projectSuggestRows.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-[var(--muted)]">候補がありません</p>
                      ) : (
                        projectSuggestRows.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setDraftFilters((f) => ({
                                ...f,
                                idQuery: String(p.id),
                                nameQuery: p.name,
                                clientQuery: p.client_name ?? "",
                              }));
                              setProjectSuggestOpen(false);
                            }}
                          >
                            <span className="font-mono text-xs text-[var(--muted)]">#{p.id}</span> {p.name}
                            <span className="block truncate text-xs text-[var(--muted)]">{displayText(p.client_name)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flt-client">クライアント</Label>
                <div ref={clientSuggestRef} className="relative">
                  <Input
                    id="flt-client"
                    name="flt-client"
                    autoComplete="off"
                    value={draftFilters.clientQuery}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, clientQuery: e.target.value }))}
                    onFocus={() => {
                      if (idEmpty) {
                        setClientSuggestOpen(true);
                        setProjectSuggestOpen(false);
                      }
                    }}
                  />
                  {clientSuggestOpen && idEmpty ? (
                    <div className="absolute left-0 right-0 top-full z-[140] mt-1 max-h-56 overflow-y-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)] shadow-lg">
                      {clientSuggestList.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-[var(--muted)]">候補がありません</p>
                      ) : (
                        clientSuggestList.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setDraftFilters((f) => ({ ...f, clientQuery: c }));
                              setClientSuggestOpen(false);
                            }}
                          >
                            {c}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="block text-sm font-medium leading-none text-[var(--foreground)]">サイト種別</span>
                <Popover open={siteTypePopoverOpen} onOpenChange={setSiteTypePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="default"
                      className={cn(inputBaseClassName, "h-9 w-full justify-between font-normal")}
                      aria-expanded={siteTypePopoverOpen}
                    >
                      <span className="min-w-0 truncate">{siteTypeTriggerLabel}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="z-[140] w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,24rem)] p-3" align="start">
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {SITE_TYPE_OPTIONS.map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            id={`pm-flt-site-${value}`}
                            name={`pm-flt-site-${value}`}
                            className={checkboxClass}
                            checked={draftFilters.siteTypes.includes(value)}
                            onChange={() =>
                              setDraftFilters((f) => ({
                                ...f,
                                siteTypes: toggleSiteType(f.siteTypes, value),
                              }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-[var(--muted)]">未選択のときはすべて対象です。</p>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="min-w-0 space-y-1.5">
                <span className="block text-sm font-medium leading-none text-[var(--foreground)]">区分</span>
                <div
                  className="flex min-w-0 flex-row flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--foreground)]"
                  role="radiogroup"
                  aria-label="区分"
                >
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap">
                    <input
                      type="radio"
                      id="pm-flt-renewal-all"
                      name="pm-project-list-renewal-filter"
                      className={radioClass}
                      checked={draftFilters.renewalFilter === "all"}
                      onChange={() => setDraftFilters((f) => ({ ...f, renewalFilter: "all" }))}
                    />
                    すべて
                  </label>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap">
                    <input
                      type="radio"
                      id="pm-flt-renewal-renewal"
                      name="pm-project-list-renewal-filter"
                      className={radioClass}
                      checked={draftFilters.renewalFilter === "renewal"}
                      onChange={() => setDraftFilters((f) => ({ ...f, renewalFilter: "renewal" }))}
                    />
                    リニューアル
                  </label>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap">
                    <input
                      type="radio"
                      id="pm-flt-renewal-new"
                      name="pm-project-list-renewal-filter"
                      className={radioClass}
                      checked={draftFilters.renewalFilter === "new"}
                      onChange={() => setDraftFilters((f) => ({ ...f, renewalFilter: "new" }))}
                    />
                    新規
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-[var(--muted)]">キックオフ</span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <ThemeDateField
                    className="min-w-0 flex-1"
                    label="から"
                    controlId="flt-kickoff-from"
                    name="flt-kickoff-from"
                    value={draftFilters.kickoffFrom}
                    onChange={(v) => setDraftFilters((f) => ({ ...f, kickoffFrom: v }))}
                  />
                  <ThemeDateField
                    className="min-w-0 flex-1"
                    label="まで"
                    controlId="flt-kickoff-to"
                    name="flt-kickoff-to"
                    value={draftFilters.kickoffTo}
                    onChange={(v) => setDraftFilters((f) => ({ ...f, kickoffTo: v }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-[var(--muted)]">リリース予定</span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <ThemeDateField
                    className="min-w-0 flex-1"
                    label="から"
                    controlId="flt-release-from"
                    name="flt-release-from"
                    value={draftFilters.releaseFrom}
                    onChange={(v) => setDraftFilters((f) => ({ ...f, releaseFrom: v }))}
                  />
                  <ThemeDateField
                    className="min-w-0 flex-1"
                    label="まで"
                    controlId="flt-release-to"
                    name="flt-release-to"
                    value={draftFilters.releaseTo}
                    onChange={(v) => setDraftFilters((f) => ({ ...f, releaseTo: v }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="block text-sm font-medium leading-none text-[var(--foreground)]">あなたのロール</span>
                <Popover open={rolePopoverOpen} onOpenChange={setRolePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="default"
                      className={cn(inputBaseClassName, "h-9 w-full justify-between font-normal")}
                      aria-expanded={rolePopoverOpen}
                    >
                      <span className="min-w-0 truncate">{roleTriggerLabel}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="z-[140] w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,24rem)] p-3" align="start">
                    <div className="space-y-2">
                      {ROLE_FILTER_OPTIONS.map(({ value, label }) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            id={`pm-flt-role-${value}`}
                            name={`pm-flt-role-${value}`}
                            className={checkboxClass}
                            checked={draftFilters.roles.includes(value)}
                            onChange={() =>
                              setDraftFilters((f) => ({
                                ...f,
                                roles: toggleRole(f.roles, value),
                              }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-[var(--muted)]">未選択のときはすべて対象です。</p>
                  </PopoverContent>
                </Popover>
              </div>
              <p className="text-xs text-[var(--muted)]">条件はすべて AND。空欄の項目は無視されます。</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] px-6 py-4">
              <Button type="button" variant="default" size="sm" onClick={clearDraft}>
                クリア
              </Button>
              <Button type="button" variant="accent" size="sm" onClick={applyAndClose}>
                適用して閉じる
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="modern-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[1024px] table-auto text-left text-sm">
            <thead className="pm-table-head sticky top-0 z-10 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)]">
              <tr>
                <th className="px-5 py-3 text-left align-bottom">
                  <button type="button" className={headerBtnClass} onClick={() => onHeaderClick("id")}>
                    ID
                    <SortGlyph active={sortColumn === "id"} dir={sortDir} />
                  </button>
                </th>
                <th className="px-3 py-3 text-left align-bottom">
                  <button type="button" className={headerBtnClass} onClick={() => onHeaderClick("name")}>
                    プロジェクト
                    <SortGlyph active={sortColumn === "name"} dir={sortDir} />
                  </button>
                </th>
                <th className="min-w-[18rem] px-3 py-3 text-left align-bottom">
                  <button type="button" className={headerBtnClass} onClick={() => onHeaderClick("client_name")}>
                    クライアント
                    <SortGlyph active={sortColumn === "client_name"} dir={sortDir} />
                  </button>
                </th>
                <th className="px-3 py-3 text-left align-bottom">
                  <button type="button" className={headerBtnClass} onClick={() => onHeaderClick("site_type")}>
                    サイト種別
                    <SortGlyph active={sortColumn === "site_type"} dir={sortDir} />
                  </button>
                </th>
                <th className="px-3 py-3 text-left align-bottom">
                  <button type="button" className={headerBtnClass} onClick={() => onHeaderClick("is_renewal")}>
                    区分
                    <SortGlyph active={sortColumn === "is_renewal"} dir={sortDir} />
                  </button>
                </th>
                <th className="px-3 py-3 text-left align-bottom">
                  <button type="button" className={headerBtnClass} onClick={() => onHeaderClick("kickoff_date")}>
                    キックオフ
                    <SortGlyph active={sortColumn === "kickoff_date"} dir={sortDir} />
                  </button>
                </th>
                <th className="px-3 py-3 text-left align-bottom">
                  <button type="button" className={headerBtnClass} onClick={() => onHeaderClick("release_due_date")}>
                    リリース予定
                    <SortGlyph active={sortColumn === "release_due_date"} dir={sortDir} />
                  </button>
                </th>
                <th className="w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] px-2 py-3 text-left align-bottom">
                  <button type="button" className={cn(headerBtnClass, "px-1")} onClick={() => onHeaderClick("role")}>
                    ロール
                    <SortGlyph active={sortColumn === "role"} dir={sortDir} />
                  </button>
                </th>
                <th scope="col" className="w-px whitespace-nowrap px-2 py-3 text-left align-bottom">
                  <span className="text-sm font-semibold text-[var(--foreground)]">詳細</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                    条件に一致する案件がありません。
                    <button
                      type="button"
                      className="ml-2 text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] underline"
                      onClick={clearApplied}
                    >
                      検索条件をクリア
                    </button>
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const href = `/project-list/${p.id}`;
                  const label = p.name || `（無題 #${p.id}）`;
                  return (
                    <tr
                      key={p.id}
                      tabIndex={0}
                      role="link"
                      aria-label={`${label} の詳細を開く`}
                      className={projectRowClass}
                      onClick={() => pushSafe(router, href)}
                      onMouseEnter={() => prefetchSafe(href)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          pushSafe(router, href);
                        }
                      }}
                    >
                      <td className="px-5 py-3 font-mono text-xs text-[var(--muted)]">{p.id}</td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-[color:color-mix(in_srgb,var(--accent)_88%,var(--foreground)_12%)] underline-offset-2 group-hover:underline">
                          {label}
                        </span>
                      </td>
                      <td
                        className="min-w-[18rem] max-w-[min(28rem,44vw)] truncate px-3 py-3 text-[var(--muted)]"
                        title={p.client_name ?? undefined}
                      >
                        {displayText(p.client_name)}
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-3 text-[var(--muted)]" title={formatSiteTypeLabel(p.site_type, p.site_type_other)}>
                        {formatSiteTypeLabel(p.site_type, p.site_type_other)}
                      </td>
                      <td className="px-3 py-3 text-[var(--muted)]">{p.is_renewal ? "リニューアル" : "新規"}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)]">{displayText(p.kickoff_date)}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)]">{displayText(p.release_due_date)}</td>
                      <td className="w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] px-2 py-3 align-middle">
                        <span
                          className="inline-block max-w-full truncate rounded-full bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] px-1.5 py-0.5 text-center text-[11px] font-medium leading-tight text-[var(--accent)]"
                          title={formatProjectRoleLabelJa(p.role)}
                        >
                          {formatProjectRoleLabelJa(p.role)}
                        </span>
                      </td>
                      <td className="w-px whitespace-nowrap px-2 py-3 align-middle">
                        <button
                          type="button"
                          tabIndex={-1}
                          className="inline-flex w-fit shrink-0 cursor-pointer flex-nowrap items-center gap-1 rounded-md border border-[color:color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] px-1.5 py-1 text-[11px] font-medium leading-none text-[color:color-mix(in_srgb,var(--muted)_90%,var(--foreground)_10%)] shadow-sm transition-colors group-hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)] group-hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)] group-hover:text-[var(--accent)]"
                          aria-label="詳細を開く"
                          onClick={(e) => {
                            e.stopPropagation();
                            pushSafe(router, href);
                          }}
                        >
                          <span className="whitespace-nowrap">詳細</span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-85" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
        </table>
      </div>
    </div>
  );
}
