import type { Spread } from './types';
export const stageLabels = {
  queued: '照片已接收，等待处理',
  splitting: '自动寻找书脊、分割左右页',
  ocr_left: '识别左页文字',
  ocr_right: '识别右页文字',
  context: '联读前两张照片',
  annotating: '结合原图生成英文批注',
  complete: '批注已完成',
  failed: '处理失败',
};
export const stagePercent = {
  queued: 5,
  splitting: 15,
  ocr_left: 35,
  ocr_right: 55,
  context: 70,
  annotating: 85,
  complete: 100,
  failed: 0,
};
export const isProcessing = (spread: Spread) =>
  spread.status === 'queued' ||
  spread.status === 'processing' ||
  spread.status === 'annotating';
export function queueSpread(spread: Spread, mode: 'full' | 'annotations' = 'full'): Spread {
  if(mode === 'annotations' && !spread.spans?.length) throw new Error('缺少已有 OCR，不能只重做批注。');
  return {
    ...spread,
    status: 'queued',
    annotations: mode === 'annotations' ? spread.annotations : [],
    error: undefined,
    annotationWarning: undefined,
    pipeline: {
      mode,
      stage: 'queued',
      percent: 5,
      updatedAt: Date.now(),
      splitReady: spread.pipeline?.splitReady ?? true,
      attempts: 0,
    },
  };
}
