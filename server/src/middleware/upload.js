import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const uploadRoot = path.resolve(__dirname, '../../', config.storage.dir);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(uploadRoot);

// Extension allow-list. Anything executable or scriptable is rejected outright
// rather than relying on the client-supplied MIME type.
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.odt',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.ppt', '.pptx', '.xls', '.xlsx', '.csv',
  '.zip',
]);

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    // One folder per category keeps uploads browsable and easy to prune.
    const folder = path.join(uploadRoot, req.uploadCategory || 'general');
    try {
      ensureDir(folder);
      cb(null, folder);
    } catch (error) {
      cb(error);
    }
  },
  filename(_req, file, cb) {
    // Never reuse the client's filename: it can contain path traversal or
    // collide with another user's upload.
    const ext = path.extname(file.originalname).toLowerCase();
    const safeStem = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .slice(0, 40) || 'file';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeStem}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(ApiError.badRequest(`Files of type "${ext || 'unknown'}" are not allowed`));
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.storage.maxFileSizeMb * 1024 * 1024,
    files: 5,
  },
});

/** Tag the request so files land in a category folder. */
export const uploadTo = (category) => (req, _res, next) => {
  req.uploadCategory = String(category).replace(/[^a-z0-9-]/gi, '') || 'general';
  next();
};

/** The public URL for a stored file, as served by app.js. */
export function fileUrl(file) {
  if (!file) return null;
  const relative = path.relative(uploadRoot, file.path).split(path.sep).join('/');
  return `/uploads/${relative}`;
}

export default { upload, uploadTo, fileUrl, uploadRoot };
