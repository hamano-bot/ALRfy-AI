"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Button } from "@/app/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  PORTAL_THEMED_SUGGEST_MUTED,
  PORTAL_THEMED_SUGGEST_PANEL,
  PORTAL_THEMED_SUGGEST_ROW,
} from "@/lib/portal-themed-suggest-classes";

export type AccessControlRow = {
  key: string;
  subjectType: "team" | "user";
  subject: string;
  subjectUserId?: number | null;
  role: "owner" | "editor" | "viewer";
};

type AccessControlTableProps = {
  rows: AccessControlRow[];
  onChange: (rows: AccessControlRow[]) => void;
  readOnly?: boolean;
  userSuggestions?: Array<{ id: number; label: string }>;
  teamSuggestions?: string[];
  allowedRoles?: AccessControlRow["role"][];
};

const roleOptions: Array<AccessControlRow["role"]> = ["owner", "editor", "viewer"];
const roleLabel: Record<AccessControlRow["role"], string> = {
  owner: "オーナー",
  editor: "編集者",
  viewer: "閲覧者",
};

const subjectTypeLabel: Record<AccessControlRow["subjectType"], string> = {
  team: "チーム",
  user: "ユーザー",
};

function userPrimaryLabel(label: string): string {
  const t = String(label ?? "").trim();
  const m = t.match(/^(.*)\s*\(user#(\d+)\)\s*$/);
  if (m) {
    return m[1].trim() || t;
  }
  return t;
}

function useMousedownOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [active, onOutside, ref]);
}

