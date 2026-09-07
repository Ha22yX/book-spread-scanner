import { db, json, conditionalJson, failure, requireSession } from '@/lib/server';
import { SUMMARY_SQL } from '@/lib/spread-summary';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ session: string }> },
) {
  try {
    const { session } = await params;
    const s = await requireSession(session);
    const summary = new URL(request.url).searchParams.get('summary') === '1';
    await db()
      .prepare(
        "UPDATE spreads SET status='failed',job_started=NULL WHERE session_id=? AND status='annotating' AND job_started<?",
      )
      .bind(session, Date.now() - 180000)
      .run();
    const { results } = await db()
      .prepare(
        summary ? SUMMARY_SQL : "SELECT data,status,revision FROM spreads WHERE session_id=? AND status!='deleted' ORDER BY sequence",
      )
      .bind(session)
      .all<{ data: string; status: string; revision: number; contentBytes?: number }>();
    const data = {
      ...s,
      spreads: results.map((r) => ({
        ...JSON.parse(r.data),
        status: r.status,
        revision: r.revision,
        ...(summary ? {contentBytes: r.contentBytes} : {}),
      })),
    };
    return summary ? conditionalJson(request, data) : json(data);
  } catch (e) {
    return failure(e);
  }
}
