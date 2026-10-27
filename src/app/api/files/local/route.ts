import { context } from '@/lib/session';
import { MAX_FILE_BYTES, storeLocalAsset } from '@/lib/files';
import { apiError, sameOrigin } from '@/lib/api';
import { AppError } from '@/lib/policy';
export async function POST(req: Request) {
  const a = await context();
  try {
    sameOrigin(req);
    if (process.env.VERCEL) throw new AppError('Local uploads disabled', 403);
    if (Number(req.headers.get('content-length')) > MAX_FILE_BYTES + 1024 * 1024)
      throw new AppError('ไฟล์ใหญ่เกินกำหนด', 413);
    const data = await req.formData();
    const file = data.get('file');
    if (!(file instanceof File)) throw new AppError('ไม่พบไฟล์');
    return Response.json(await storeLocalAsset(a, String(data.get('asset_id')), file));
  } catch (e) {
    return apiError(e);
  }
}
