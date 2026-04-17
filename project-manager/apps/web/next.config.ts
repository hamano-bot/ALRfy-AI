import type { NextConfig } from "next";

/**
 * 開発・本番ともに `/project-manager` 配下で配信する（例: http://dev-ALRfy-AI.com:8001/project-manager）
 * ルート直下に出したいときは basePath を外し、リバースプロキシ側で調整する。
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath: "/project-manager",
};

export default nextConfig;
