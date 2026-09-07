import type { Spread, Side } from './types';
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  let data;
  try {
    data = (await response.json()) as { error?: string };
  } catch {
    throw new Error('服务没有返回有效结果，请检查连接或登录状态。');
  }
  if (!response.ok) throw new Error(data.error || '请求失败，请重试。');
  return data as T;
}
export const imageUrl = (
  session: string,
  spread: Spread,
  side: Side | 'original',
) =>
  `/api/sessions/${session}/spreads/${spread.id}/image/${side}?v=${spread.revision}`;
export async function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('无法生成照片。'))),
      'image/jpeg',
      0.91,
    ),
  );
}
export async function preparePhoto(
  source: Blob | HTMLVideoElement,
  rotation = 0,
) {
  let bitmap: ImageBitmap | undefined;
  try {
    const media =
      source instanceof Blob
        ? (bitmap = await createImageBitmap(source, {
            imageOrientation: 'from-image',
          }))
        : source;
    const width =
        media instanceof HTMLVideoElement ? media.videoWidth : media.width,
      height =
        media instanceof HTMLVideoElement ? media.videoHeight : media.height;
    if (!width || !height) throw new Error('摄像头尚未就绪。');
    const scale = Math.min(
      1,
      2400 / Math.max(width, height),
      Math.sqrt(3_800_000 / (width * height)),
    );
    const w = Math.round(width * scale),
      h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = rotation % 180 ? h : w;
    canvas.height = rotation % 180 ? w : h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法处理图片。');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(media, -w / 2, -h / 2, w, h);
    return await canvasBlob(canvas);
  } catch (e) {
    if (e instanceof Error && e.message.includes('摄像头')) throw e;
    throw new Error('无法读取照片，请使用 JPEG、PNG 或浏览器支持的照片格式。');
  } finally {
    bitmap?.close();
  }
}
