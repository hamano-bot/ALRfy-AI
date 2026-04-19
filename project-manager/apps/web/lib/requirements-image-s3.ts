import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

/** 要件定義に貼る画像用。開発・本番とも S3（または LocalStack 等の互換エンドポイント）へ同じキー規則で配置する。 */

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export type RequirementsS3Config = {
  bucket: string;
  region: string;
  publicBaseUrl: string;
  /** 先頭・末尾スラッシュなし。例: `dev` や `stg` */
  keyPrefix: string;
  endpoint?: string;
  forcePathStyle: boolean;
  maxBytes: number;
};

export function getRequirementsS3Config(): RequirementsS3Config | null {
  const bucket = process.env.REQUIREMENTS_S3_BUCKET?.trim();
  const publicBaseUrl = process.env.REQUIREMENTS_S3_PUBLIC_BASE_URL?.trim();
  if (!bucket || !publicBaseUrl) {
    return null;
  }
  const region = process.env.AWS_REGION?.trim() || "ap-northeast-1";
  const rawPrefix = (process.env.REQUIREMENTS_S3_KEY_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, "");
  const endpoint =
    process.env.REQUIREMENTS_S3_ENDPOINT?.trim() || process.env.AWS_S3_ENDPOINT?.trim() || undefined;
  const maxRaw = process.env.REQUIREMENTS_S3_MAX_FILE_BYTES?.trim();
  const maxBytes =
    maxRaw !== undefined && maxRaw !== "" && /^\d+$/.test(maxRaw)
      ? Number.parseInt(maxRaw, 10)
      : DEFAULT_MAX_BYTES;
  return {
    bucket,
    region,
    publicBaseUrl,
    keyPrefix: rawPrefix,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES,
  };
}

function buildObjectKey(projectId: number, ext: string, keyPrefix: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const id = randomUUID();
  const segments = [
    keyPrefix,
    `projects/${projectId}/requirements/images`,
    `${id}.${safeExt}`,
  ].filter((s) => s.length > 0);
  return segments.join("/");
}

function publicUrlForKey(publicBaseUrl: string, key: string): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  const path = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/${path}`;
}

export function normalizeMimeAndExt(contentType: string): { mime: string; ext: string } | null {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    return null;
  }
  return { mime, ext };
}

export async function uploadRequirementsProjectImage(params: {
  projectId: number;
  body: Buffer;
  contentType: string;
}): Promise<{ url: string; key: string }> {
  const cfg = getRequirementsS3Config();
  if (!cfg) {
    throw new Error("REQUIREMENTS_S3_NOT_CONFIGURED");
  }
  const normalized = normalizeMimeAndExt(params.contentType);
  if (!normalized) {
    throw new Error("REQUIREMENTS_S3_BAD_TYPE");
  }
  if (params.body.length > cfg.maxBytes) {
    throw new Error("REQUIREMENTS_S3_TOO_LARGE");
  }
  if (params.body.length === 0) {
    throw new Error("REQUIREMENTS_S3_EMPTY");
  }

  const key = buildObjectKey(params.projectId, normalized.ext, cfg.keyPrefix);

  const client = new S3Client({
    region: cfg.region,
    ...(cfg.endpoint
      ? {
          endpoint: cfg.endpoint,
          forcePathStyle: cfg.forcePathStyle,
          /** LocalStack / MinIO 等では test 鍵が一般的。本番 AWS では endpoint を付けず IAM ロール等を利用 */
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || "test",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || "test",
          },
        }
      : {}),
  });

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: params.body,
      ContentType: normalized.mime,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    key,
    url: publicUrlForKey(cfg.publicBaseUrl, key),
  };
}
