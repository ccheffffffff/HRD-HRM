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
  if (origin !== new URL(request.url).origin) throw new AppError('Origin not allowed', 403);
}
