import { readFile, writeFile } from "node:fs/promises";

const UPDATES_PATH = "project-manager/apps/web/app/data/updates.json";
const MAX_ITEMS = 20;

function describeFilePurpose(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  const knownPurposes = [
    {
      pattern: "/app/components/SystemUpdatesCard.tsx",
      purpose: "システム更新履歴に表示される内容",
    },
    {
      pattern: "/app/components/DashboardShell.tsx",
      purpose: "共通ヘッダー・サイドメニュー・AIチャット導線",
    },
    {
      pattern: "/app/page.tsx",
      purpose: "ダッシュボードのメイン画面",
    },
    {
      pattern: "/app/data/updates.json",
      purpose: "システム更新履歴の表示データ",
    },
    {
      pattern: "/.github/workflows/update-dashboard-history.yml",
      purpose: "更新履歴を自動生成するGitHub Actions設定",
    },
    {
      pattern: "/.github/scripts/update-web-updates.mjs",
      purpose: "push内容を日本語要約して更新履歴へ反映する処理",
    },
  ];

  const matched = knownPurposes.find((entry) => normalized.endsWith(entry.pattern));
  if (matched) {
    return matched.purpose;
  }
  return "関連機能";
}

function normalizeTitle(title) {
  return String(title ?? "")
    .trim()
    .replace(/^更新[:：]\s*/u, "更新：")
    .replace(/\s{2,}/g, " ");
}

function toDateTimeJst(value) {
  const date = value ? new Date(value) : new Date();
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(date).replace("T", " ");
}

function collectPushContext(payload) {
  const commits = Array.isArray(payload?.commits) ? payload.commits : [];
  const changedFiles = new Set();
  for (const commit of commits) {
    for (const file of commit.added ?? []) changedFiles.add(file);
    for (const file of commit.modified ?? []) changedFiles.add(file);
    for (const file of commit.removed ?? []) changedFiles.add(file);
  }

  return {
    branch: payload?.ref ?? "",
    compareUrl: payload?.compare ?? "",
    headMessage: payload?.head_commit?.message ?? "",
    headTimestamp: payload?.head_commit?.timestamp ?? new Date().toISOString(),
    headSha: payload?.after ?? payload?.head_commit?.id ?? "",
    commitMessages: commits.map((commit) => `- ${String(commit.message ?? "").trim()}`).slice(0, 12),
    changedFiles: [...changedFiles].slice(0, 80),
  };
}

function fallbackSummary(context) {
  const primaryFile = context.changedFiles[0] ?? "";
  const purpose = describeFilePurpose(primaryFile);
  const headline = context.headMessage.split("\n")[0]?.trim() || "機能改善";
  return {
    title: normalizeTitle(`更新：${headline}（${purpose}）の品質向上をしました`).slice(0, 64),
    summary: "",
  };
}

async function summarizeInJapanese(context) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-pro-preview-03-25";
  if (!apiKey) {
    return fallbackSummary(context);
  }

  const prompt = [
    "あなたはGitの更新履歴要約アシスタントです。",
    "以下のpush情報から、日本語の更新履歴を作成してください。",
    "制約:",
    "- titleは必ず日本語で書く",
    "- titleは「更新：」で始める",
    "- titleには、何を更新したかと、なぜ更新したか(目的)を1文で含める",
    "- ファイル名が含まれる場合は、日本語で用途を括弧補足する（例: SystemUpdatesCard.tsx（システム更新履歴に表示される内容））",
    "- titleは24〜56文字目安",
    "- summaryは空文字にする",
    "- 誇張しない。実際の変更だけを書く",
    "- 出力はJSONのみ",
    '- JSON形式: {"title":"...","summary":"..."}',
    "",
    `branch: ${context.branch}`,
    `compare: ${context.compareUrl}`,
    "file purpose hints:",
    context.changedFiles
      .slice(0, 12)
      .map((file) => `- ${file}: ${describeFilePurpose(file)}`)
      .join("\n") || "- (なし)",
    "commit messages:",
    context.commitMessages.join("\n") || "- (なし)",
    "changed files:",
    context.changedFiles.map((file) => `- ${file}`).join("\n") || "- (なし)",
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 180,
      },
    }),
  });

  if (!response.ok) {
    return fallbackSummary(context);
  }

  const data = await response.json();
  const text = String(
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => String(part?.text ?? ""))
      .join("") ?? "",
  ).trim();
  if (!text) {
    return fallbackSummary(context);
  }

  try {
    const normalized = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(normalized);
    const title = normalizeTitle(String(parsed.title ?? ""));
    const summary = String(parsed.summary ?? "").trim();
    if (!title || !title.startsWith("更新：")) {
      return fallbackSummary(context);
    }
    return { title, summary };
  } catch {
    return fallbackSummary(context);
  }
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is not set.");
  }

  const payload = JSON.parse(await readFile(eventPath, "utf8"));
  const context = collectPushContext(payload);
  const summary = await summarizeInJapanese(context);

  let updates = [];
  try {
    updates = JSON.parse(await readFile(UPDATES_PATH, "utf8"));
    if (!Array.isArray(updates)) {
      updates = [];
    }
  } catch {
    updates = [];
  }

  const shortSha = (context.headSha || "unknown").slice(0, 7);
  const nextItem = {
    id: `gh-${shortSha}-${Date.now().toString(36)}`,
    datetime: toDateTimeJst(context.headTimestamp),
    version: `push-${shortSha}`,
    title: summary.title,
    summary: summary.summary,
  };

  const filtered = updates.filter((item) => item && item.version !== nextItem.version);
  const nextUpdates = [nextItem, ...filtered].slice(0, MAX_ITEMS);
  await writeFile(UPDATES_PATH, `${JSON.stringify(nextUpdates, null, 2)}\n`, "utf8");
}

await main();
