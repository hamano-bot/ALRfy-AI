"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";

type AdminUser = {
  id: number;
  email: string;
  display_name: string | null;
  team: string | null;
  is_admin: number;
  created_at: string;
  updated_at: string;
};

function parseTeamTags(raw: string | null): string[] {
  if (!raw || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function SettingsUsersClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
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
      const data = (await res.json()) as { success?: boolean; users?: AdminUser[]; message?: string };
      if (!res.ok || !data.success || !Array.isArray(data.users)) {
        setMessage(data.message ?? "ユーザー取得に失敗しました。");
        return;
      }
      setUsers(data.users);
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
    if (selectedIds.length === 0) {
      setMessage("対象ユーザーを選択してください。");
      return;
    }
    const tags = tagInput
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v !== "");
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
        const tags = tagInput
          .split(",")
          .map((v) => v.trim().toLowerCase())
          .filter((v) => v !== "");
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

      <section className="surface-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">選択中 {selectedIds.length} 件</span>
          <input
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            placeholder="タグ（カンマ区切り: sales,tokyo）"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
          />
          <Button type="button" variant="default" size="sm" onClick={() => void openConfirmForTags("tag-add")}>
            タグ一括追加
          </Button>
          <Button type="button" variant="default" size="sm" onClick={() => void openConfirmForTags("tag-replace")}>
            タグ一括置換
          </Button>
          <Button type="button" variant="default" size="sm" onClick={() => void openConfirmForAdmin(true)}>
            管理者付与
          </Button>
          <Button type="button" variant="default" size="sm" onClick={() => void openConfirmForAdmin(false)}>
            管理者解除
          </Button>
        </div>

        {message ? <p className="mb-2 text-sm text-[var(--muted)]">{message}</p> : null}
        {loading ? <p className="mb-2 text-sm text-[var(--muted)]">読み込み中…</p> : null}

        <div className="overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={users.length > 0 && selectedIds.length === users.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? users.map((u) => u.id) : [])}
                  />
                </th>
                <th className="px-2 py-1">ユーザー名</th>
                <th className="px-2 py-1">メール</th>
                <th className="px-2 py-1">teamタグ</th>
                <th className="px-2 py-1">管理者</th>
                <th className="px-2 py-1">最終更新</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={`settings-user-${user.id}`} className="border-b border-[var(--border)]">
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(user.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => (e.target.checked ? [...prev, user.id] : prev.filter((id) => id !== user.id)));
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">{user.display_name && user.display_name.trim() !== "" ? user.display_name : `user#${user.id}`}</td>
                  <td className="px-2 py-1">{user.email}</td>
                  <td className="px-2 py-1">
                    <div className="flex flex-wrap gap-1">
                      {parseTeamTags(user.team).map((tag) => (
                        <span
                          key={`user-team-${user.id}-${tag}`}
                          className="inline-flex rounded border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] px-2 py-0.5 text-xs"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-1">{Number(user.is_admin) === 1 ? "ON" : "OFF"}</td>
                  <td className="px-2 py-1">{user.updated_at}</td>
                </tr>
              ))}
              {users.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-center text-[var(--muted)]">
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
