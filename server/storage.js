import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const enabled = Boolean(
  process.env.S3_ENDPOINT &&
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY &&
  process.env.S3_SECRET_KEY
);

const client = enabled ? new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'ru-1',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY
  }
}) : null;

function cleanBase(value='') {
  return String(value).replace(/\/+$/, '');
}

export function s3Enabled() {
  return enabled;
}

export async function putImage({ buffer, mimetype, originalname }) {
  if (!enabled) throw new Error('S3 не настроен');
  const ext = (originalname?.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.jpg').toLowerCase();
  const key = `products/${Date.now()}-${Math.random().toString(36).slice(2,10)}${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    CacheControl: 'public, max-age=31536000, immutable'
  }));

  const publicBase = cleanBase(process.env.S3_PUBLIC_URL || '');
  if (!publicBase) {
    throw new Error('Для S3 укажите S3_PUBLIC_URL');
  }
  return { url: `${publicBase}/${key}`, key };
}

export async function deleteImageByUrl(url) {
  if (!enabled || !url) return false;
  const publicBase = cleanBase(process.env.S3_PUBLIC_URL || '');
  if (!publicBase || !String(url).startsWith(publicBase + '/')) return false;
  const key = String(url).slice(publicBase.length + 1);
  if (!key) return false;

  await client.send(new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key
  }));
  return true;
}