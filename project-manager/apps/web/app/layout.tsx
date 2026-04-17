import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import { DashboardShell } from "./components/DashboardShell";
import { PortalAppsProvider } from "./components/PortalAppsProvider";
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
    default: "ダッシュボード",
    template: "%s | ALRfy",
  },
  description: "ALRfy-AI project-manager（スキャフォールド）",
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
    <html lang="ja-JP">
      <body className={`${inter.className} ${montserrat.variable} min-h-screen antialiased`}>
        <PortalAppsProvider>
          <DashboardShell>{children}</DashboardShell>
        </PortalAppsProvider>
      </body>
    </html>
  );
}
