import { db, json, failure, checkOrigin } from '@/lib/server';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const id = crypto.randomUUID(),
      created_at = Date.now();
    await db()
      .prepare(
        'INSERT INTO scan_sessions (id,created_at,next_sequence) VALUES (?,?,0)',
      )
      .bind(id, created_at)
      .run();
    return json({ id, created_at, spreads: [] }, 201);
  } catch (e) {
    return failure(e);
  }
}
