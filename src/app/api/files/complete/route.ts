import { context } from '@/lib/session';
import { ownedAsset, finishBlobAsset } from '@/lib/files';
import { apiError, sameOrigin } from '@/lib/api';
export async function POST(req: Request) {
  const a = await context();
  try {
    sameOrigin(req);
    const asset = await ownedAsset(a, (await req.json()).asset_id);
    return Response.json(await finishBlobAsset(asset.id, asset.pathname));
  } catch (e) {
    return apiError(e);
  }
}
