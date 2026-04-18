"use client";

import { createContext, useContext, type ReactNode } from "react";

/** `true` = Menu 展開（左ナビ幅 168px）、メイン領域が狭い */
const DashboardSidebarOpenContext = createContext<boolean | undefined>(undefined);

export function DashboardSidebarOpenProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <DashboardSidebarOpenContext.Provider value={value}>{children}</DashboardSidebarOpenContext.Provider>;
}

export function useDashboardSidebarOpen(): boolean {
  const v = useContext(DashboardSidebarOpenContext);
  return v ?? true;
}
