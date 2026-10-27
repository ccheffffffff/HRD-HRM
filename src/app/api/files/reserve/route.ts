import { context } from '@/lib/session';
import { reserveAsset } from '@/lib/files';
import { apiError, sameOrigin } from '@/lib/api';
export async function POST(req: Request) {
  const a = await context();
  try {
    sameOrigin(req);
    return Response.json(await reserveAsset(a, await req.json()));
  } catch (e) {
    return apiError(e);
  }
}
