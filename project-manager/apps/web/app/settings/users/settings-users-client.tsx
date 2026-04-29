"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatUserDisplayName,
  normalizeTagsInput,
  parseTeamTags,
  toggleSelectedIds,
  type SettingsAdminUser,
} from "@/lib/settings-users-utils";

export function SettingsUsersClient() {
  const [users, setUsers] = useState<SettingsAdminUser[]>([]);
  const [canAdmin, setCanAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"tag-add" | "tag-replace" | "admin-on" | "admin-off">("tag-add");
  const [pendingSummary, setPendingSummary] = useState<string>("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const loadUsers = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/admin/users", { credentials: "include", cache: "no-store" });
      const rawText = await res.text();
      let data: { success?: boolean; users?: SettingsAdminUser[]; message?: string; can_admin?: boolean } = {};
      try {
        data = JSON.parse(rawText) as { success?: boolean; users?: SettingsAdminUser[]; message?: string; can_admin?: boolean };
      } catch {
        setMessage(`ユーザー取得に失敗しました（HTTP ${res.status}）。`);
        return;
      }
      if (!res.ok || !data.success || !Array.isArray(data.users)) {
        setMessage(data.message ?? "ユーザー取得に失敗しました。");
        return;
      }
      setUsers(data.users);
      setCanAdmin(data.can_admin === true);
      setSelectedIds([]);
    } catch {
      setMessage("ユーザー取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const openConfirmForTags = async (mode: "tag-add" | "tag-replace") => {
    if (!canAdmin) {
      setMessage("管理者権限が必要です。");
      return;
    }
    if (selectedIds.length === 0) {
      setMessage("対象ユーザーを選択してください。");
      return;
    }
    const tags = normalizeTagsInput(tagInput);
    if (tags.length === 0) {
      setMessage("タグを入力してください。");
      return;
    }
    try {
      const res = await fetch("/api/portal/admin/user-team-tags/bulk", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: selectedIds,
          tags,
          mode: mode === "tag-replace" ? "replace" : "add",
          dry_run: true,
        }),
      });
      const data = (await res.json()) as { success?: boolean; summary?: { target_user_count: number; tag_count: number; mode: string }; message?: string };
      if (!res.ok || !data.success || !data.summary) {
        setMessage(data.message ?? "確認に失敗しました。");
        return;
      }
      setPendingSummary(
        `対象ユーザー: ${data.summary.target_user_count}名 / タグ: ${data.summary.tag_count}件 / mode: ${data.summary.mode}`,
      );
      setConfirmMode(mode);
      setConfirmOpen(true);
    } catch {
      setMessage("確認に失敗しました。");
    }
  };

  const openConfirmForAdmin = async (toAdmin: boolean) => {
    if (!canAdmin) {
      setMessage("管理者権限が必要です。");
      return;
    }
    if (selectedIds.length === 0) {
      setMessage("対象ユーザーを選択してください。");
      return;
    }
    try {
      const res = await fetch("/api/portal/admin/users/bulk-role", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: selectedIds,
          is_admin: toAdmin ? 1 : 0,
          dry_run: true,
        }),
      });
      const data = (await res.json()) as { success?: boolean; summary?: { target_user_count: number; is_admin: number }; message?: string };
      if (!res.ok || !data.success || !data.summary) {
        setMessage(data.message ?? "確認に失敗しました。");
        return;
      }
      setPendingSummary(`対象ユーザー: ${data.summary.target_user_count}名 / 管理者: ${data.summary.is_admin === 1 ? "付与" : "解除"}`);
      setConfirmMode(toAdmin ? "admin-on" : "admin-off");
      setConfirmOpen(true);
    } catch {
      setMessage("確認に失敗しました。");
    }
  };

  const runConfirmed = async () => {
    try {
      if (confirmMode === "tag-add" || confirmMode === "tag-replace") {
        const tags = normalizeTagsInput(tagInput);
        const res = await fetch("/api/portal/admin/user-team-tags/bulk", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_ids: selectedIds,
            tags,
            mode: confirmMode === "tag-replace" ? "replace" : "add",
            confirm: true,
          }),
        });
        const data = (await res.json()) as { success?: boolean; message?: string };
        if (!res.ok || !data.success) {
          setMessage(data.message ?? "一括タグ更新に失敗しました。");
          return;
        }
        setMessage("一括タグ更新を実行しました。");
      } else {
        const toAdmin = confirmMode === "admin-on";
        const res = await fetch("/api/portal/admin/users/bulk-role", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_ids: selectedIds,
            is_admin: toAdmin ? 1 : 0,
            confirm: true,
          }),
        });
        const data = (await res.json()) as { success?: boolean; message?: string };
        if (!res.ok || !data.success) {
          setMessage(data.message ?? "管理者更新に失敗しました。");
          return;
        }
        setMessage("管理者更新を実行しました。");
      }
      setConfirmOpen(false);
      await loadUsers();
    } catch {
      setMessage("更新に失敗しました。");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <section className="surface-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--foreground)]">設定 &gt; User一覧</h1>
            <p className="text-sm text-[var(--muted)]">管理者向け: 一括タグ更新 / 一括管理者付与・解除</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => void loadUsers()} disabled={loading}>
              再読込
            </Button>
          </div>
        </div>
      </section>

      <section className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-5 py-3">
          <span className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-2 py-1 text-sm">
            選択中 {selectedIds.length} 件
          </span>
          {!canAdmin ? <span className="text-xs text-[var(--muted)]">閲覧モード（更新は管理者のみ）</span> : null}
          <Input
            className="h-8 w-[16rem]"
            placeholder="タグ（カンマ区切り: sales,tokyo）"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            disabled={!canAdmin}
          />
          <Button type="button" variant="default" size="sm" className="h-8 rounded-md" disabled={!canAdmin} onClick={() => void openConfirmForTags("tag-add")}>
            タグ一括追加
          </Button>
          <Button type="button" variant="default" size="sm" className="h-8 rounded-md" disabled={!canAdmin} onClick={() => void openConfirmForTags("tag-replace")}>
            タグ一括置換
          </Button>
          <Button type="button" variant="default" size="sm" className="h-8 rounded-md" disabled={!canAdmin} onClick={() => void openConfirmForAdmin(true)}>
            管理者付与
          </Button>
          <Button type="button" variant="default" size="sm" className="h-8 rounded-md" disabled={!canAdmin} onClick={() => void openConfirmForAdmin(false)}>
            管理者解除
          </Button>
        </div>

        {message ? (
          <div className="px-5 pt-3">
            <p className="text-sm text-[var(--muted)]">{message}</p>
          </div>
        ) : null}
        {loading ? (
          <div className="px-5 pt-3">
            <p className="text-sm text-[var(--muted)]">読み込み中…</p>
          </div>
        ) : null}

        <div className="modern-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[980px] table-auto text-left text-sm">
            <thead className="pm-table-head sticky top-0 z-10 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)]">
              <tr>
                <th className="px-5 py-3">
                  <input
                    type="checkbox"
                    checked={users.length > 0 && selectedIds.length === users.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? users.map((u) => u.id) : [])}
                  />
                </th>
                <th className="px-3 py-3">ユーザー名</th>
                <th className="px-3 py-3">メール</th>
                <th className="px-3 py-3">teamタグ</th>
                <th className="px-3 py-3">管理者</th>
                <th className="px-3 py-3">作成日</th>
                <th className="px-3 py-3">最終更新</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={`settings-user-${user.id}`}
                  className="group border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)]"
                >
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(user.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => toggleSelectedIds(prev, user.id, e.target.checked));
                      }}
                    />
                  </td>
                  <td className="px-3 py-3 font-medium text-[var(--foreground)]">{formatUserDisplayName(user)}</td>
                  <td className="px-3 py-3 text-[var(--muted)]">{user.email}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {parseTeamTags(user.team).map((tag) => (
                        <span
                          key={`user-team-${user.id}-${tag}`}
                          className="inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] px-2 py-0.5 text-xs text-[var(--muted)]"
                        >
                          #{tag}
                        </span>
                      ))}
                      {parseTeamTags(user.team).length === 0 ? <span className="text-xs text-[var(--muted)]">-</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight",
                        Number(user.is_admin) === 1
                          ? "bg-[color:color-mix(in_srgb,#16a34a_22%,transparent)] text-[color:color-mix(in_srgb,#16a34a_86%,var(--foreground)_14%)]"
                          : "bg-[color:color-mix(in_srgb,var(--muted)_22%,transparent)] text-[color:color-mix(in_srgb,var(--muted)_86%,var(--foreground)_14%)]",
                      )}
                    >
                      {Number(user.is_admin) === 1 ? "ON" : "OFF"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)] tabular-nums">
                    {String(user.created_at ?? "").slice(0, 10) || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)] tabular-nums">
                    {String(user.updated_at ?? "").slice(0, 10) || "-"}
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                    データがありません。再読込してください。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent aria-label="一括更新確認">
          <DialogHeader>
            <DialogTitle>一括更新の確認</DialogTitle>
            <DialogDescription>{pendingSummary}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-[var(--foreground)]">
            <p>対象ユーザー: {selectedIds.length}名</p>
            <p>注意: 自分自身の管理者解除は実行できません。</p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => setConfirmOpen(false)}>
              キャンセル
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={() => void runConfirmed()}>
              確認して実行
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
