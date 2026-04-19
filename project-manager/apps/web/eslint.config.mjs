import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const coreWebVitals = require("eslint-config-next/core-web-vitals");

/**
 * eslint-plugin-react-hooks v7 の実験ルール（setState in effect / ref update in render 等）は
 * 既存パターンと衝突しやすい。段階的に直すまで off（Console 品質は `devtools-quality-inventory.md` の手動確認と併用）。
 */
/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...coreWebVitals,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "public/**", "*.tsbuildinfo"],
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default config;
