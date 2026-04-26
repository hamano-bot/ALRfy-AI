import type { Metadata } from "next";
import { SettingsUsersClient } from "./settings-users-client";

export const metadata: Metadata = {
  title: "Settings | Users",
  description: "ユーザー一覧 / 一括タグ更新 / 管理者更新",
};

export default function SettingsUsersPage() {
  return <SettingsUsersClient />;
}
