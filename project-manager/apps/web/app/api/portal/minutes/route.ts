import { NextResponse } from "next/server";
import type { MeetingsListResponse } from "@/lib/meetings/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload: MeetingsListResponse = {
    success: true,
    items: [],
    message: "Meetings BFF scaffold is ready.",
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
