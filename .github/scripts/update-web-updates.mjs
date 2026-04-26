import { readFile, writeFile } from "node:fs/promises";

const UPDATES_PATH = "project-manager/apps/web/app/data/updates.json";
const MAX_ITEMS = 20;

function normalizeTitle(title) {
  return String(title ?? "")
    .trim()
    .replace(/\s{2,}/g, " ")
    .trim();
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
  return {
    headMessage: payload?.head_commit?.message ?? "",
    headTimestamp: payload?.head_commit?.timestamp ?? new Date().toISOString(),
    headSha: payload?.after ?? payload?.head_commit?.id ?? "",
    commitMessages: commits.map((commit) => `- ${String(commit.message ?? "").trim()}`).slice(0, 12),
  };
}

function buildUpdateTitle(context) {
  const fromHeadCommit = normalizeTitle(context.headMessage.split("\n")[0] ?? "");
  if (fromHeadCommit) {
    return fromHeadCommit.slice(0, 128);
  }
  const firstCommitLine = normalizeTitle(
    String(context.commitMessages[0] ?? "").replace(/^-+\s*/, ""),
  );
  if (firstCommitLine) {
    return firstCommitLine.slice(0, 128);
  }
  return "更新";
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is not set.");
  }

  const payload = JSON.parse(await readFile(eventPath, "utf8"));
  const context = collectPushContext(payload);
  const title = buildUpdateTitle(context);

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
    title,
    summary: "",
  };

  const filtered = updates.filter((item) => item && item.version !== nextItem.version);
  const nextUpdates = [nextItem, ...filtered].slice(0, MAX_ITEMS);
  await writeFile(UPDATES_PATH, `${JSON.stringify(nextUpdates, null, 2)}\n`, "utf8");
}

await main();
