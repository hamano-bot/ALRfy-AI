/**
 * 見積項目マスタ CSV → estimate_item_master 用 SQL を生成する。
 *
 * 使い方（project-manager/apps/web で）:
 *   npm run import:estimate-item-master
 *   node ./scripts/import-estimate-item-master-from-csv.mjs
 *   node ./scripts/import-estimate-item-master-from-csv.mjs --csv "C:/path/to.csv"
 *   node ./scripts/import-estimate-item-master-from-csv.mjs --out "C:/path/out.sql"
 *
 * 生成した SQL を MySQL で実行（DB は環境に合わせて USE を編集）:
 *   mysql -u ... -p your_db < platform-common/database/seeds/estimate_item_master_from_price_csv.sql
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_UNIT = new Set([
  "person_month",
  "person_day",
  "set",
  "page",
  "times",
  "percent",
  "monthly_fee",
  "annual_fee",
]);

function parseArgs(argv) {
  const out = { csv: null, outPath: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--csv" && argv[i + 1]) {
      out.csv = argv[++i];
    } else if (argv[i] === "--out" && argv[i + 1]) {
      out.outPath = argv[++i];
    }
  }
  return out;
}

function sqlString(s) {
  return `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function parseRow(line) {
  const parts = line.split(",");
  if (parts.length < 5) {
    throw new Error(`列数不足（5列必要）: ${line}`);
  }
  const sort_order = parts.pop().trim();
  const is_active = parts.pop().trim();
  const unit_price_raw = parts.pop().trim();
  const unit_type = parts.pop().trim();
  const item_name = parts.join(",").trim();
  if (!item_name) {
    throw new Error("item_name が空です");
  }
  if (!ALLOWED_UNIT.has(unit_type)) {
    throw new Error(`不正な unit_type "${unit_type}": ${item_name}`);
  }
  const isActiveNum = Number.parseInt(is_active, 10);
  if (isActiveNum !== 0 && isActiveNum !== 1) {
    throw new Error(`is_active は 0 または 1: ${line}`);
  }
  const sortOrderNum = Number.parseInt(sort_order, 10);
  if (!Number.isFinite(sortOrderNum)) {
    throw new Error(`sort_order が整数ではありません: ${line}`);
  }
  let unitPrice = 0;
  if (unit_price_raw !== "") {
    const n = Number(unit_price_raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`unit_price が不正: ${line}`);
    }
    unitPrice = n;
  }
  return {
    item_name,
    unit_type,
    unit_price: unitPrice,
    is_active: isActiveNum,
    sort_order: sortOrderNum,
  };
}

function main() {
  const args = parseArgs(process.argv);
  // scripts → web → apps → project-manager → docs
  const defaultCsv = path.join(__dirname, "..", "..", "..", "docs", "価格表", "見積項目マスタ加工用.csv");
  const csvPath = path.resolve(args.csv ?? defaultCsv);
  const outPath = args.outPath
    ? path.resolve(args.outPath)
    : path.join(__dirname, "..", "..", "..", "..", "platform-common", "database", "seeds", "estimate_item_master_from_price_csv.sql");

  const raw = readFileSync(csvPath, "utf8");
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);

  const header = lines[0]?.trim();
  if (header !== "item_name,unit_type,unit_price,is_active,sort_order") {
    console.warn("[warn] ヘッダが想定と異なります:", header);
  }

  const rows = [];
  const seen = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    const row = parseRow(line);
    if (row.item_name.length > 255) {
      throw new Error(`item_name が255文字超: ${row.item_name.slice(0, 40)}…`);
    }
    if (seen.has(row.item_name)) {
      throw new Error(`CSV 内で item_name 重複: ${row.item_name}`);
    }
    seen.set(row.item_name, true);
    rows.push(row);
  }

  const valueLines = rows.map(
    (r) =>
      `(${sqlString(r.item_name)},${sqlString(r.unit_type)},${r.unit_price.toFixed(2)},${r.is_active},${r.sort_order})`,
  );

  const sql = `-- 見積項目マスタ（CSV 由来）
-- ソース: project-manager/docs/価格表/見積項目マスタ加工用.csv
-- 再生成: cd project-manager/apps/web ; npm run import:estimate-item-master
--
-- 実行前に対象 DB を選択してください（例）:
--   USE alrfy_ai_db_dev;

SET NAMES utf8mb4;

INSERT INTO estimate_item_master (item_name, unit_type, unit_price, is_active, sort_order) VALUES
${valueLines.join(",\n")}
ON DUPLICATE KEY UPDATE
  unit_type = VALUES(unit_type),
  unit_price = VALUES(unit_price),
  is_active = VALUES(is_active),
  sort_order = VALUES(sort_order);
`;

  writeFileSync(outPath, sql, "utf8");
  console.log(`[import-estimate-item-master] ${rows.length} 行 → ${outPath}`);
}

main();
