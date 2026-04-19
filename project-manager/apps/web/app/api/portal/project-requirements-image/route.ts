import { type NextRequest, NextResponse } from "next/server";
import { assertRequirementsImageUploadAllowed } from "@/lib/requirements-image-upload-permission";
import { getRequirementsS3Config, uploadRequirementsProjectImage } from "@/lib/requirements-image-s3";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!getRequirementsS3Config()) {
    return NextResponse.json(
      {
        success: false,
        code: "s3_not_configured",
        message:
          "画像ストレージ（S3）が未設定です。REQUIREMENTS_S3_BUCKET と REQUIREMENTS_S3_PUBLIC_BASE_URL を設定してください。",
      },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const pid = form.get("project_id");
    const file = form.get("file");

    if (typeof pid !== "string" || !/^\d+$/.test(pid)) {
      return NextResponse.json({ success: false, message: "project_id が不正です。" }, { status: 400 });
    }
    const projectId = Number.parseInt(pid, 10);
    if (projectId <= 0) {
      return NextResponse.json({ success: false, message: "project_id が不正です。" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "file が指定されていません。" }, { status: 400 });
    }

    const cookie = request.headers.get("cookie");
    const auth = await assertRequirementsImageUploadAllowed(cookie, projectId);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, code: auth.code, message: auth.message },
        { status: auth.status },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";

    try {
      const { url, key } = await uploadRequirementsProjectImage({
        projectId,
        body: buf,
        contentType,
      });
      return NextResponse.json({ success: true, url, key }, { status: 200 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "REQUIREMENTS_S3_BAD_TYPE") {
        return NextResponse.json(
          {
            success: false,
            message: "対応していない画像形式です（JPEG / PNG / GIF / WebP / SVG）。",
          },
          { status: 400 },
        );
      }
      if (msg === "REQUIREMENTS_S3_TOO_LARGE") {
        const cfg = getRequirementsS3Config();
        const maxMb = cfg ? (cfg.maxBytes / 1024 / 1024).toFixed(1) : "?";
        return NextResponse.json(
          {
            success: false,
            message: `ファイルサイズが大きすぎます（${maxMb}MB 以下）。`,
          },
          { status: 400 },
        );
      }
      if (msg === "REQUIREMENTS_S3_EMPTY") {
        return NextResponse.json({ success: false, message: "空のファイルです。" }, { status: 400 });
      }
      console.error("[project-requirements-image]", e);
      return NextResponse.json({ success: false, message: "画像の保存に失敗しました。" }, { status: 500 });
    }
  } catch (e) {
    console.error("[project-requirements-image] parse", e);
    return NextResponse.json({ success: false, message: "リクエストの解析に失敗しました。" }, { status: 400 });
  }
}
