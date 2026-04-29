import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const destination = new URL("/meetings", request.url);
  return NextResponse.redirect(destination, { status: 307 });
}

export async function HEAD(request: NextRequest) {
  const destination = new URL("/meetings", request.url);
  return NextResponse.redirect(destination, { status: 307 });
}
