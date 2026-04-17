import type { NextConfig } from "next";

/**
 * ルート `/` がダッシュボード、`/project-manager` が案件管理アプリ。
 * 本番ではリバースプロキシで同様に振り分けてもよい。
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** hosts で別名を当てたときに /_next 静的アセット・HMR を許可する */
  allowedDevOrigins: [
    "dev-alrfy-ai.com",
    "dev-ALRfy-AI.com",
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
