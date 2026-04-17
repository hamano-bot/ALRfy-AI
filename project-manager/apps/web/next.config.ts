import type { NextConfig } from "next";

/**
 * ルート `/` がダッシュボード、`/project-manager` が Project アプリ。
 * 本番ではリバースプロキシで同様に振り分けてもよい。
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Hide the bottom-right Next.js dev indicator ("N") in development.
  devIndicators: false,
  /**
   * hosts で別名を当てたときに /_next 静的アセット・HMR を許可する。
   * Next 15 系は「ホスト名だけ」だとポート違いで弾かれ、CSS が一切当たらないことがあるため
   * `dev:lan` の待受ポート（8001）付きも必ず含める。
   */
  allowedDevOrigins: [
    "dev-alrfy-ai.com:8001",
    "dev-ALRfy-AI.com:8001",
    "dev-alrfy-ai.com",
    "dev-ALRfy-AI.com",
    "127.0.0.1:8001",
    "localhost:8001",
    "127.0.0.1",
    "localhost",
  ],
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
