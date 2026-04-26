"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Button } from "@/app/components/ui/button";
import {
  PORTAL_THEMED_SUGGEST_MUTED,
  PORTAL_THEMED_SUGGEST_PANEL,
  PORTAL_THEMED_SUGGEST_ROW,
} from "@/lib/portal-themed-suggest-classes";

export type AccessControlRow = {
  key: string;
  subjectType: "team" | "user";
  subject: string;
  role: "owner" | "editor" | "viewer";
};

type AccessControlTableProps = {
  rows: AccessControlRow[];
  onChange: (rows: AccessControlRow[]) => void;
  readOnly?: boolean;
  userSuggestions?: Array<{ id: number; label: string }>;
};

const roleOptions: Array<AccessControlRow["role"]> = ["owner", "editor", "viewer"];

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

export function AccessControlTable({ rows, onChange, readOnly = false, userSuggestions = [] }: AccessControlTableProps) {
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

  const resolveUserSubject = (rawValue: string): string => {
    const value = rawValue.trim();
    if (value === "") return "";
    if (/^\d+$/.test(value)) return value;
    const byExact = userSuggestions.find((u) => u.label === value);
    if (byExact) return String(byExact.id);
    const byPattern = value.match(/user#(\d+)$/i);
    if (byPattern && byPattern[1]) return byPattern[1];
    return value;
  };

  const [userSuggestMenuKey, setUserSuggestMenuKey] = useState<string | null>(null);
  const userSuggestWrapRef = useRef<HTMLDivElement | null>(null);
  const closeUserSuggestMenu = useCallback(() => setUserSuggestMenuKey(null), []);
  const userSuggestMenuActive = userSuggestMenuKey !== null && userSuggestions.length > 0 && !readOnly;
  useMousedownOutside(userSuggestWrapRef, closeUserSuggestMenu, userSuggestMenuActive);

  useEffect(() => {
    if (!userSuggestMenuKey) return;
    const r = rows.find((x) => x.key === userSuggestMenuKey);
    if (!r || r.subjectType !== "user") {
      setUserSuggestMenuKey(null);
    }
  }, [rows, userSuggestMenuKey]);

  const filteredUserSuggestions = useMemo(() => {
    if (userSuggestions.length === 0) return [];
    const row = userSuggestMenuKey ? rows.find((r) => r.key === userSuggestMenuKey) : undefined;
    const raw = row?.subjectType === "user" ? String(row.subject ?? "").trim() : "";
    const q = raw.toLowerCase();
    if (q === "") return userSuggestions.slice(0, 40);
    return userSuggestions
      .filter((u) => u.label.toLowerCase().includes(q) || String(u.id).includes(q) || q === String(u.id))
      .slice(0, 48);
  }, [userSuggestMenuKey, userSuggestions, rows]);

  return (
    <div className="space-y-2">
      <div className="overflow-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="px-2 py-1">種別</th>
              <th className="px-2 py-1">対象</th>
              <th className="px-2 py-1">権限</th>
              <th className="px-2 py-1">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.key} className="border-b border-[var(--border)]">
                <td className="px-2 py-1">
                  <select
                    className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                    value={row.subjectType}
                    disabled={readOnly}
                    onChange={(event) => updateRow(idx, { subjectType: event.target.value as "team" | "user" })}
                  >
                    <option value="team">team</option>
                    <option value="user">user</option>
                  </select>
                </td>
                <td className="px-2 py-1">
                  {row.subjectType === "user" ? (
                    <div
                      className="relative min-w-0"
                      ref={userSuggestMenuKey === row.key ? userSuggestWrapRef : undefined}
                    >
                      <input
                        className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                        value={row.subject}
                        disabled={readOnly}
                        autoComplete="off"
                        onChange={(event) =>
                          updateRow(idx, {
                            subject: resolveUserSubject(event.target.value),
                          })
                        }
                        onFocus={() => {
                          if (!readOnly && userSuggestions.length > 0) {
                            setUserSuggestMenuKey(row.key);
                          }
                        }}
                        placeholder="ユーザー名 / user_id"
                      />
                      {userSuggestMenuKey === row.key && userSuggestions.length > 0 ? (
                        <div className={PORTAL_THEMED_SUGGEST_PANEL} role="listbox" aria-label="ユーザー候補">
                          {filteredUserSuggestions.length === 0 ? (
                            <p className={PORTAL_THEMED_SUGGEST_MUTED}>候補がありません</p>
                          ) : (
                            filteredUserSuggestions.map((u) => {
                              const m = u.label.match(/^(.*)\s*\(user#(\d+)\)\s*$/);
                              const primary = m ? m[1].trim() || u.label : u.label;
                              const secondary = m ? `(user#${m[2]})` : "";
                              return (
                                <button
                                  key={`access-user-suggest-${idx}-${u.id}`}
                                  type="button"
                                  role="option"
                                  className={PORTAL_THEMED_SUGGEST_ROW}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    updateRow(idx, { subject: String(u.id) });
                                    setUserSuggestMenuKey(null);
                                  }}
                                >
                                  <span className="block text-sm font-medium text-[var(--foreground)]">{primary}</span>
                                  {secondary !== "" ? (
                                    <span className="block truncate text-xs text-[var(--muted)]">{secondary}</span>
                                  ) : null}
                                </button>
                              );
                            })
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <input
                      className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                      value={row.subject}
                      disabled={readOnly}
                      onChange={(event) => updateRow(idx, { subject: event.target.value })}
                      placeholder="team_tag"
                    />
                  )}
                </td>
                <td className="px-2 py-1">
                  <select
                    className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                    value={row.role}
                    disabled={readOnly}
                    onChange={(event) => updateRow(idx, { role: event.target.value as AccessControlRow["role"] })}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <Button type="button" variant="default" size="sm" disabled={readOnly} onClick={() => removeRow(idx)}>
                    削除
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-[var(--muted)]">
                  権限設定はありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!readOnly ? (
        <div className="flex gap-2">
          <Button type="button" variant="default" size="sm" onClick={() => addRow("team")}>
            team追加
          </Button>
          <Button type="button" variant="default" size="sm" onClick={() => addRow("user")}>
            user追加
          </Button>
        </div>
      ) : null}
    </div>
  );
}
