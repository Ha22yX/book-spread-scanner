import Ocr from '@gutenye/ocr-node';
import { setTimeout as sleep } from 'node:timers/promises';
import { annotate, ModelError } from '../lib/ai';
import { paddleLinesToSpans, OCR_ENGINE } from '../lib/paddle-lines';
import { previousSpreads, type ReadingContext } from '../lib/reading-context';
import type { Spread, ScanSession, TextSpan } from '../lib/types';

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
  if (!r.ok) throw new Error(result.error || `后台连接失败 (${r.status})`);
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
    let spread = await update('split');
    const spans: TextSpan[] = [];
    for (const side of ['left', 'right'] as const) {
      await update('progress', { stage: `ocr_${side}` });
      const lines = await ocr.detect(
        await readImage(job.session, spread, side),
      );
      spans.push(...paddleLinesToSpans(lines, side, spread[side]));
    }
    if (
      !spans.some((s) => s.side === 'left') ||
      !spans.some((s) => s.side === 'right')
    )
      throw new Error('有一页未识别到可靠文字，请检查照片是否完整、清晰。');
    spread = await update('progress', { stage: 'context', spans });
    const sessionResponse = await fetch(`${base}/api/sessions/${job.session}`, {
      signal: AbortSignal.timeout(15000),
      headers: siteHeaders,
    });
    if (!sessionResponse.ok) throw new Error('无法读取前文。');
    const data = (await sessionResponse.json()) as ScanSession;
    const history: ReadingContext[] = [];
    for (const prior of previousSpreads(data.spreads, spread)) {
      let priorSpans = prior.ocrEngine === OCR_ENGINE ? prior.spans : undefined;
      if (!priorSpans?.length) {
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
    await update('progress', { stage: 'annotating' });
    const photo = await readImage(job.session, spread, 'original');
    const result = await annotate(
      spans,
      key!,
      model,
      history,
      `data:image/jpeg;base64,${photo.toString('base64')}`,
    );
    await update('complete', {
      ...result,
      model,
      contextSources: history.map(({ spreadId, revision, sequence }) => ({
        spreadId,
        revision,
        sequence,
      })),
    });
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
  } finally {
    clearInterval(heartbeat);
  }
}
console.log('Background book processor ready.');
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
      console.warn('Waiting for local web service.');
      warned = true;
    }
  }
  await sleep(1500);
}
