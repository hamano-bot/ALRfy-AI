import type { NextRequest } from "next/server";

import { proxyRequestToPhp } from "@/lib/php-portal-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyRequestToPhp(request, "/callback");
}

export async function POST(request: NextRequest) {
  return proxyRequestToPhp(request, "/callback");
}

export async function HEAD(request: NextRequest) {
  return proxyRequestToPhp(request, "/callback");
}
