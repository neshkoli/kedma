import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function createR2Client(env) {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * @param {{
 *   env: NodeJS.ProcessEnv,
 *   key: string,
 *   filePath: string,
 *   contentType?: string,
 *   dryRun?: boolean,
 * }} options
 */
export async function uploadAudio(options) {
  const { env, key, filePath, contentType = 'audio/mpeg', dryRun = false } = options;
  if (dryRun) {
    return { key, dryRun: true };
  }
  const bucket = env.R2_BUCKET;
  if (!bucket) throw new Error('Missing R2_BUCKET');
  const client = createR2Client(env);
  const body = await readFile(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, dryRun: false };
}
