import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppNav } from "./components/AppNav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ダッシュボード",
    template: "%s | ALRfy",
  },
  description: "ALRfy-AI project-manager（スキャフォールド）",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.className} min-h-screen antialiased`}>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
