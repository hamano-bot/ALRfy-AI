import type { NextRequest } from "next/server";

import { proxyRequestToPhp } from "@/lib/php-portal-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyRequestToPhp(request, "/minutes");
}

export async function HEAD(request: NextRequest) {
  return proxyRequestToPhp(request, "/minutes");
}
