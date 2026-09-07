import { db, json, failure, requireSession } from '@/lib/server';
export async function GET(
  _: Request,
  { params }: { params: Promise<{ session: string }> },
) {
  try {
    const { session } = await params;
    const s = await requireSession(session);
    await db()
      .prepare(
        "UPDATE spreads SET status='failed',job_started=NULL WHERE session_id=? AND status='annotating' AND job_started<?",
      )
      .bind(session, Date.now() - 180000)
      .run();
    const { results } = await db()
      .prepare(
        'SELECT data,status,revision FROM spreads WHERE session_id=? ORDER BY sequence',
      )
      .bind(session)
      .all<{ data: string; status: string; revision: number }>();
    return json({
      ...s,
      spreads: results.map((r) => ({
        ...JSON.parse(r.data),
        status: r.status,
        revision: r.revision,
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
