"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ThemeDateField } from "@/app/components/ThemeDateField";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import {
  portalProjectCreateBodySchema,
  portalProjectPatchBodySchema,
} from "@/lib/portal-project-create-body";
import { parsePortalProjectSuccess, type PortalProjectDetail } from "@/lib/portal-project";
import { PROJECT_ROLE_LABEL_JA } from "@/lib/project-role-labels";
import { projectEditFormFingerprintFromDetail, projectEditFormFingerprintFromFormState } from "@/lib/project-edit-form-fingerprint";
import { UNSAVED_LEAVE_CONFIRM_MESSAGE } from "@/lib/unsaved-navigation";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

const SITE_TYPES = [
  { value: "corporate", label: "コーポレート" },
  { value: "ec", label: "EC" },
  { value: "member_portal", label: "会員ポータル" },
  { value: "internal_portal", label: "社内ポータル" },
  { value: "product_portal", label: "製品ポータル" },
  { value: "owned_media", label: "オウンドメディア" },
  { value: "other", label: "その他" },
] as const;

type SiteTypeFormValue = (typeof SITE_TYPES)[number]["value"] | "";

function siteTypeFromDetail(raw: string | null | undefined): SiteTypeFormValue {
  if (typeof raw !== "string") {
    return "";
  }
  const t = raw.trim();
  if (t === "") {
    return "";
  }
  return SITE_TYPES.some((s) => s.value === t) ? (t as (typeof SITE_TYPES)[number]["value"]) : "";
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** リスト内の挿入位置（ドラッグ中のユーザー除外後のインデックス 0…length） */
function insertionIndexFromPointerY(list: number[], rowElements: HTMLElement[], clientY: number, dragId: number): number {
  if (list.length === 0) {
    return 0;
  }
  for (let i = 0; i < list.length; i++) {
    const li = rowElements[i];
    if (!li) {
      break;
    }
    const r = li.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (clientY < mid) {
      return list.slice(0, i).filter((x) => x !== dragId).length;
    }
  }
  return list.filter((x) => x !== dragId).length;
}

function insertUserAt(listWithoutUser: number[], userId: number, index: number): number[] {
  const i = Math.max(0, Math.min(index, listWithoutUser.length));
  return [...listWithoutUser.slice(0, i), userId, ...listWithoutUser.slice(i)];
}

/** ドラッグ可能行: 取っ手アイコン＋枠線（Nielsen Norman Group の Drag–and–Drop で挙げる明示的な操作対象・フィードバックの考え方に沿う）。 */
function ParticipantDragRow({
  userId,
  label,
  onRemove,
  onDragStart,
  onDragEnd,
  insertBefore,
  insertAfter,
}: {
  userId: number;
  label: string;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  insertBefore?: boolean;
  insertAfter?: boolean;
}) {
  return (
    <li
      draggable
      data-participant-row
      data-user-id={userId}
      onDragStart={(e) => onDragStart(e, userId)}
      onDragEnd={onDragEnd}
      title="ドラッグして別の権限列へ移動"
      className={cn(
        "relative flex min-h-10 items-center justify-between gap-2 rounded-md border px-2 py-1.5",
        "border-[color:color-mix(in_srgb,var(--border)_92%,transparent)] bg-[var(--surface)]",
        "shadow-sm",
        "cursor-grab active:cursor-grabbing",
        "[&:active]:bg-[color:color-mix(in_srgb,var(--surface)_90%,var(--foreground)_10%)]",
        insertBefore &&
          "before:pointer-events-none before:absolute before:inset-x-1 before:top-0 before:z-[1] before:h-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)] before:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]",
        insertAfter &&
          "after:pointer-events-none after:absolute after:inset-x-1 after:bottom-0 after:z-[1] after:h-[3px] after:translate-y-1/2 after:rounded-full after:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)] after:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[var(--foreground)]">
        <GripVertical
          className="h-4 w-4 shrink-0 text-[color:color-mix(in_srgb,var(--muted)_95%,transparent)]"
          strokeWidth={2}
          aria-hidden
        />
        <span className="truncate">{label}</span>
      </span>
      <Button type="button" variant="destructive" size="sm" className="h-7 shrink-0 text-xs" onClick={onRemove}>
        Delete
      </Button>
    </li>
  );
}

/**
 * 空リストのヒント: 参加者名行と同じ min-h-10・px-2・shadow-sm。2行テキストは py-1・leading-none で min-h-10 内に収める。
 */
type UserSuggestApiRow = { id: number; email: string; display_name?: string | null };

function labelFromSuggestRow(row: UserSuggestApiRow): string {
  const dn = typeof row.display_name === "string" ? row.display_name.trim() : "";
  if (dn !== "") {
    return dn;
  }
  return row.email.trim() !== "" ? row.email.trim() : `user ${row.id}`;
}

function ParticipantAddInput({
  value,
  onChange,
  onConfirm,
  onPickUser,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onPickUser: (userId: number, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserSuggestApiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const t = value.trim();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (t === "") {
      setItems([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const u = new URL("/api/portal/user-suggest", window.location.origin);
          u.searchParams.set("q", t);
          const res = await fetch(u.toString(), { credentials: "include", cache: "no-store" });
          const data = (await res.json()) as { success?: boolean; users?: UserSuggestApiRow[] };
          if (res.ok && data.success && Array.isArray(data.users)) {
            setItems(data.users);
          } else {
            setItems([]);
          }
        } catch {
          setItems([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 280);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <Input
        className="h-8 min-w-0 flex-1 px-2 py-1 text-xs"
        placeholder="名前・メール・ID"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirm();
          }
        }}
      />
      {open && value.trim() !== "" ? (
        <div className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-56 overflow-y-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)] shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-xs text-[var(--muted)]">読み込み中…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--muted)]">候補がありません</p>
          ) : (
            items.map((row) => {
              const primary = labelFromSuggestRow(row);
              const em = row.email.trim();
              return (
                <button
                  key={row.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPickUser(row.id, primary);
                    setOpen(false);
                  }}
                >
                  <span className="block text-sm font-medium text-[var(--foreground)]">{primary}</span>
                  {primary !== em ? (
                    <span className="block truncate text-xs text-[var(--muted)]">{em}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function ParticipantEmptyListHint({ activeDrop }: { activeDrop: boolean }) {
  const lineClass =
    "block w-full text-[10px] leading-none tracking-tight [word-break:keep-all]";
  /** 列コンテナのドロップ時と同じ枠色（親の ring と二重にならないよう、内側は border のみ） */
  const activeBorderClass =
    "border-[color:color-mix(in_srgb,var(--accent)_55%,var(--border)_45%)]";
  return (
    <li
      className={cn(
        "list-none box-border flex min-h-10 flex-col items-center justify-center gap-0 rounded-md border px-2 py-1 text-center outline-none transition-[border-color,box-shadow,background-color,color] duration-150",
        "border-[color:color-mix(in_srgb,var(--border)_92%,transparent)] bg-[var(--surface)] text-[var(--muted)]",
        !activeDrop && "border-dashed shadow-sm",
        activeDrop &&
          cn(
            "border-solid",
            activeBorderClass,
            "bg-[color:color-mix(in_srgb,var(--surface)_96%,var(--accent)_4%)]",
            "text-[color:color-mix(in_srgb,var(--muted)_35%,var(--foreground)_65%)]",
          ),
      )}
      aria-hidden
    >
      {activeDrop ? (
        <>
          <span className={lineClass}>この位置に</span>
          <span className={lineClass}>挿入されます</span>
        </>
      ) : (
        <>
          <span className={lineClass}>追加欄に入力するか、</span>
          <span className={lineClass}>他列からドラッグしてください</span>
        </>
      )}
    </li>
  );
}

/** `http://` + 非 localhost ではセキュアコンテキスト外となり `randomUUID` が無いことがある */
function newRedmineRowId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type RedminePick = {
  redmine_project_id: number;
  redmine_base_url: string | null;
  /** Redmine API の name（詳細画面のリンク表示に使用） */
  redmine_project_name: string;
  label: string;
};

type SuggestProject = {
  id: number;
  name: string;
  identifier: string;
  redmine_base_url: string;
};

function RedmineSuggestRow({
  value,
  configured,
  onChange,
  onRemove,
}: {
  value: RedminePick | null;
  configured: boolean;
  onChange: (v: RedminePick | null) => void;
  onRemove: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<SuggestProject[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchSuggest = useCallback(
    async (query: string) => {
      if (!configured) {
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const u = new URL("/api/portal/redmine-project-suggest", window.location.origin);
        u.searchParams.set("q", query);
        const res = await fetch(u.toString(), { credentials: "include", cache: "no-store" });
        const text = await res.text();
        const data = JSON.parse(text) as { success?: boolean; projects?: SuggestProject[]; message?: string };
        if (!res.ok || !data.success) {
          setErr(data.message ?? `取得に失敗しました（${res.status}）`);
          setItems([]);
          return;
        }
        setItems(Array.isArray(data.projects) ? data.projects : []);
      } catch {
        setErr("接続に失敗しました。");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [configured],
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!configured) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void fetchSuggest(q);
    }, 280);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [q, configured, fetchSuggest]);

  const onFocus = () => {
    if (!configured) {
      return;
    }
    setOpen(true);
    void fetchSuggest(q);
  };

  return (
    <div ref={wrapRef} className="relative flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <Input
          type="text"
          className="w-full"
          placeholder={configured ? "プロジェクト名・identifier で検索（スペース=AND）" : "Redmine 未設定"}
          disabled={!configured}
          value={value ? value.label : q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            if (value) {
              onChange(null);
            }
            setOpen(true);
          }}
          onFocus={onFocus}
        />
        {open && configured ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)] shadow-lg">
            {loading ? (
              <p className="px-3 py-2 text-xs text-[var(--muted)]">読み込み中…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--muted)]">候補がありません</p>
            ) : (
              items.map((p) => (
                <button
                  key={`${p.id}-${p.identifier}`}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange({
                      redmine_project_id: p.id,
                      redmine_base_url: p.redmine_base_url,
                      redmine_project_name: p.name,
                      label: `${p.name} (${p.identifier})`,
                    });
                    setQ("");
                    setOpen(false);
                  }}
                >
                  {p.name} <span className="text-[var(--muted)]">({p.identifier})</span>
                </button>
              ))
            )}
          </div>
        ) : null}
        {err ? <p className="mt-1 text-xs text-red-500">{err}</p> : null}
      </div>
      <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
        Delete
      </Button>
    </div>
  );
}

export type ProjectCreateFormProps = {
  mode?: "create" | "edit";
  editProjectId?: number;
  initialDetail?: PortalProjectDetail;
  onEditCancel?: () => void;
  onEditSaved?: (savedProject: PortalProjectDetail) => void;
  /** 編集モードでフォームが初期値から変わったか（離脱確認用） */
  onEditDirtyChange?: (dirty: boolean) => void;
};

export function ProjectCreateForm({
  mode = "create",
  editProjectId,
  initialDetail,
  onEditCancel,
  onEditSaved,
  onEditDirtyChange,
}: ProjectCreateFormProps = {}) {
  const router = useRouter();
  const isEditMode = mode === "edit" && editProjectId !== undefined && initialDetail !== undefined;
  const idPrefix = isEditMode ? "pm-edit" : "pm-new";
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [redmineConfigured, setRedmineConfigured] = useState(false);

  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteType, setSiteType] = useState<SiteTypeFormValue>(() =>
    mode === "edit" && initialDetail !== undefined && editProjectId !== undefined
      ? siteTypeFromDetail(initialDetail.site_type)
      : "",
  );
  const [siteTypeOther, setSiteTypeOther] = useState(() =>
    mode === "edit" && initialDetail !== undefined && editProjectId !== undefined
      ? (initialDetail.site_type_other ?? "")
      : "",
  );
  const [isRenewal, setIsRenewal] = useState(false);
  const [renewalUrls, setRenewalUrls] = useState<string[]>([""]);
  const [kickoff, setKickoff] = useState("");
  const [releaseDue, setReleaseDue] = useState("");
  const [redmineRows, setRedmineRows] = useState<{ id: string; pick: RedminePick | null }[]>([]);
  const [miscLinks, setMiscLinks] = useState<{ label: string; url: string }[]>([{ label: "", url: "" }]);

  const [owners, setOwners] = useState<number[]>([]);
  const [editors, setEditors] = useState<number[]>([]);
  const [viewers, setViewers] = useState<number[]>([]);
  const [userLabels, setUserLabels] = useState<Record<number, string>>({});

  const [addOwnerInput, setAddOwnerInput] = useState("");
  const [addEditorInput, setAddEditorInput] = useState("");
  const [addViewerInput, setAddViewerInput] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** 編集モードで initialDetail から state を流し込み終わるまで dirty にしない */
  const [editFormHydrated, setEditFormHydrated] = useState(false);

  const participantsRef = useRef({ owners: [] as number[], editors: [] as number[], viewers: [] as number[] });
  participantsRef.current = { owners, editors, viewers };

  const ownerListRef = useRef<HTMLUListElement>(null);
  const editorListRef = useRef<HTMLUListElement>(null);
  const viewerListRef = useRef<HTMLUListElement>(null);
  const draggingUserIdRef = useRef<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ zone: "owner" | "editor" | "viewer"; index: number } | null>(null);
  const dropIndicatorRef = useRef(dropIndicator);
  dropIndicatorRef.current = dropIndicator;

  useEffect(() => {
    if (isEditMode) {
      return;
    }

    const load = async () => {
      try {
        const res = await fetch("/api/portal/me?unassigned_ok=1", { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as {
          success?: boolean;
          user?: { id?: number; display_name?: string; email?: string };
          redmine?: { configured?: boolean; base_url?: string | null };
        };
        if (res.ok && data.success && data.user?.id) {
          const uid = data.user.id;
          setMyUserId(uid);
          const dn = data.user.display_name?.trim() || null;
          const em = data.user.email?.trim() || null;
          setMyDisplayName(dn);
          setMyEmail(em);
          const label = dn || em || `user ${uid}`;
          setUserLabels((prev) => ({ ...prev, [uid]: label }));
          setOwners([uid]);
        }
        if (data.redmine?.configured) {
          setRedmineConfigured(true);
        }
      } catch {
        setFormError("セッション情報の取得に失敗しました。");
      }
    };
    void load();
  }, [isEditMode]);

  // 編集モードの初期値は描画前に同期する（useEffect だと Radix Select が空 value で
  // マウントしたあと DB 値の更新を取りこぼし、サイト種別だけ未選択に見えることがある）。
  useLayoutEffect(() => {
    if (!isEditMode || !initialDetail) {
      setEditFormHydrated(false);
      return;
    }
    // 編集中の再レンダーで initialDetail が再評価されても、
    // ユーザー入力中の state（site_type / participants など）を上書きしない。
    if (editFormHydrated) {
      return;
    }
    setEditFormHydrated(false);
    const d = initialDetail;
    setName(d.name);
    setClientName(d.client_name ?? "");
    setSiteType(siteTypeFromDetail(d.site_type));
    setSiteTypeOther(d.site_type_other ?? "");
    setIsRenewal(d.is_renewal);
    setRenewalUrls(d.renewal_urls.length > 0 ? d.renewal_urls : [""]);
    setKickoff(d.kickoff_date ?? "");
    setReleaseDue(d.release_due_date ?? "");
    setRedmineRows(
      d.redmine_links.length > 0
        ? d.redmine_links.map((r) => ({
            id: newRedmineRowId(),
            pick: {
              redmine_project_id: r.redmine_project_id,
              redmine_base_url: r.redmine_base_url,
              redmine_project_name: r.redmine_project_name?.trim() ?? "",
              label:
                r.redmine_project_name && r.redmine_project_name.trim() !== ""
                  ? `${r.redmine_project_name.trim()} (${r.redmine_project_id})`
                  : `Redmine #${r.redmine_project_id}`,
            },
          }))
        : [],
    );
    const misc = d.misc_links.length > 0 ? d.misc_links.map((m) => ({ label: m.label, url: m.url })) : [{ label: "", url: "" }];
    setMiscLinks(misc);
    const o: number[] = [];
    const e: number[] = [];
    const v: number[] = [];
    const labels: Record<number, string> = {};
    for (const p of d.participants) {
      const lab = p.display_name?.trim() || `user ${p.user_id}`;
      labels[p.user_id] = lab;
      if (p.role === "owner") {
        o.push(p.user_id);
      } else if (p.role === "editor") {
        e.push(p.user_id);
      } else {
        v.push(p.user_id);
      }
    }
    setOwners(o);
    setEditors(e);
    setViewers(v);
    setUserLabels((prev) => ({ ...prev, ...labels }));

    void (async () => {
      try {
        const res = await fetch("/api/portal/me?unassigned_ok=1", { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as {
          success?: boolean;
          user?: { id?: number; display_name?: string; email?: string };
          redmine?: { configured?: boolean };
        };
        if (res.ok && data.success && data.user?.id) {
          const uid = data.user.id;
          setMyUserId(uid);
          const dn = data.user.display_name?.trim() || null;
          const em = data.user.email?.trim() || null;
          setMyDisplayName(dn);
          setMyEmail(em);
          const label = dn || em || `user ${uid}`;
          setUserLabels((prev) => ({ ...prev, [uid]: label }));
        }
        if (data.redmine?.configured) {
          setRedmineConfigured(true);
        }
      } catch {
        setFormError("セッション情報の取得に失敗しました。");
      }
    })();

    setEditFormHydrated(true);
  }, [isEditMode, initialDetail, editFormHydrated]);

  const editFingerprintBaseline = useMemo(
    () => (isEditMode && initialDetail ? projectEditFormFingerprintFromDetail(initialDetail) : null),
    [isEditMode, initialDetail],
  );

  const editFingerprintCurrent = useMemo(
    () =>
      projectEditFormFingerprintFromFormState({
        name,
        clientName,
        siteType,
        siteTypeOther,
        isRenewal,
        renewalUrls,
        kickoff,
        releaseDue,
        redmineRows,
        miscLinks,
        owners,
        editors,
        viewers,
      }),
    [
      name,
      clientName,
      siteType,
      siteTypeOther,
      isRenewal,
      renewalUrls,
      kickoff,
      releaseDue,
      redmineRows,
      miscLinks,
      owners,
      editors,
      viewers,
    ],
  );

  const editFormDirty =
    Boolean(isEditMode && initialDetail && editFormHydrated && editFingerprintBaseline !== null) &&
    editFingerprintCurrent !== editFingerprintBaseline;

  useEffect(() => {
    if (!isEditMode) {
      onEditDirtyChange?.(false);
      return;
    }
    onEditDirtyChange?.(editFormDirty);
  }, [isEditMode, editFormDirty, onEditDirtyChange]);

  const addRedmineRow = () => {
    setRedmineRows((r) => [...r, { id: newRedmineRowId(), pick: null }]);
  };

  const openSettings = () => {
    window.dispatchEvent(new Event("open-redmine-settings"));
  };

  const moveBetween = useCallback((userId: number, to: "owner" | "editor" | "viewer", insertIndex?: number) => {
    setFormError(null);
    const { owners: o0, editors: e0, viewers: v0 } = participantsRef.current;
    if (o0.includes(userId) && to !== "owner") {
      const nextOwners = o0.filter((x) => x !== userId);
      if (nextOwners.length === 0) {
        setFormError("オーナーは少なくとも1名必要です。");
        return;
      }
    }
    const o = o0.filter((x) => x !== userId);
    const e = e0.filter((x) => x !== userId);
    const v = v0.filter((x) => x !== userId);
    const idxIn = (baseLen: number) =>
      insertIndex === undefined ? baseLen : Math.max(0, Math.min(insertIndex, baseLen));
    if (to === "owner") {
      setOwners(insertUserAt(o, userId, idxIn(o.length)));
      setEditors(e);
      setViewers(v);
    } else if (to === "editor") {
      setOwners(o);
      setEditors(insertUserAt(e, userId, idxIn(e.length)));
      setViewers(v);
    } else {
      setOwners(o);
      setEditors(e);
      setViewers(insertUserAt(v, userId, idxIn(v.length)));
    }
  }, []);

  const onDragStart = (e: React.DragEvent, userId: number) => {
    draggingUserIdRef.current = userId;
    e.dataTransfer.setData("text/user-id", String(userId));
    e.dataTransfer.effectAllowed = "move";
  };

  const clearDragUi = useCallback(() => {
    draggingUserIdRef.current = null;
    setDropIndicator(null);
  }, []);

  const showInsertionLine = (zone: "owner" | "editor" | "viewer", at: number) =>
    dropIndicator?.zone === zone && dropIndicator.index === at;

  const updateDropIndicator = useCallback((zone: "owner" | "editor" | "viewer", clientY: number) => {
    const dragId = draggingUserIdRef.current;
    if (dragId === null) {
      return;
    }
    const { owners: o, editors: ed, viewers: vi } = participantsRef.current;
    const list = zone === "owner" ? o : zone === "editor" ? ed : vi;
    const ref = zone === "owner" ? ownerListRef : zone === "editor" ? editorListRef : viewerListRef;
    const ul = ref.current;
    if (!ul) {
      return;
    }
    const rows = [...ul.querySelectorAll<HTMLElement>(":scope > li[data-participant-row]")];
    const idx = insertionIndexFromPointerY(list, rows, clientY, dragId);
    setDropIndicator((prev) => (prev?.zone === zone && prev.index === idx ? prev : { zone, index: idx }));
  }, []);

  const onListDragOver = (e: React.DragEvent, zone: "owner" | "editor" | "viewer") => {
    if (draggingUserIdRef.current === null) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    updateDropIndicator(zone, e.clientY);
  };

  const onColumnDragOver = (e: React.DragEvent, zone: "owner" | "editor" | "viewer") => {
    if (draggingUserIdRef.current === null) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const { owners: o, editors: ed, viewers: vi } = participantsRef.current;
    const list = zone === "owner" ? o : zone === "editor" ? ed : vi;
    const ref = zone === "owner" ? ownerListRef : zone === "editor" ? editorListRef : viewerListRef;
    const ul = ref.current;
    if (ul && list.length > 0 && ul.querySelector(":scope > li[data-participant-row]")) {
      updateDropIndicator(zone, e.clientY);
    } else {
      setDropIndicator({ zone, index: 0 });
    }
  };

  const onDropZone = (e: React.DragEvent, zone: "owner" | "editor" | "viewer") => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/user-id");
    const uid = Number.parseInt(raw, 10);
    if (!Number.isFinite(uid) || uid <= 0) {
      clearDragUi();
      return;
    }
    const di = dropIndicatorRef.current;
    const ind = di?.zone === zone ? di.index : undefined;
    moveBetween(uid, zone, ind);
    clearDragUi();
  };

  const removeParticipant = (userId: number) => {
    setFormError(null);
    const { owners: o0, editors: e0, viewers: v0 } = participantsRef.current;
    if (o0.includes(userId) && o0.length === 1) {
      setFormError("オーナーは少なくとも1名必要です。");
      return;
    }
    setOwners(o0.filter((x) => x !== userId));
    setEditors(e0.filter((x) => x !== userId));
    setViewers(v0.filter((x) => x !== userId));
  };

  const resolveParticipantInput = useCallback(
    async (raw: string): Promise<{ ok: true; userId: number; label: string } | { ok: false; message: string }> => {
      const t = raw.trim();
      if (t === "") {
        return { ok: false, message: "入力が空です。" };
      }
      const n = norm(t);

      if (myUserId !== null) {
        const dn = myDisplayName?.trim();
        const em = myEmail?.trim();
        if (dn && n === norm(dn)) {
          return { ok: true, userId: myUserId, label: dn };
        }
        if (em && n === norm(em)) {
          return { ok: true, userId: myUserId, label: dn || em };
        }
      }

      try {
        const u = new URL("/api/portal/user-suggest", window.location.origin);
        u.searchParams.set("q", t);
        const res = await fetch(u.toString(), { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as {
          success?: boolean;
          users?: UserSuggestApiRow[];
          message?: string;
        };
        if (!res.ok || !data.success) {
          return { ok: false, message: data.message ?? "ユーザー検索に失敗しました。" };
        }
        const list = Array.isArray(data.users) ? data.users : [];
        if (list.length === 1) {
          const row = list[0];
          return { ok: true, userId: row.id, label: labelFromSuggestRow(row) };
        }
        if (list.length === 0) {
          return {
            ok: false,
            message: "該当するユーザーがいません。名前・メール・ユーザーID（数字）で検索してください。",
          };
        }
        return { ok: false, message: "候補が複数あります。一覧から選ぶか、名前・メール・IDで絞り込んでください。" };
      } catch {
        return { ok: false, message: "ユーザー検索に接続できませんでした。" };
      }
    },
    [myDisplayName, myEmail, myUserId],
  );

  const handleAddParticipant = useCallback(
    async (zone: "owner" | "editor" | "viewer") => {
      const raw = zone === "owner" ? addOwnerInput : zone === "editor" ? addEditorInput : addViewerInput;
      setFormError(null);
      const resolved = await resolveParticipantInput(raw);
      if (!resolved.ok) {
        setFormError(resolved.message);
        return;
      }
      const { userId, label } = resolved;

      moveBetween(userId, zone);
      setUserLabels((prev) => ({ ...prev, [userId]: label }));
      if (zone === "owner") {
        setAddOwnerInput("");
      } else if (zone === "editor") {
        setAddEditorInput("");
      } else {
        setAddViewerInput("");
      }
    },
    [addEditorInput, addOwnerInput, addViewerInput, moveBetween, resolveParticipantInput],
  );

  const handlePickParticipant = useCallback(
    (zone: "owner" | "editor" | "viewer", userId: number, label: string) => {
      setFormError(null);
      moveBetween(userId, zone);
      setUserLabels((prev) => ({ ...prev, [userId]: label }));
      if (zone === "owner") {
        setAddOwnerInput("");
      } else if (zone === "editor") {
        setAddEditorInput("");
      } else {
        setAddViewerInput("");
      }
    },
    [moveBetween],
  );

  useEffect(() => {
    const onUpdated = () => {
      void fetch("/api/portal/me?unassigned_ok=1", { credentials: "include", cache: "no-store" })
        .then((r) => r.json())
        .then((data: { redmine?: { configured?: boolean } }) => {
          setRedmineConfigured(!!data.redmine?.configured);
        })
        .catch(() => {});
    };
    window.addEventListener("redmine-config-updated", onUpdated);
    return () => window.removeEventListener("redmine-config-updated", onUpdated);
  }, []);

  const labelFor = (uid: number) => userLabels[uid] ?? `user ${uid}`;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!siteType) {
      setFormError("サイト種別を選択してください。");
      return;
    }
    if (owners.length < 1) {
      setFormError("オーナーは少なくとも1名指定してください。");
      return;
    }
    if (myUserId !== null) {
      const all = [...owners, ...editors, ...viewers];
      if (!all.includes(myUserId)) {
        setFormError("案件を登録する本人を、オーナー・編集・参照のいずれかに含めてください。");
        return;
      }
    }
    const parsed = portalProjectCreateBodySchema.safeParse({
      name: name.trim(),
      client_name: clientName.trim() === "" ? null : clientName.trim(),
      site_type: siteType,
      site_type_other: siteType === "other" ? siteTypeOther.trim() : null,
      is_renewal: isRenewal,
      renewal_urls: isRenewal ? renewalUrls.map((u) => u.trim()).filter(Boolean) : [],
      kickoff_date: kickoff.trim() === "" ? null : kickoff.trim(),
      release_due_date: releaseDue.trim() === "" ? null : releaseDue.trim(),
      redmine_links:
        redmineRows
          .map((row) => row.pick)
          .filter((p): p is RedminePick => p !== null)
          .map((p) => ({
            redmine_project_id: p.redmine_project_id,
            redmine_base_url: p.redmine_base_url,
            ...(p.redmine_project_name.trim() !== ""
              ? { redmine_project_name: p.redmine_project_name.trim() }
              : {}),
          })) ?? [],
      misc_links: miscLinks
        .map((m) => ({ label: m.label.trim(), url: m.url.trim() }))
        .filter((m) => m.label !== "" && m.url !== ""),
      participants: [
        ...owners.map((user_id) => ({ user_id, role: "owner" as const })),
        ...editors.map((user_id) => ({ user_id, role: "editor" as const })),
        ...viewers.map((user_id) => ({ user_id, role: "viewer" as const })),
      ],
    });

    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "入力内容を確認してください。";
      setFormError(msg);
      return;
    }

    if (isEditMode && editProjectId !== undefined) {
      const patchParsed = portalProjectPatchBodySchema.safeParse({
        ...parsed.data,
        project_id: editProjectId,
      });
      if (!patchParsed.success) {
        const msg = patchParsed.error.issues[0]?.message ?? "入力内容を確認してください。";
        setFormError(msg);
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetch("/api/portal/project", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(patchParsed.data),
        });
        const text = await res.text();
        const savedProject = parsePortalProjectSuccess(text);
        if (!res.ok || !savedProject) {
          try {
            const j = JSON.parse(text) as { message?: string };
            setFormError(j.message ?? `更新に失敗しました（${res.status}）`);
          } catch {
            setFormError(`更新に失敗しました（${res.status}）`);
          }
          return;
        }
        onEditSaved?.(savedProject);
        router.refresh();
      } catch {
        setFormError("通信に失敗しました。");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const text = await res.text();
      let pid: number | null = null;
      try {
        const j = JSON.parse(text.trim()) as { success?: boolean; project?: { id?: unknown }; message?: string };
        if (j.success !== true || j.project == null || typeof j.project !== "object") {
          setFormError(typeof j.message === "string" && j.message !== "" ? j.message : `登録に失敗しました（${res.status}）`);
          return;
        }
        const rawId = j.project.id;
        if (typeof rawId === "number" && Number.isFinite(rawId) && rawId > 0) {
          pid = rawId;
        } else if (typeof rawId === "string" && /^\d+$/.test(rawId)) {
          const n = Number.parseInt(rawId, 10);
          if (Number.isFinite(n) && n > 0) {
            pid = n;
          }
        }
      } catch {
        setFormError(`登録応答の解析に失敗しました（HTTP ${res.status}）。`);
        return;
      }
      if (!res.ok || pid === null) {
        try {
          const j = JSON.parse(text.trim()) as { message?: string };
          setFormError(j.message ?? `登録に失敗しました（${res.status}）`);
        } catch {
          setFormError(`登録に失敗しました（${res.status}）`);
        }
        return;
      }
      router.push(`/project-list/${pid}`);
    } catch {
      setFormError("通信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-8" onSubmit={onSubmit} noValidate>
      <section className="space-y-3">
        <h2 className="pm-section-heading">基本情報</h2>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-name`}>
            プロジェクト名 <span className="text-red-500">*</span>
          </Label>
          <Input
            id={`${idPrefix}-name`}
            required
            className="mt-1 w-1/2 max-w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-client`}>クライアント名</Label>
          <Input id={`${idPrefix}-client`} className="mt-1 w-1/2 max-w-full" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-site-type`}>
            サイト種別 <span className="text-red-500">*</span>
          </Label>
          <Select
            required
            name={`${idPrefix}-site-type`}
            value={siteType === "" ? "__none__" : siteType}
            onValueChange={(v) => setSiteType(v === "__none__" ? "" : (v as typeof siteType))}
          >
            <SelectTrigger id={`${idPrefix}-site-type`} className="mt-1 w-1/6 max-w-full">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">選択してください</SelectItem>
              {SITE_TYPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {siteType === "other" ? (
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-site-other`}>
              その他の説明 <span className="text-red-500">*</span>
            </Label>
            <Input
              id={`${idPrefix}-site-other`}
              required
              className="mt-1 w-1/2 max-w-full"
              value={siteTypeOther}
              onChange={(e) => setSiteTypeOther(e.target.value)}
            />
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="pm-section-heading">区分</h2>
        <div className="flex gap-4 text-sm">
          <Label className="flex cursor-pointer items-center gap-2 text-[var(--foreground)]">
            <input
              id="pm-project-create-renewal-new"
              name="pm-project-create-renewal"
              type="radio"
              className="accent-[var(--accent)]"
              checked={!isRenewal}
              onChange={() => setIsRenewal(false)}
            />
            新規
          </Label>
          <Label className="flex cursor-pointer items-center gap-2 text-[var(--foreground)]">
            <input
              id="pm-project-create-renewal-renewal"
              name="pm-project-create-renewal"
              type="radio"
              className="accent-[var(--accent)]"
              checked={isRenewal}
              onChange={() => setIsRenewal(true)}
            />
            リニューアル
          </Label>
        </div>
        {isRenewal ? (
          <div className="w-1/2 max-w-full space-y-2">
            {renewalUrls.map((u, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="min-w-0 flex-1"
                  placeholder="https://..."
                  value={u}
                  onChange={(e) => {
                    const next = [...renewalUrls];
                    next[i] = e.target.value;
                    setRenewalUrls(next);
                  }}
                />
                <Button type="button" variant="destructive" size="sm" onClick={() => setRenewalUrls((r) => r.filter((_, j) => j !== i))}>
                  Delete
                </Button>
              </div>
            ))}
            <Button type="button" variant="default" size="sm" onClick={() => setRenewalUrls((r) => [...r, ""])}>
              行を追加
            </Button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-8">
        <ThemeDateField className="min-w-[12.5rem] max-w-full sm:w-auto" label="キックオフ日" value={kickoff} onChange={setKickoff} />
        <ThemeDateField className="min-w-[12.5rem] max-w-full sm:w-auto" label="リリース予定日" value={releaseDue} onChange={setReleaseDue} />
      </section>

      <section className="space-y-3">
        <h2 className="pm-section-heading">Redmine</h2>
        {redmineConfigured ? (
          <div className="w-1/2 max-w-full space-y-2">
            {redmineRows.map((row) => (
              <RedmineSuggestRow
                key={row.id}
                value={row.pick}
                configured={redmineConfigured}
                onChange={(v) => {
                  setRedmineRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, pick: v } : r)));
                }}
                onRemove={() => setRedmineRows((rows) => rows.filter((r) => r.id !== row.id))}
              />
            ))}
            <Button type="button" variant="default" size="sm" onClick={addRedmineRow}>
              行を追加
            </Button>
          </div>
        ) : (
          <div className="w-1/2 max-w-full rounded-lg border border-amber-500/30 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] p-4 text-sm">
            <p>ヘッダーの設定で Redmine の URL と API キーを登録すると、プロジェクトを検索して紐づけできます（議事録のユーザー設定と共通です）。</p>
            <Button type="button" variant="accent" className="mt-3" size="sm" onClick={openSettings}>
              設定を開く
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="pm-section-heading">各種リンク</h2>
        <div className="w-1/2 max-w-full space-y-2">
          {miscLinks.map((m, i) => (
            <div key={i} className="flex gap-2">
              <Input
                className="min-w-0 w-36 shrink-0"
                placeholder="表示名"
                value={m.label}
                onChange={(e) => {
                  const n = [...miscLinks];
                  n[i] = { ...n[i], label: e.target.value };
                  setMiscLinks(n);
                }}
              />
              <Input
                className="min-w-0 flex-1"
                placeholder="https://..."
                value={m.url}
                onChange={(e) => {
                  const n = [...miscLinks];
                  n[i] = { ...n[i], url: e.target.value };
                  setMiscLinks(n);
                }}
              />
              <Button type="button" variant="destructive" size="sm" onClick={() => setMiscLinks((rows) => rows.filter((_, j) => j !== i))}>
                Delete
              </Button>
            </div>
          ))}
          <Button type="button" variant="default" size="sm" onClick={() => setMiscLinks((rows) => [...rows, { label: "", url: "" }])}>
            行を追加
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="pm-section-heading">参加者</h2>
        <p className="text-xs text-[var(--muted)]">
          名前・メール・ユーザーID（数字）で検索し、候補から選ぶか Enter /「追加」で確定します。オーナーは少なくとも1名、かつ案件を登録する本人はオーナー・編集・参照のいずれかに含めてください。取っ手（⋮⋮）をドラッグすると列間で移動できます。
        </p>
        <div className="grid w-full max-w-4xl gap-4 md:grid-cols-3">
          <div
            className={cn(
              "min-h-[120px] rounded-lg border bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] p-3 transition-[box-shadow,ring] duration-150",
              dropIndicator?.zone === "owner"
                ? "border-[color:color-mix(in_srgb,var(--accent)_55%,var(--border)_45%)] ring-2 ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                : "border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]",
            )}
            onDragOver={(e) => onColumnDragOver(e, "owner")}
            onDrop={(e) => onDropZone(e, "owner")}
          >
            <p className="mb-2 text-xs font-medium text-[var(--muted)]">{PROJECT_ROLE_LABEL_JA.owner}</p>
            <div className="mb-2 flex gap-2">
              <ParticipantAddInput
                value={addOwnerInput}
                onChange={setAddOwnerInput}
                onConfirm={() => void handleAddParticipant("owner")}
                onPickUser={(userId, label) => handlePickParticipant("owner", userId, label)}
              />
              <Button type="button" size="sm" variant="default" onClick={() => void handleAddParticipant("owner")}>
                追加
              </Button>
            </div>
            <ul ref={ownerListRef} className="space-y-2" onDragOver={(e) => onListDragOver(e, "owner")}>
              {owners.length === 0 ? (
                <ParticipantEmptyListHint activeDrop={!!showInsertionLine("owner", 0)} />
              ) : (
                owners.map((uid, i) => (
                  <ParticipantDragRow
                    key={uid}
                    userId={uid}
                    label={labelFor(uid)}
                    insertBefore={!!showInsertionLine("owner", i)}
                    insertAfter={!!(showInsertionLine("owner", owners.length) && i === owners.length - 1)}
                    onRemove={() => removeParticipant(uid)}
                    onDragStart={onDragStart}
                    onDragEnd={clearDragUi}
                  />
                ))
              )}
            </ul>
          </div>
          <div
            className={cn(
              "min-h-[120px] rounded-lg border bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] p-3 transition-[box-shadow,ring] duration-150",
              dropIndicator?.zone === "editor"
                ? "border-[color:color-mix(in_srgb,var(--accent)_55%,var(--border)_45%)] ring-2 ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                : "border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]",
            )}
            onDragOver={(e) => onColumnDragOver(e, "editor")}
            onDrop={(e) => onDropZone(e, "editor")}
          >
            <p className="mb-2 text-xs font-medium text-[var(--muted)]">{PROJECT_ROLE_LABEL_JA.editor}</p>
            <div className="mb-2 flex gap-2">
              <ParticipantAddInput
                value={addEditorInput}
                onChange={setAddEditorInput}
                onConfirm={() => void handleAddParticipant("editor")}
                onPickUser={(userId, label) => handlePickParticipant("editor", userId, label)}
              />
              <Button type="button" size="sm" variant="default" onClick={() => void handleAddParticipant("editor")}>
                追加
              </Button>
            </div>
            <ul ref={editorListRef} className="space-y-2" onDragOver={(e) => onListDragOver(e, "editor")}>
              {editors.length === 0 ? (
                <ParticipantEmptyListHint activeDrop={!!showInsertionLine("editor", 0)} />
              ) : (
                editors.map((uid, i) => (
                  <ParticipantDragRow
                    key={uid}
                    userId={uid}
                    label={labelFor(uid)}
                    insertBefore={!!showInsertionLine("editor", i)}
                    insertAfter={!!(showInsertionLine("editor", editors.length) && i === editors.length - 1)}
                    onRemove={() => removeParticipant(uid)}
                    onDragStart={onDragStart}
                    onDragEnd={clearDragUi}
                  />
                ))
              )}
            </ul>
          </div>
          <div
            className={cn(
              "min-h-[120px] rounded-lg border bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] p-3 transition-[box-shadow,ring] duration-150",
              dropIndicator?.zone === "viewer"
                ? "border-[color:color-mix(in_srgb,var(--accent)_55%,var(--border)_45%)] ring-2 ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                : "border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]",
            )}
            onDragOver={(e) => onColumnDragOver(e, "viewer")}
            onDrop={(e) => onDropZone(e, "viewer")}
          >
            <p className="mb-2 text-xs font-medium text-[var(--muted)]">{PROJECT_ROLE_LABEL_JA.viewer}</p>
            <div className="mb-2 flex gap-2">
              <ParticipantAddInput
                value={addViewerInput}
                onChange={setAddViewerInput}
                onConfirm={() => void handleAddParticipant("viewer")}
                onPickUser={(userId, label) => handlePickParticipant("viewer", userId, label)}
              />
              <Button type="button" size="sm" variant="default" onClick={() => void handleAddParticipant("viewer")}>
                追加
              </Button>
            </div>
            <ul ref={viewerListRef} className="space-y-2" onDragOver={(e) => onListDragOver(e, "viewer")}>
              {viewers.length === 0 ? (
                <ParticipantEmptyListHint activeDrop={!!showInsertionLine("viewer", 0)} />
              ) : (
                viewers.map((uid, i) => (
                  <ParticipantDragRow
                    key={uid}
                    userId={uid}
                    label={labelFor(uid)}
                    insertBefore={!!showInsertionLine("viewer", i)}
                    insertAfter={!!(showInsertionLine("viewer", viewers.length) && i === viewers.length - 1)}
                    onRemove={() => removeParticipant(uid)}
                    onDragStart={onDragStart}
                    onDragEnd={clearDragUi}
                  />
                ))
              )}
            </ul>
          </div>
        </div>
      </section>

      {formError ? (
        <p className="text-sm text-red-500" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        {submitting ? (
          <>
            <Button type="button" variant="default" disabled className="min-w-[7rem]">
              キャンセル
            </Button>
            <Button type="button" variant="accent" disabled className="min-w-[7rem]">
              Saving…
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="default"
              className="min-w-[7rem]"
              onClick={() => {
                if (isEditMode) {
                  if (editFormDirty && !window.confirm(UNSAVED_LEAVE_CONFIRM_MESSAGE)) {
                    return;
                  }
                  onEditCancel?.();
                } else {
                  router.push("/project-list");
                }
              }}
            >
              キャンセル
            </Button>
            <Button type="submit" variant="accent" className="min-w-[7rem]">
              Save
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