export function AccessControlTable({
  rows,
  onChange,
  readOnly = false,
  userSuggestions = [],
  teamSuggestions = [],
  allowedRoles = roleOptions,
}: AccessControlTableProps) {
  const updateRow = (idx: number, patch: Partial<AccessControlRow>) => {
    onChange(rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  const addRow = (subjectType: "team" | "user") => {
    onChange([
      ...rows,
      {
        key: `${subjectType}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        subjectType,
        subject: "",
        role: "viewer",
      },
    ]);
  };

  const [userSuggestMenuKey, setUserSuggestMenuKey] = useState<string | null>(null);
  const [remoteUserSuggestions, setRemoteUserSuggestions] = useState<Array<{ id: number; label: string }>>([]);
  const userSuggestWrapRef = useRef<HTMLDivElement | null>(null);
  const closeUserSuggestMenu = useCallback(() => setUserSuggestMenuKey(null), []);

  const mergedUserSuggestions = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of userSuggestions) {
      m.set(u.id, u.label);
    }
    for (const u of remoteUserSuggestions) {
      if (!m.has(u.id)) m.set(u.id, u.label);
    }
    return Array.from(m.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.id - b.id);
  }, [userSuggestions, remoteUserSuggestions]);

  const userSuggestMenuActive = userSuggestMenuKey !== null && !readOnly;
  useMousedownOutside(userSuggestWrapRef, closeUserSuggestMenu, userSuggestMenuActive);

  useEffect(() => {
    if (!userSuggestMenuKey) return;
    const r = rows.find((x) => x.key === userSuggestMenuKey);
    if (!r || r.subjectType !== "user") {
      setUserSuggestMenuKey(null);
    }
  }, [rows, userSuggestMenuKey]);

  useEffect(() => {
    if (!userSuggestMenuKey || readOnly) {
      setRemoteUserSuggestions([]);
      return;
    }
    const row = rows.find((r) => r.key === userSuggestMenuKey);
    const q = row?.subjectType === "user" ? String(row.subject ?? "").trim() : "";
    if (q.length < 2) {
      setRemoteUserSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/portal/user-suggest?q=${encodeURIComponent(q)}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = (await res.json()) as {
            success?: boolean;
            users?: Array<{ id?: unknown; display_name?: unknown; email?: unknown }>;
          };
          if (!data.success || !Array.isArray(data.users) || cancelled) return;
          const mapped = data.users
            .map((u) => {
              const id = Number(u.id);
              if (!Number.isFinite(id) || id <= 0) return null;
              const dn = typeof u.display_name === "string" ? u.display_name.trim() : "";
              const em = typeof u.email === "string" ? u.email.trim() : "";
              const labelBase = dn !== "" ? dn : em !== "" ? em : `user#${id}`;
              return { id, label: `${labelBase} (user#${id})` };
            })
            .filter((v): v is { id: number; label: string } => v !== null);
          if (!cancelled) setRemoteUserSuggestions(mapped);
        } catch {
          // ignore
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rows, userSuggestMenuKey, readOnly]);

  const filteredUserSuggestions = useMemo(() => {
    if (mergedUserSuggestions.length === 0) return [];
    const row = userSuggestMenuKey ? rows.find((r) => r.key === userSuggestMenuKey) : undefined;
    const raw = row?.subjectType === "user" ? String(row.subject ?? "").trim() : "";
    const q = raw.toLowerCase();
    if (q === "") return mergedUserSuggestions.slice(0, 40);
    return mergedUserSuggestions
      .filter((u) => u.label.toLowerCase().includes(q) || String(u.id).includes(q) || q === String(u.id))
      .slice(0, 48);
  }, [userSuggestMenuKey, mergedUserSuggestions, rows]);

  const [teamSuggestMenuKey, setTeamSuggestMenuKey] = useState<string | null>(null);
  const teamSuggestWrapRef = useRef<HTMLDivElement | null>(null);
  const closeTeamSuggestMenu = useCallback(() => setTeamSuggestMenuKey(null), []);
  const mergedTeamSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const tag of teamSuggestions) {
      const t = String(tag ?? "").trim();
      if (t !== "") set.add(t);
    }
    for (const row of rows) {
      if (row.subjectType !== "team") continue;
      const t = String(row.subject ?? "").trim();
      if (t !== "") set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [teamSuggestions, rows]);
  const teamSuggestMenuActive = teamSuggestMenuKey !== null && mergedTeamSuggestions.length > 0 && !readOnly;
  useMousedownOutside(teamSuggestWrapRef, closeTeamSuggestMenu, teamSuggestMenuActive);

  useEffect(() => {
    if (!teamSuggestMenuKey) return;
    const r = rows.find((x) => x.key === teamSuggestMenuKey);
    if (!r || r.subjectType !== "team") {
      setTeamSuggestMenuKey(null);
    }
  }, [rows, teamSuggestMenuKey]);

  const filteredTeamSuggestions = useMemo(() => {
    if (mergedTeamSuggestions.length === 0) return [];
    const row = teamSuggestMenuKey ? rows.find((r) => r.key === teamSuggestMenuKey) : undefined;
    const raw = row?.subjectType === "team" ? String(row.subject ?? "").trim() : "";
    const q = raw.toLowerCase();
    if (q === "") return mergedTeamSuggestions.slice(0, 40);
    return mergedTeamSuggestions.filter((t) => t.toLowerCase().includes(q)).slice(0, 48);
  }, [teamSuggestMenuKey, mergedTeamSuggestions, rows]);

  return (
    <div className="space-y-2">
      {!readOnly ? (
        <div className="flex gap-2">
          <Button type="button" variant="default" size="sm" onClick={() => addRow("team")}>
            追加
          </Button>
        </div>
      ) : null}
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={row.key} className="rounded-lg border border-[var(--border)] p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-[var(--muted)]">種別</p>
                <select
                  className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                  value={row.subjectType}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateRow(idx, {
                      subjectType: event.target.value as "team" | "user",
                      subject: "",
                      subjectUserId: null,
                    })
                  }
                >
                  <option value="team">{subjectTypeLabel.team}</option>
                  <option value="user">{subjectTypeLabel.user}</option>
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[var(--muted)]">権限</p>
                <select
                  className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                  value={row.role}
                  disabled={readOnly}
                  onChange={(event) => updateRow(idx, { role: event.target.value as AccessControlRow["role"] })}
                >
                  {allowedRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel[role]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-[var(--muted)]">対象</p>
              {row.subjectType === "user" ? (
                <div className="relative min-w-0" ref={userSuggestMenuKey === row.key ? userSuggestWrapRef : undefined}>
                  <input
                    className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                    value={row.subject}
                    disabled={readOnly}
                    autoComplete="off"
                    inputMode="text"
                    lang="ja"
                    autoCapitalize="off"
                    spellCheck={false}
                    style={{ imeMode: "active" }}
                    onChange={(event) =>
                      updateRow(idx, { subject: event.target.value, subjectUserId: null })
                    }
                    onFocus={() => {
                      if (!readOnly) {
                        setUserSuggestMenuKey(row.key);
                      }
                    }}
                    placeholder="ユーザー名 / user_id"
                  />
                  {row.subjectUserId != null && row.subjectUserId > 0 ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">選択中: user#{row.subjectUserId}</p>
                  ) : null}
                  {mergedUserSuggestions.length > 0 ? (
                    <select
                      className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs"
                      value={row.subjectUserId != null && row.subjectUserId > 0 ? String(row.subjectUserId) : ""}
                      disabled={readOnly}
                      onChange={(event) => {
                        const nextId = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(nextId) || nextId <= 0) {
                          updateRow(idx, { subjectUserId: null });
                          return;
                        }
                        const picked = mergedUserSuggestions.find((u) => u.id === nextId);
                        updateRow(idx, {
                          subjectUserId: nextId,
                          subject: picked ? picked.label : row.subject,
                        });
                      }}
                    >
                      <option value="">候補から選択...</option>
                      {mergedUserSuggestions.map((u) => (
                        <option key={`access-user-select-${u.id}`} value={u.id}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {userSuggestMenuKey === row.key ? (
                    <div className={PORTAL_THEMED_SUGGEST_PANEL} role="listbox" aria-label="ユーザー候補">
                      {filteredUserSuggestions.length === 0 ? (
                        <p className={PORTAL_THEMED_SUGGEST_MUTED}>候補がありません</p>
                      ) : (
                        filteredUserSuggestions.map((u) => (
                          <button
                            key={`access-user-suggest-${idx}-${u.id}`}
                            type="button"
                            role="option"
                            className={PORTAL_THEMED_SUGGEST_ROW}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateRow(idx, { subject: u.label, subjectUserId: u.id });
                              setUserSuggestMenuKey(null);
                            }}
                          >
                            <span className="block text-sm font-medium text-[var(--foreground)]">{userPrimaryLabel(u.label)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="relative min-w-0" ref={teamSuggestMenuKey === row.key ? teamSuggestWrapRef : undefined}>
                  <input
                    className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                    value={row.subject}
                    disabled={readOnly}
                    autoComplete="off"
                    inputMode="text"
                    lang="ja"
                    autoCapitalize="off"
                    spellCheck={false}
                    style={{ imeMode: "active" }}
                    onChange={(event) => updateRow(idx, { subject: event.target.value, subjectUserId: null })}
                    onFocus={() => {
                      if (!readOnly && mergedTeamSuggestions.length > 0) {
                        setTeamSuggestMenuKey(row.key);
                      }
                    }}
                    placeholder="チームタグ"
                  />
                  {teamSuggestMenuKey === row.key && mergedTeamSuggestions.length > 0 ? (
                    <div className={PORTAL_THEMED_SUGGEST_PANEL} role="listbox" aria-label="チーム候補">
                      {filteredTeamSuggestions.length === 0 ? (
                        <p className={PORTAL_THEMED_SUGGEST_MUTED}>候補がありません</p>
                      ) : (
                        filteredTeamSuggestions.map((tag) => (
                          <button
                            key={`access-team-suggest-${idx}-${tag}`}
                            type="button"
                            role="option"
                            className={PORTAL_THEMED_SUGGEST_ROW}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateRow(idx, { subject: tag });
                              setTeamSuggestMenuKey(null);
                            }}
                          >
                            <span className="block text-sm font-medium text-[var(--foreground)]">{tag}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="mt-3">
              <Button type="button" variant="default" size="sm" disabled={readOnly} onClick={() => removeRow(idx)}>
                <Trash2 className="h-4 w-4 text-red-500" aria-hidden />
                <span className="sr-only">削除</span>
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="rounded-lg border border-[var(--border)] px-3 py-4 text-center text-sm text-[var(--muted)]">権限設定はありません。</div>
        ) : null}
      </div>
    </div>
  );
}
