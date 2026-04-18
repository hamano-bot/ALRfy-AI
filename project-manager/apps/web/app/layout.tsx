import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import Script from "next/script";
import { DashboardShell } from "./components/DashboardShell";
import { PortalAppsProvider } from "./components/PortalAppsProvider";
import { THEME_INIT_INLINE_SCRIPT } from "./theme-init";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s | ALRfy-AI",
  },
  description: "ALRfy-AI のダッシュボード（Project Web）",
  /** ブラウザ・OGP にページの主言語を明示（翻訳バーの誤判定を減らす） */
  alternates: {
    languages: {
      ja: "/",
    },
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
  },
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja-JP" className="h-full" suppressHydrationWarning>
      <body className={`${inter.className} ${montserrat.variable} h-full min-h-0 overflow-hidden antialiased`}>
        <Script id="alrfy-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_INLINE_SCRIPT }} />
        <PortalAppsProvider>
          <DashboardShell>{children}</DashboardShell>
        </PortalAppsProvider>
      </body>
    </html>
  );
}
