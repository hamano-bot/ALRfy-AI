"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";

/** 一覧表示中に /project-list/new を先読み（useLayoutEffect で描画直後に実行し、useEffect より早く開始） */
export function PrefetchProjectManagerNew() {
  const router = useRouter();
  useLayoutEffect(() => {
    router.prefetch("/project-list/new");
  }, [router]);
  return null;
}
