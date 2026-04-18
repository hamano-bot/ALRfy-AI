import { excelBufferToSheetText } from "@/lib/hearing-excel-parse";
import { mapExcelTextToHearingBody } from "@/lib/hearing-gemini-map";
import { isHearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, message: "multipart 形式で送信してください。" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "file が必要です。" }, { status: 400 });
  }

  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    return NextResponse.json({ success: false, message: "対応形式は .xlsx / .xls のみです。" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ success: false, message: "ファイルサイズは 10MB 以下にしてください。" }, { status: 400 });
  }

  const tid = form.get("template_id");
  if (typeof tid !== "string" || !isHearingTemplateId(tid)) {
    return NextResponse.json({ success: false, message: "template_id が不正です。" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  const { text, sheetName } = excelBufferToSheetText(buf);
  if (!text.trim()) {
    return NextResponse.json({ success: false, message: "シートが空です。" }, { status: 400 });
  }

  const mapped = await mapExcelTextToHearingBody(text, tid);
  if (!mapped.ok) {
    return NextResponse.json({ success: false, message: mapped.message }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    body_json: mapped.data,
    meta: {
      sheetName,
      text_truncated: mapped.truncated,
    },
  });
}
