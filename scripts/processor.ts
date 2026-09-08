import Ocr from '@gutenye/ocr-node';
import { setTimeout as sleep } from 'node:timers/promises';
import { annotate, ModelError } from '../lib/ai';
import { paddleLinesToSpans, OCR_ENGINE, type PaddleLine } from '../lib/paddle-lines';
import type { ReadingContext } from '../lib/reading-context';
import type { Spread, TextSpan } from '../lib/types';

// A killed supervisor must not leave an unmanaged OCR process behind.
process.on('disconnect', () => process.exit(1));

process.loadEnvFile('.dev.vars');
const token = process.env.PROCESSOR_TOKEN;
const key = process.env.OPENAI_API_KEY;
if (!token || !key)
  throw new Error('Configure PROCESSOR_TOKEN and OPENAI_API_KEY in .dev.vars');
const base = process.env.PROCESSOR_BASE_URL || 'http://127.0.0.1:3000';
const model = process.env.OPENAI_MODEL || 'gpt-5.6-sol';
const siteHeaders: Record<string, string> =
  new URL(base).hostname.endsWith('.chatgpt.site') &&
  process.env.SITE_ACCESS_TOKEN
    ? { 'OAI-Sites-Authorization': `Bearer ${process.env.SITE_ACCESS_TOKEN}` }
    : {};
