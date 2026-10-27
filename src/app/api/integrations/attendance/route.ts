import { NextResponse } from 'next/server';
import { ingestAttendance } from '@/lib/service';
import { AppError } from '@/lib/policy';
import { ZodError } from 'zod';
import { normalizeAttendance } from '@/lib/integrations/adapters';
export async function POST(req: Request) {
  try {
    if (Number(req.headers.get('content-length')) > 16384)
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    const company = req.headers.get('x-company-id'),
      key = req.headers.get('x-api-key');
    if (!company || !key)
      return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
    const raw = await req.text();
    if (raw.length > 16384)
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    const payload = normalizeAttendance(
      req.headers.get('x-device-format') ?? 'generic',
      JSON.parse(raw),
    );
    const result = await ingestAttendance(company, key, payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AppError ? e.message : 'Invalid attendance event' },
      {
        status:
          e instanceof AppError
            ? e.status
            : e instanceof ZodError || e instanceof SyntaxError
              ? 400
              : 500,
      },
    );
  }
}
