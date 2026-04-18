import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolvePhpUpstream } from "@/lib/php-upstream";

/**
 * platform-common（PHP）へリクエストを転送する。ブラウザの Host を X-Forwarded-Host で渡し、
 * OAuth redirect_uri とセッション Cookie が dev ホストに揃うようにする。
 */
export async function proxyRequestToPhp(request: NextRequest, upstreamPath: string): Promise<NextResponse> {
  const php = resolvePhpUpstream();
  const u = new URL(request.url);
  const target = `${php}${upstreamPath}${u.search}`;
  const host = request.headers.get("host") ?? "";
  const proto = u.protocol.replace(":", "");

  const headers = new Headers();
  headers.set("X-Forwarded-Host", host);
  headers.set("X-Forwarded-Proto", proto);
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    headers.set("X-Forwarded-For", xf);
  }
  const cookie = request.headers.get("cookie");
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  const accept = request.headers.get("accept");
  if (accept) {
    headers.set("Accept", accept);
  }
  const ua = request.headers.get("user-agent");
  if (ua) {
    headers.set("User-Agent", ua);
  }
  const ct = request.headers.get("content-type");
  if (ct) {
    headers.set("Content-Type", ct);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const res = await fetch(target, init);

  const outHeaders = new Headers();
  const withSetCookie = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof withSetCookie.getSetCookie === "function") {
    for (const c of withSetCookie.getSetCookie()) {
      outHeaders.append("Set-Cookie", c);
    }
  }
  res.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "set-cookie" || k === "transfer-encoding") {
      return;
    }
    outHeaders.append(key, value);
  });

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: outHeaders,
  });
}
