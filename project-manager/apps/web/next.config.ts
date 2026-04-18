import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/** webpack 開発時の watchpack ポーリング（以前は cross-env で付与）。npm の PATH に依存しない。 */
if (process.env.NODE_ENV !== "production") {
  process.env.WATCHPACK_POLLING ??= "1";
}

/**
 * 開発時、`allowedDevOrigins` に無いオリジンからページを開くと `/_next/static` の CSS/JS がブロックされ、
 * Tailwind が効かず「白背景の素の HTML」に見える。
 *
 * - 手動: `.env.local` の `NEXT_DEV_ALLOWED_ORIGINS`（カンマ区切り）
 * - 自動: このマシンの **LAN の IPv4** × よく使うポートを起動時に列挙して追加（別 PC / スマホから
 *   `http://192.168.x.x:8001` で開く場合に効く）
 */
function extraDevOriginsFromEnv(): string[] {
  const raw = process.env.NEXT_DEV_ALLOWED_ORIGINS;
  if (!raw || raw.trim() === "") {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `dev:lan` は 8001、素の `next dev` は 3000 など */
function devPortsFromEnv(): string[] {
  const raw = process.env.NEXT_DEV_PORTS;
  if (raw && raw.trim() !== "") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ["8001", "3000"];
}

function collectLanIpv4Origins(ports: string[]): string[] {
  const out: string[] = [];
  const nets = networkInterfaces();
  for (const addrs of Object.values(nets)) {
    if (!addrs) {
      continue;
    }
    for (const net of addrs) {
      const fam = net.family as string | number;
      const v4 = fam === "IPv4" || fam === 4;
      if (!v4 || net.internal) {
        continue;
      }
      for (const port of ports) {
        out.push(`${net.address}:${port}`);
      }
    }
  }
  return out;
}

const baseAllowedDevOrigins = [
  "dev-alrfy-ai.com:8001",
  "dev-ALRfy-AI.com:8001",
  "dev-alrfy-ai.com",
  "dev-ALRfy-AI.com",
  /** サブドメイン経由や hosts の別名で開く場合（Next 公式ドキュメントのワイルドカード形式） */
  "*.dev-alrfy-ai.com",
  "*.dev-ALRfy-AI.com",
  "127.0.0.1:8001",
  "localhost:8001",
  "127.0.0.1:3000",
  "localhost:3000",
  "127.0.0.1",
  "localhost",
];

const devPorts = devPortsFromEnv();
const lanOrigins = collectLanIpv4Origins(devPorts);

const allowedDevOrigins = [
  ...new Set([...baseAllowedDevOrigins, ...lanOrigins, ...extraDevOriginsFromEnv()]),
];

/**
 * ルート `/` がダッシュボード、`/project-list` が Project（案件一覧）アプリ。
 * 本番ではリバースプロキシで同様に振り分けてもよい。
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Next.js 16 以降は `next build` が既定で Turbopack。`webpack` を定義している場合は
   * 空の turbopack 設定を置くか `--webpack` を明示する必要がある（公式メッセージ参照）。
   * 開発時の `webpack` フックは dev のみ（メモリキャッシュ・Windows poll）なので本番ビルドには影響しない。
   */
  turbopack: {},
  /** lucide / date-fns 等の barrel import を細かく分割し、クライアントチャンクを小さくする */
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "react-day-picker"],
  },
  // Hide the bottom-right Next.js dev indicator ("N") in development.
  devIndicators: false,
  /**
   * 開発時のみ webpack のキャッシュをメモリに寄せる（`dev:lan` / `next dev`）。
   * Windows でファイルシステムキャッシュと HMR の組み合わせにより、
   * `/_next/static/` のチャンク参照が古いまま残り 404 になる事例を減らす。
   * （`next dev --turbopack` では webpack が使われないためこの設定は効かない）
   */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = { type: "memory" };
      // Windows: ネイティブのファイル監視が取りこぼすと HMR が部分的に失敗し、
      // `/_next/static/css/*.css` だけ欠落して「裸の HTML」に見えることがある。
      if (process.platform === "win32") {
        config.watchOptions = {
          ...config.watchOptions,
          poll: 1000,
          aggregateTimeout: 500,
        };
      }
    }
    return config;
  },
  /**
   * hosts で別名を当てたときに /_next 静的アセット・HMR を許可する。
   * Next 15 系は「ホスト名だけ」だとポート違いで弾かれ、CSS が一切当たらないことがあるため
   * `dev:lan` の待受ポート（8001）付きも必ず含める。
   * LAN の IP は `collectLanIpv4Origins` で自動追加。上書きは `NEXT_DEV_ALLOWED_ORIGINS`。
   * ポート一覧は `NEXT_DEV_PORTS`（既定 `8001,3000`）。
   */
  allowedDevOrigins,
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/",
        permanent: false,
      },
      {
        source: "/project-manager",
        destination: "/project-list",
        permanent: true,
      },
      {
        source: "/project-manager/:path*",
        destination: "/project-list/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
