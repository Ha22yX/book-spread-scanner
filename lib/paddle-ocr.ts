import type Ocr from '@gutenye/ocr-browser';
import { imageUrl } from './client';
import { paddleLinesToSpans } from './paddle-lines';
import type { Spread, TextSpan } from './types';
let engine: Promise<Ocr> | undefined;
async function getEngine() {
  if (!engine)
    engine = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = '/ocr/onnx/';
      const { default: OCR } = await import('@gutenye/ocr-browser');
      return OCR.create({
        models: {
          detectionPath: '/ocr/paddle/ch_PP-OCRv4_det_infer.onnx',
          recognitionPath: '/ocr/paddle/ch_PP-OCRv4_rec_infer.onnx',
          dictionaryPath: '/ocr/paddle/ppocr_keys_v1.txt',
        },
        onnxOptions: { executionProviders: ['wasm'] },
      });
    })().catch((e) => {
      engine = undefined;
      throw e;
    });
  return engine;
}
export async function recognizeBook(
  session: string,
  spread: Spread,
  progress: (text: string) => void,
) {
  progress('加载 PP-OCR 文字行模型（首次加载较慢）');
  const ocr = await getEngine();
  const spans: TextSpan[] = [];
  for (const side of ['left', 'right'] as const) {
    progress(`PP-OCR 正在识别${side === 'left' ? '左' : '右'}页完整文字行`);
    const lines = await ocr.detect(imageUrl(session, spread, side));
    spans.push(...paddleLinesToSpans(lines, side, spread[side]));
  }
  if (!spans.length)
    throw new Error('没有检测到可靠文字行，请重新拍摄清晰书页。');
  return spans;
}
