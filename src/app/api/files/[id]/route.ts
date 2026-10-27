import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
import { context } from '@/lib/session';
import { readableAsset, localAssetPath, byteRange } from '@/lib/files';
import { apiError } from '@/lib/api';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await context();
  try {
    const asset = await readableAsset(a, (await params).id);
    const size = Number(asset.size_bytes);
    const range = byteRange(req.headers.get('range'), size);
    const headers = new Headers({
      'Content-Type': asset.content_type,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    });
    let stream: ReadableStream;
    if (asset.storage === 'blob') {
      const result = await get(asset.pathname, {
        access: 'private',
        headers: range ? { Range: `bytes=${range.start}-${range.end}` } : {},
      });
      if (!result || !result.stream)
        return Response.json({ error: 'File not found' }, { status: 404 });
      stream = result.stream;
      // Only claim 206 if the storage origin actually honored the byte range.
      if (range && !result.headers.has('content-range')) {
        headers.set('Content-Length', String(size));
        return new Response(stream, { headers });
      }
    } else
      stream = Readable.toWeb(
        createReadStream(localAssetPath(asset.id), range ?? undefined),
      ) as ReadableStream;
    headers.set('Content-Length', String(range ? range.end - range.start + 1 : size));
    if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    return new Response(stream, { status: range ? 206 : 200, headers });
  } catch (e) {
    return apiError(e);
  }
}
