import {
  REQUIREMENTS_IMAGE_UPLOAD_API_PATH,
  REQUIREMENTS_IMAGE_UPLOAD_MAX_BYTES,
} from "@/lib/requirements-image-upload-constants";

export type UploadProjectRequirementsImageResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

export async function uploadProjectRequirementsImage(
  projectId: number,
  file: File,
): Promise<UploadProjectRequirementsImageResult> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "画像ファイルを選んでください。" };
  }
  if (file.size > REQUIREMENTS_IMAGE_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      message: `画像は ${REQUIREMENTS_IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024}MB 以下にしてください。`,
    };
  }
  const fd = new FormData();
  fd.append("project_id", String(projectId));
  fd.append("file", file);
  try {
    const res = await fetch(REQUIREMENTS_IMAGE_UPLOAD_API_PATH, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const j = (await res.json()) as { success?: boolean; url?: string; message?: string };
    if (!res.ok || j.success !== true || typeof j.url !== "string") {
      return {
        ok: false,
        message: j.message ?? "画像のアップロードに失敗しました。S3 設定（REQUIREMENTS_S3_*）を確認してください。",
      };
    }
    return { ok: true, url: j.url };
  } catch {
    return { ok: false, message: "画像のアップロードに失敗しました。" };
  }
}
