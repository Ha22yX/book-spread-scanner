// Keep only an ID tombstone to fence late jobs and prevent upload retries resurrecting data.
export const DELETE_SPREAD_SQL = "UPDATE spreads SET status='deleted',revision=revision+1,job_started=NULL,data='{}' WHERE id=? AND session_id=? AND status!='deleted'";

export async function removeSpreadFiles(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
