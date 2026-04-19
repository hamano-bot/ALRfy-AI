/**
 * LocalStack 起動後にバケットを作成し、開発用に GetObject を公開読み取り可能にする。
 * 使い方（apps/web から）: npm run localstack:init
 *
 * 環境変数:
 *   REQUIREMENTS_S3_ENDPOINT (既定 http://127.0.0.1:4566)
 *   REQUIREMENTS_S3_BUCKET (既定 alrfy-requirements-local)
 *   AWS_REGION (既定 ap-northeast-1)
 */
import { CreateBucketCommand, PutBucketPolicyCommand, S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

const endpoint =
  process.env.REQUIREMENTS_S3_ENDPOINT?.trim() || process.env.AWS_S3_ENDPOINT?.trim() || "http://127.0.0.1:4566";
const bucket = process.env.REQUIREMENTS_S3_BUCKET?.trim() || "alrfy-requirements-local";
const region = process.env.AWS_REGION?.trim() || "ap-northeast-1";

const client = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || "test",
  },
});

async function main() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`[init-localstack-s3] Bucket "${bucket}" already exists.`);
  } catch {
    await client.send(
      new CreateBucketCommand({
        Bucket: bucket,
        ...(region !== "us-east-1"
          ? { CreateBucketConfiguration: { LocationConstraint: region } }
          : {}),
      }),
    );
    console.log(`[init-localstack-s3] Created bucket "${bucket}".`);
  }

  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AllowPublicReadDev",
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${bucket}/*`,
      },
    ],
  });

  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: policy,
    }),
  );
  console.log(`[init-localstack-s3] Applied public GetObject policy (development only).`);
  console.log(`[init-localstack-s3] Set REQUIREMENTS_S3_PUBLIC_BASE_URL=${endpoint.replace(/\/$/, "")}/${bucket}`);
}

main().catch((e) => {
  console.error("[init-localstack-s3] Failed:", e);
  process.exit(1);
});
