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
    .replace(/^更新[:：]\s*/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripFileNameLikeTokens(text) {
  return String(text ?? "")
    .replace(/\b[\w./-]+\.(?:tsx?|jsx?|mjs|cjs|json|md|yml|yaml|css|scss|php|sql)\b/gi, "")
    .replace(/（\s*[^）]*\.(?:tsx?|jsx?|mjs|cjs|json|md|yml|yaml|css|scss|php|sql)\s*[^）]*）/gi, "")
    .replace(/\(\s*[^)]*\.(?:tsx?|jsx?|mjs|cjs|json|md|yml|yaml|css|scss|php|sql)\s*[^)]*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildPurposeHints(context) {
  const hints = [];
  const seen = new Set();
  for (const file of context.changedFiles) {
    const purpose = describeFilePurpose(file);
    if (!purpose || seen.has(purpose)) continue;
    seen.add(purpose);
    hints.push(purpose);
    if (hints.length >= 3) break;
  }
  return hints;
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
  const hints = buildPurposeHints(context);
  const cleanedHeadline = stripFileNameLikeTokens(context.headMessage.split("\n")[0] ?? "");
  const headline = cleanedHeadline || "機能改善";
  const purposeText = hints.length > 0 ? hints.join("・") : "関連機能";
  return {
    title: normalizeTitle(`${purposeText}を中心に、${headline}を実施しました`).slice(0, 128),
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
    "- titleに「更新：」「更新:」などのラベル前置きは付けない",
    "- titleには、何を更新したかと、なぜ更新したか(目的)を1文で含める",
    "- ファイル名・拡張子・パス（例: *.tsx, app/...）はtitleに含めない",
    "- 「（関連機能）の品質向上をしました」の定型句は使わない",
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
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
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
    const title = normalizeTitle(stripFileNameLikeTokens(String(parsed.title ?? "")));
    const summary = String(parsed.summary ?? "").trim();
    if (!title) {
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