const ocr = await Ocr.create({ onnxOptions: { intraOpNumThreads: 2 } });
const pulse = (type: string) => { if (process.connected) process.send?.({ type }); };
setInterval(() => pulse('alive'), 15000).unref();
type Job = { session: string; spread: Spread; lease: number };
async function call<T>(input: unknown): Promise<T> {
  const r = await fetch(`${base}/api/processor`, {
    method: 'POST',
    headers: {
      ...siteHeaders,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(90000),
  });
  const result = (await r.json()) as T & { error?: string };
  if (!r.ok) {
    console.log(`Cloud processor API returned HTTP ${r.status}.`);
    throw new Error(result.error || `后台连接失败 (${r.status})`);
  }
  return result;
}
async function readImage(
  session: string,
  spread: Spread,
  side: 'original' | 'left' | 'right',
) {
  const r = await fetch(
    `${base}/api/sessions/${session}/spreads/${spread.id}/image/${side}?v=${spread.revision}`,
    { signal: AbortSignal.timeout(30000), headers: siteHeaders },
  );
  if (!r.ok) throw new Error('无法读取书页照片，请重试。');
  return Buffer.from(await r.arrayBuffer());
}
async function processJob(job: Job) {
  const started = performance.now();
  const timings: Record<string, number> = {};
  async function timed<T>(stage: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await work(); }
    finally { timings[stage] = Math.round(performance.now() - start); }
  }
  pulse('job-start');
  console.log(`Starting photo ${job.spread.sequence} (session ${job.session.slice(0, 8)}).`);
  const identity = {
    session: job.session,
    id: job.spread.id,
    lease: job.lease,
  };
  const update = <T = Spread>(
    action: string,
    extra: Record<string, unknown> = {},
  ) => call<T>({ ...identity, action, ...extra });
  const heartbeat = setInterval(
    () => void update('heartbeat').catch(() => {}),
    20000,
  );
  try {
    if ((job.spread.pipeline?.attempts ?? 0) > 3)
      throw new Error('后台任务多次中断，请在电脑端点击重试。');
    const annotationOnly = job.spread.pipeline?.mode === 'annotations';
    if(annotationOnly && !job.spread.spans?.length) throw new Error('缺少已有 OCR，已停止仅批注任务。');
    const [spread, context, photo] = await Promise.all([
      annotationOnly ? Promise.resolve(job.spread) : timed('split', () => update('split')),
      timed('context_download', () => update<{spreads: Spread[]}>('context')),
      timed('original_download', () => readImage(job.session, job.spread, 'original')),
    ]);
    const spans: TextSpan[] = annotationOnly ? job.spread.spans! : [];
    if(!annotationOnly) {
    const images = await timed('page_downloads', () => Promise.all(
      (['left', 'right'] as const).map((side) => readImage(job.session, spread, side)),
    ));
    const leftLines = await timed<PaddleLine[]>('ocr_left', () => ocr.detect(images[0]));
    spans.push(...paddleLinesToSpans(leftLines, 'left', spread.left));
    const [, rightLines] = await Promise.all([
      update('progress', { stage: 'ocr_right' }),
      timed<PaddleLine[]>('ocr_right', () => ocr.detect(images[1])),
    ]);
    spans.push(...paddleLinesToSpans(rightLines, 'right', spread.right));
    }
    if (
      !spans.some((s) => s.side === 'left') ||
      !spans.some((s) => s.side === 'right')
    )
      throw new Error('有一页未识别到可靠文字，请检查照片是否完整、清晰。');
    const history: ReadingContext[] = [];
    for (const prior of context.spreads) {
      let priorSpans = annotationOnly || prior.ocrEngine === OCR_ENGINE ? prior.spans : undefined;
      if (!priorSpans?.length) {
        if(annotationOnly) throw new Error('前文缺少已有 OCR，已停止；不会重新识别。');
        await update('progress', { stage: 'context', spans });
        priorSpans = [];
        for (const side of ['left', 'right'] as const) {
          const lines = await ocr.detect(
            await readImage(job.session, prior, side),
          );
          priorSpans.push(...paddleLinesToSpans(lines, side, prior[side]));
        }
      }
      if (!priorSpans.length)
        throw new Error('前文照片识别失败，请先处理前一张照片。');
      history.push({
        spreadId: prior.id,
        revision: prior.revision,
        sequence: prior.sequence,
        lines: priorSpans.map((s) => ({ side: s.side, text: s.text })),
      });
    }
    if(!annotationOnly) await timed('save_ocr', () => update('progress', { stage: 'annotating', spans }));
    const result = await timed('ai', () => annotate(
      spans,
      key!,
      model,
      history,
      `data:image/jpeg;base64,${photo.toString('base64')}`,
    ));
    await timed('save_result', () => update('complete', {
      ...result,
      model,
      contextSources: history.map(({ spreadId, revision, sequence }) => ({
        spreadId,
        revision,
        sequence,
      })),
    }));
    console.log(`Completed photo ${spread.sequence}`);
  } catch (error) {
    const message =
      error instanceof ModelError
        ? error.message
        : error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
          ? error.message
          : '自动处理失败，请在电脑端重试；原图已保留。';
    await update('fail', { error: message }).catch(() => {});
    console.warn('Photo processing failed; original retained.');
    console.log(`Photo ${job.spread.sequence} failed (${error instanceof Error ? error.name : 'UnknownError'}).`);
  } finally {
    clearInterval(heartbeat);
    pulse('job-end');
    console.log(`Photo ${job.spread.sequence} timings(ms): ${JSON.stringify({ ...timings, total: Math.round(performance.now() - started) })}`);
  }
}
console.log('Background book processor ready.');
// Independent liveness, including while idle or waiting for an AI response.
let presencePending = false;
async function presence() {
  if (presencePending) return;
  presencePending = true;
  try { await call({ action: 'presence' }); }
  catch { /* The claim loop reports connectivity; do not stop processing. */ }
  finally { presencePending = false; }
}
void presence();
setInterval(() => void presence(), 30000).unref();
let warned = false;
while (true) {
  try {
    const { job } = await call<{ job: Job | null }>({ action: 'claim' });
    warned = false;
    if (job) {
      await processJob(job);
      continue;
    }
  } catch {
    if (!warned) {
      console.log('Cloud connection unavailable; retrying automatically.');
      warned = true;
    }
  }
  await sleep(1500);
}
