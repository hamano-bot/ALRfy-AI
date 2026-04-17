"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ThemeDateField } from "@/app/components/ThemeDateField";
import { Button } from "@/app/components/ui/button";
import { Input, inputBaseClassName } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { portalProjectCreateBodySchema } from "@/lib/portal-project-create-body";
import { cn } from "@/lib/utils";

const SITE_TYPES = [
  { value: "corporate", label: "コーポレート" },
  { value: "ec", label: "EC" },
  { value: "member_portal", label: "会員ポータル" },
  { value: "internal_portal", label: "社内ポータル" },
  { value: "owned_media", label: "オウンドメディア" },
  { value: "product_portal", label: "製品ポータル" },
  { value: "other", label: "その他" },
] as const;

type RedminePick = {
  redmine_project_id: number;
  redmine_base_url: string | null;
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

  const fetchSuggest = useCallback(async (query: string) => {
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
  }, [configured]);

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

export function ProjectCreateForm() {
  const router = useRouter();
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [redmineConfigured, setRedmineConfigured] = useState(false);

  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteType, setSiteType] = useState<(typeof SITE_TYPES)[number]["value"] | "">("");
  const [siteTypeOther, setSiteTypeOther] = useState("");
  const [isRenewal, setIsRenewal] = useState(false);
  const [renewalUrls, setRenewalUrls] = useState<string[]>([""]);
  const [kickoff, setKickoff] = useState("");
  const [releaseDue, setReleaseDue] = useState("");
  const [redmineRows, setRedmineRows] = useState<{ id: string; pick: RedminePick | null }[]>([]);
  const [miscLinks, setMiscLinks] = useState<{ label: string; url: string }[]>([{ label: "", url: "" }]);

  const [editors, setEditors] = useState<number[]>([]);
  const [viewers, setViewers] = useState<number[]>([]);
  const [addEditorId, setAddEditorId] = useState("");
  const [addViewerId, setAddViewerId] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/portal/me?unassigned_ok=1", { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as {
          success?: boolean;
          user?: { id?: number };
          redmine?: { configured?: boolean; base_url?: string | null };
        };
        if (res.ok && data.success && data.user?.id) {
          setMyUserId(data.user.id);
          setEditors([data.user.id]);
        }
        if (data.redmine?.configured) {
          setRedmineConfigured(true);
        }
      } catch {
        setFormError("セッション情報の取得に失敗しました。");
      }
    };
    void load();
  }, []);

  const addRedmineRow = () => {
    setRedmineRows((r) => [...r, { id: crypto.randomUUID(), pick: null }]);
  };

  const openSettings = () => {
    window.dispatchEvent(new Event("open-redmine-settings"));
  };

  const moveBetween = useCallback(
    (userId: number, to: "editor" | "viewer") => {
      if (myUserId !== null && userId === myUserId) {
        return;
      }
      setEditors((e) => e.filter((x) => x !== userId));
      setViewers((v) => v.filter((x) => x !== userId));
      if (to === "editor") {
        setEditors((e) => (e.includes(userId) ? e : [...e, userId]));
      } else {
        setViewers((v) => (v.includes(userId) ? v : [...v, userId]));
      }
    },
    [myUserId],
  );

  const onDragStart = (e: React.DragEvent, userId: number) => {
    e.dataTransfer.setData("text/user-id", String(userId));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropZone = (e: React.DragEvent, zone: "editor" | "viewer") => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/user-id");
    const uid = Number.parseInt(raw, 10);
    if (!Number.isFinite(uid) || uid <= 0) {
      return;
    }
    moveBetween(uid, zone === "editor" ? "editor" : "viewer");
  };

  const removeParticipant = (userId: number) => {
    if (myUserId !== null && userId === myUserId) {
      return;
    }
    setEditors((e) => e.filter((x) => x !== userId));
    setViewers((v) => v.filter((x) => x !== userId));
  };

  const addByInput = (raw: string, col: "editor" | "viewer") => {
    const n = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) {
      return;
    }
    moveBetween(n, col);
  };

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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!siteType) {
      setFormError("サイト種別を選択してください。");
      return;
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
          })) ?? [],
      misc_links: miscLinks
        .map((m) => ({ label: m.label.trim(), url: m.url.trim() }))
        .filter((m) => m.label !== "" && m.url !== ""),
      participants: [
        ...editors
          .filter((uid) => myUserId === null || uid !== myUserId)
          .map((user_id) => ({ user_id, role: "editor" as const })),
        ...viewers
          .filter((uid) => myUserId === null || uid !== myUserId)
          .map((user_id) => ({ user_id, role: "viewer" as const })),
      ],
    });

    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "入力内容を確認してください。";
      setFormError(msg);
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
        const j = JSON.parse(text) as { success?: boolean; project?: { id?: number } };
        if (j.project?.id) {
          pid = j.project.id;
        }
      } catch {
        /* ignore */
      }
      if (!res.ok || !pid) {
        try {
          const j = JSON.parse(text) as { message?: string };
          setFormError(j.message ?? `登録に失敗しました（${res.status}）`);
        } catch {
          setFormError(`登録に失敗しました（${res.status}）`);
        }
        return;
      }
      router.push(`/project-manager/${pid}`);
    } catch {
      setFormError("通信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-8" onSubmit={onSubmit} noValidate>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">基本情報</h2>
        <div className="space-y-1">
          <Label htmlFor="pm-new-name">
            プロジェクト名 <span className="text-red-500">*</span>
          </Label>
          <Input
            id="pm-new-name"
            required
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pm-new-client">クライアント名</Label>
          <Input id="pm-new-client" className="mt-1" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pm-new-site-type">
            サイト種別 <span className="text-red-500">*</span>
          </Label>
          <select
            id="pm-new-site-type"
            required
            className={cn(inputBaseClassName, "mt-1 cursor-pointer")}
            value={siteType}
            onChange={(e) => setSiteType(e.target.value as typeof siteType)}
          >
            <option value="">選択してください</option>
            {SITE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {siteType === "other" ? (
          <div className="space-y-1">
            <Label htmlFor="pm-new-site-other">
              その他の説明 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pm-new-site-other"
              required
              className="mt-1"
              value={siteTypeOther}
              onChange={(e) => setSiteTypeOther(e.target.value)}
            />
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">リニューアル</h2>
        <div className="flex gap-4 text-sm">
          <Label className="flex cursor-pointer items-center gap-2 text-[var(--foreground)]">
            <input
              type="radio"
              className="accent-[var(--accent)]"
              checked={!isRenewal}
              onChange={() => setIsRenewal(false)}
            />
            新規
          </Label>
          <Label className="flex cursor-pointer items-center gap-2 text-[var(--foreground)]">
            <input
              type="radio"
              className="accent-[var(--accent)]"
              checked={isRenewal}
              onChange={() => setIsRenewal(true)}
            />
            リニューアル
          </Label>
        </div>
        {isRenewal ? (
          <div className="space-y-2">
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
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setRenewalUrls((r) => r.filter((_, j) => j !== i))}
                >
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

      <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-8">
        <ThemeDateField label="キックオフ日" value={kickoff} onChange={setKickoff} />
        <ThemeDateField label="リリース予定日" value={releaseDue} onChange={setReleaseDue} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Redmine</h2>
        {redmineConfigured ? (
          <>
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
          </>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-[color:color-mix(in_srgb,var(--surface)_92%,amber_8%)] p-4 text-sm">
            <p>ヘッダーの設定で Redmine の URL と API キーを登録すると、プロジェクトを検索して紐づけできます（議事録のユーザー設定と共通です）。</p>
            <Button type="button" variant="accent" className="mt-3" size="sm" onClick={openSettings}>
              設定を開く
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">各種リンク</h2>
        {miscLinks.map((m, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <Input
              className="min-w-[8rem] flex-1"
              placeholder="表示名"
              value={m.label}
              onChange={(e) => {
                const n = [...miscLinks];
                n[i] = { ...n[i], label: e.target.value };
                setMiscLinks(n);
              }}
            />
            <Input
              className="min-w-[12rem] flex-[2]"
              placeholder="https://..."
              value={m.url}
              onChange={(e) => {
                const n = [...miscLinks];
                n[i] = { ...n[i], url: e.target.value };
                setMiscLinks(n);
              }}
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setMiscLinks((rows) => rows.filter((_, j) => j !== i))}
            >
              Delete
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => setMiscLinks((rows) => [...rows, { label: "", url: "" }])}
        >
          行を追加
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">参加者</h2>
        <p className="text-xs text-[var(--muted)]">
          編集権限・参照権限のリストにユーザーを追加し、ドラッグで移動できます。登録者は編集側に固定です。
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div
            className="min-h-[120px] rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDropZone(e, "editor")}
          >
            <p className="mb-2 text-xs font-medium text-[var(--muted)]">編集権限</p>
            <div className="mb-2 flex gap-2">
              <Input
                className="h-8 min-w-0 flex-1 px-2 py-1 text-xs"
                placeholder="user_id"
                value={addEditorId}
                onChange={(e) => setAddEditorId(e.target.value)}
              />
              <Button type="button" size="sm" variant="default" onClick={() => { addByInput(addEditorId, "editor"); setAddEditorId(""); }}>
                追加
              </Button>
            </div>
            <ul className="space-y-1">
              {editors.map((uid) => (
                <li
                  key={uid}
                  draggable={myUserId === null || uid !== myUserId}
                  onDragStart={(e) => onDragStart(e, uid)}
                  className="flex items-center justify-between rounded bg-[color:color-mix(in_srgb,var(--surface)_94%,black_6%)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                >
                  <span>
                    user {uid}
                    {myUserId !== null && uid === myUserId ? (
                      <span className="ml-2 text-xs text-[var(--muted)]">（登録者・固定）</span>
                    ) : null}
                  </span>
                  {myUserId === null || uid !== myUserId ? (
                    <Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={() => removeParticipant(uid)}>
                      Delete
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div
            className="min-h-[120px] rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDropZone(e, "viewer")}
          >
            <p className="mb-2 text-xs font-medium text-[var(--muted)]">参照権限</p>
            <div className="mb-2 flex gap-2">
              <Input
                className="h-8 min-w-0 flex-1 px-2 py-1 text-xs"
                placeholder="user_id"
                value={addViewerId}
                onChange={(e) => setAddViewerId(e.target.value)}
              />
              <Button type="button" size="sm" variant="default" onClick={() => { addByInput(addViewerId, "viewer"); setAddViewerId(""); }}>
                追加
              </Button>
            </div>
            <ul className="space-y-1">
              {viewers.map((uid) => (
                <li
                  key={uid}
                  draggable
                  onDragStart={(e) => onDragStart(e, uid)}
                  className="flex items-center justify-between rounded bg-[color:color-mix(in_srgb,var(--surface)_94%,black_6%)] px-2 py-1.5 text-sm text-[var(--foreground)]"
                >
                  <span>user {uid}</span>
                  <Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={() => removeParticipant(uid)}>
                    Delete
                  </Button>
                </li>
              ))}
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
            <Button type="button" variant="default" className="min-w-[7rem]" onClick={() => router.push("/project-manager")}>
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
