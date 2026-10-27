import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { context } from '@/lib/session';
import { ownedAsset, finishBlobAsset } from '@/lib/files';
import { apiError, sameOrigin } from '@/lib/api';
import { AppError } from '@/lib/policy';
import { z } from 'zod';
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, payload) => {
        sameOrigin(req);
        const a = await context();
        const asset = await ownedAsset(a, z.uuid().parse(payload));
        if (
          asset.storage !== 'blob' ||
          asset.pathname !== pathname ||
          asset.state !== 'pending' ||
          asset.published ||
          Date.now() - new Date(asset.created_at).getTime() > 3600000
        )
          throw new AppError('ไม่สามารถออกสิทธิ์อัปโหลดไฟล์นี้', 403);
        return {
          allowedContentTypes: [asset.content_type],
          maximumSizeInBytes: Number(asset.size_bytes),
          validUntil: Date.now() + 5 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: asset.id,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        await finishBlobAsset(z.uuid().parse(tokenPayload), blob.pathname);
      },
    });
    return Response.json(result);
  } catch (e) {
    return apiError(e);
  }
}
