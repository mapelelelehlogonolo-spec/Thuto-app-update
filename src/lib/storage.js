// File storage for Library uploads.
//
// If Cloudflare R2 (or any S3-compatible) credentials are set in the
// environment, files go to that bucket -- permanent, and works on hosts
// with no persistent disk (like Render's free plan). If they are NOT set,
// files are saved to a local `data/uploads` folder instead, so you can test
// uploads on your own computer with zero extra setup.
//
// Required env vars for R2 (all four, or none):
//   R2_ACCOUNT_ID         -- from the Cloudflare dashboard
//   R2_ACCESS_KEY_ID      -- an R2 API token's access key id
//   R2_SECRET_ACCESS_KEY  -- that token's secret
//   R2_BUCKET             -- the bucket name you created

const path = require('node:path');
const fs = require('node:fs');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
} = process.env;

const useR2 = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);

let s3 = null;
let PutObjectCommand, GetObjectCommand, getSignedUrl;
if (useR2) {
  const s3mod = require('@aws-sdk/client-s3');
  ({ PutObjectCommand, GetObjectCommand } = s3mod);
  ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
  s3 = new s3mod.S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    // Cloudflare R2 rejects the newer AWS SDK's automatic integrity checksums
    // (shows up as a bogus "Access Denied"). Only send them when required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

const localDir = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!useR2 && !fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

function backend() {
  return useR2 ? 'r2' : 'local';
}

// Store a file buffer under `key`. Returns nothing (throws on failure).
async function putObject(key, buffer, contentType) {
  if (useR2) {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }));
  } else {
    // key can contain "/" -- flatten it so it's one safe local filename
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.writeFileSync(path.join(localDir, safe), buffer);
  }
}

// For R2: return a short-lived signed URL the browser can download from.
// For local: return null (caller streams the file from disk instead).
async function getDownloadUrl(key, downloadName, inline) {
  if (!useR2) return null;
  // Images/videos/audio open inline in the page; documents download.
  const disposition = downloadName
    ? `${inline ? 'inline' : 'attachment'}; filename="${downloadName}"`
    : undefined;
  const cmd = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ResponseContentDisposition: disposition,
  });
  return getSignedUrl(s3, cmd, { expiresIn: 300 });
}

// For local backend: absolute path to the stored file (or null if missing).
function localPath(key) {
  if (useR2) return null;
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
  const p = path.join(localDir, safe);
  return fs.existsSync(p) ? p : null;
}

module.exports = { backend, putObject, getDownloadUrl, localPath };
