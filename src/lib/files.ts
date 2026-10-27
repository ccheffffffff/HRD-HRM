import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { head, get } from '@vercel/blob';
import { z } from 'zod';
import { query, transaction } from './db';
import { allow, AppError, staff, type Actor } from './policy';
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const fileTypes = ['application/pdf', 'video/mp4', 'video/webm'] as const;
export const uploadSchema = z.object({
  course_id: z.uuid(),
  filename: z.string().trim().min(1).max(180),
  content_type: z.enum(fileTypes),
  size_bytes: z.number().int().min(1).max(MAX_FILE_BYTES),
});
export function validateFileHeader(type: string, header: Uint8Array) {
  const b = Buffer.from(header);
  const valid =
    type === 'application/pdf'
      ? b.subarray(0, 5).toString() === '%PDF-'
      : type === 'video/mp4'
        ? b.subarray(4, 8).toString() === 'ftyp'
        : type === 'video/webm'
          ? b.subarray(0, 4).toString('hex') === '1a45dfa3'
          : false;
  if (!valid) throw new AppError('เนื้อหาไฟล์ไม่ตรงชนิด PDF / MP4 / WebM');
}
export function storageMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.VERCEL)
    throw new AppError('ยังไม่ได้เชื่อมพื้นที่ไฟล์ private สำหรับเว็บออนไลน์', 503);
  return 'local';
}
export async function reserveAsset(a: Actor, input: unknown) {
  allow(a, ['admin', 'hr']);
  const v = uploadSchema.parse(input);
  const mode = storageMode();
  return transaction(async (db) => {
    const c = (
      await db.query('SELECT published FROM courses WHERE company_id=$1 AND id=$2 FOR UPDATE', [
        a.companyId,
        v.course_id,
      ])
    ).rows[0];
    if (!c) throw new AppError('ไม่พบหลักสูตร', 404);
    if (c.published) throw new AppError('อัปโหลดได้เฉพาะหลักสูตรฉบับร่าง');
    await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [a.companyId]);
    const used = (
      await db.query(
        `SELECT COALESCE(SUM(size_bytes),0) bytes FROM learning_assets WHERE company_id=$1 AND (state='ready' OR (state='pending' AND created_at>now()-interval '1 hour'))`,
        [a.companyId],
      )
    ).rows[0];
    const quota = 250 * 1024 * 1024;
    if (Number(used.bytes) + v.size_bytes > quota)
      throw new AppError('พื้นที่ไฟล์ของบริษัทเต็ม (250 MB)');
    const assetId = randomUUID(),
      extension =
        v.content_type === 'application/pdf'
          ? 'pdf'
          : v.content_type === 'video/mp4'
            ? 'mp4'
            : 'webm';
    const pathname = `companies/${a.companyId}/${assetId}.${extension}`;
    await db.query(
      'INSERT INTO learning_assets(id,company_id,course_id,created_by,filename,content_type,size_bytes,storage,pathname) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        assetId,
        a.companyId,
        v.course_id,
        a.userId,
        v.filename.replace(/[\r\n\x00]/g, ''),
        v.content_type,
        v.size_bytes,
        mode,
        pathname,
      ],
    );
    return { id: assetId, pathname, storage: mode };
  });
}
export async function ownedAsset(a: Actor, assetId: string) {
  allow(a, ['admin', 'hr']);
  const [asset] = await query(
    'SELECT a.*,c.published FROM learning_assets a JOIN courses c ON c.id=a.course_id WHERE a.company_id=$1 AND a.id=$2',
    [a.companyId, z.uuid().parse(assetId)],
  );
  if (!asset) throw new AppError('ไม่พบไฟล์', 404);
  if (asset.created_by !== a.userId && !staff(a)) throw new AppError('ไม่มีสิทธิ์', 403);
  return asset;
}
export function localAssetPath(assetId: string) {
  return path.resolve(process.env.UPLOAD_DIRECTORY || 'data/uploads', z.uuid().parse(assetId));
}
export async function storeLocalAsset(a: Actor, assetId: string, file: File) {
  const asset = await ownedAsset(a, assetId);
  if (asset.storage !== 'local' || process.env.VERCEL)
    throw new AppError('ไม่รองรับการอัปโหลดแบบ local บนเซิร์ฟเวอร์นี้');
  if (asset.state !== 'pending' || asset.published)
    throw new AppError('ไฟล์นี้ไม่สามารถเขียนทับได้');
  if (file.size !== Number(asset.size_bytes) || file.type !== asset.content_type)
    throw new AppError('ขนาดหรือชนิดไฟล์ไม่ตรงกับข้อมูลที่ลงทะเบียน');
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateFileHeader(asset.content_type, bytes.subarray(0, 16));
  const destination = localAssetPath(asset.id);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
  await query(`UPDATE learning_assets SET state='ready' WHERE id=$1 AND company_id=$2`, [
    asset.id,
    a.companyId,
  ]);
  await fileAudit(asset);
  return { id: asset.id };
}
async function fileAudit(asset: Record<string, any>) {
  await query(
    `INSERT INTO audit_logs(company_id,actor_id,action,entity_id) VALUES($1,$2,'file.upload',$3)`,
    [asset.company_id, asset.created_by, asset.id],
  );
}
export async function finishBlobAsset(assetId: string, expectedPath?: string) {
  const [asset] = await query('SELECT * FROM learning_assets WHERE id=$1', [
    z.uuid().parse(assetId),
  ]);
  if (!asset || asset.storage !== 'blob' || (expectedPath && asset.pathname !== expectedPath))
    throw new AppError('ไม่พบไฟล์', 404);
  if (asset.state === 'ready') return { id: asset.id };
  if (asset.state !== 'pending') throw new AppError('ไฟล์ไม่ผ่านการตรวจสอบ');
  const metadata = await head(asset.pathname);
  if (
    metadata.size !== Number(asset.size_bytes) ||
    metadata.contentType !== asset.content_type ||
    !new URL(metadata.url).hostname.endsWith('.private.blob.vercel-storage.com')
  )
    throw new AppError('ข้อมูลไฟล์หรือพื้นที่จัดเก็บไม่ถูกต้อง');
  const result = await get(asset.pathname, { access: 'private', headers: { Range: 'bytes=0-15' } });
  if (!result || !result.stream) throw new AppError('อ่านไฟล์ไม่สำเร็จ');
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (length < 16) {
    const part = await reader.read();
    if (part.done) break;
    chunks.push(part.value);
    length += part.value.length;
  }
  await reader.cancel();
  try {
    validateFileHeader(asset.content_type, Buffer.concat(chunks).subarray(0, 16));
  } catch (e) {
    await query(`UPDATE learning_assets SET state='rejected' WHERE id=$1`, [asset.id]);
    throw e;
  }
  const updated = await query(
    `UPDATE learning_assets SET state='ready' WHERE id=$1 AND state='pending' RETURNING id`,
    [asset.id],
  );
  if (updated.length) await fileAudit(asset);
  return { id: asset.id };
}
export async function readableAsset(a: Actor, assetId: string) {
  const [asset] = await query(
    "SELECT * FROM learning_assets WHERE company_id=$1 AND id=$2 AND state='ready'",
    [a.companyId, z.uuid().parse(assetId)],
  );
  if (!asset) throw new AppError('ไม่พบไฟล์', 404);
  if (!staff(a)) {
    const [en] = await query(
      `SELECT en.id FROM lessons l JOIN courses c ON c.id=l.course_id AND c.company_id=l.company_id JOIN enrollments en ON en.course_id=c.id AND en.company_id=c.company_id WHERE l.company_id=$1 AND l.asset_id=$2 AND en.employee_id=$3 AND c.published=true LIMIT 1`,
      [a.companyId, asset.id, a.employeeId],
    );
    if (!en) throw new AppError('คุณไม่ได้รับมอบหมายบทเรียนนี้', 403);
  }
  return asset;
}
export function byteRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new AppError('Invalid Range', 416);
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw new AppError('Invalid Range', 416);
  return { start, end };
}
