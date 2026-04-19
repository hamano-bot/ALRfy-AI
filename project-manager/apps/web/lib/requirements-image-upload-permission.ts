import { fetchPortalProjectPermissionRaw, parseProjectPermissionSuccess } from "@/lib/portal-project-permission";

export type RequirementsImageUploadAuthResult =
  | { ok: true }
  | { ok: false; status: number; message: string; code?: string };

/**
 * 要件定義の画像アップロード: owner / editor のみ。
 */
export async function assertRequirementsImageUploadAllowed(
  cookieHeader: string | null,
  projectId: number,
): Promise<RequirementsImageUploadAuthResult> {
  const raw = await fetchPortalProjectPermissionRaw(cookieHeader, projectId);
  if (!raw.ok) {
    if (raw.reason === "missing_config") {
      return {
        ok: false,
        status: 503,
        code: "missing_config",
        message: "PORTAL_API_BASE_URL が未設定のため権限を確認できません。",
      };
    }
    return {
      ok: false,
      status: 502,
      code: "upstream_unreachable",
      message: "ポータル API に接続できませんでした。",
    };
  }
  if (raw.status === 401) {
    return { ok: false, status: 401, code: "unauthorized", message: "ログインが必要です。" };
  }
  if (raw.status !== 200) {
    return { ok: false, status: 403, code: "forbidden", message: "このプロジェクトへのアクセス権限がありません。" };
  }
  const p = parseProjectPermissionSuccess(raw.text);
  if (!p) {
    return { ok: false, status: 403, code: "forbidden", message: "権限情報を解釈できませんでした。" };
  }
  const er = p.effective_role.trim().toLowerCase();
  if (er !== "owner" && er !== "editor") {
    return { ok: false, status: 403, code: "forbidden", message: "画像をアップロードできるのはオーナーまたは編集者のみです。" };
  }
  return { ok: true };
}
