import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import { DashboardShell } from "./components/DashboardShell";
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
    <html lang="ja">
      <body className={`${inter.className} ${montserrat.variable} min-h-screen antialiased`}>
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
