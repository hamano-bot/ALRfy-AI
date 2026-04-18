/**
 * DashboardShell と共有。初回ペイント前に <html data-theme> を付けるインラインスクリプト用。
 * normalizeTheme（DashboardShell）と同じマッピングに合わせる。
 */
export const THEME_STORAGE_KEY = "alrfy-theme";

/** layout.tsx の <Script> / dangerouslySetInnerHTML 用（IIFE・同期実行） */
export const THEME_INIT_INLINE_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var raw=localStorage.getItem(k);var t=raw||"default";if(t==="system")t="default";if(t==="dark")t="midnight";if(t==="violet")t="cute";var ok=["default","cute","midnight","ocean"].indexOf(t)>=0;if(ok)document.documentElement.dataset.theme=t;}catch(e){}})();`;
