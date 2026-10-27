import { AppError } from './policy';
import { ZodError } from 'zod';
export function apiError(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof AppError
          ? error.message
          : error instanceof ZodError
            ? 'ข้อมูลไม่ถูกต้อง'
            : 'ไม่สามารถทำรายการได้',
    },
    { status: error instanceof AppError ? error.status : error instanceof ZodError ? 400 : 500 },
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host)
    .split(',')[0]
    .trim();
  const protocol = (request.headers.get('x-forwarded-proto') || url.protocol.slice(0, -1))
    .split(',')[0]
    .trim();
  let source: URL;
  try {
    source = new URL(origin ?? '');
  } catch {
    throw new AppError('Origin not allowed', 403);
  }
  if (
    source.host !== host ||
    source.protocol !== protocol + ':' ||
    !['http:', 'https:'].includes(source.protocol)
  )
    throw new AppError('Origin not allowed', 403);
}
