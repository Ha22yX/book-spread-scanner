'use client';
/* oxlint-disable nextjs/no-img-element -- Local capture preview uses original browser pixels. */
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { preparePhoto } from '@/lib/client';
import { createUploadId } from '@/lib/upload-id';
import type { Spread } from '@/lib/types';

export function PhoneCapture({ session }: { session: string }) {
  const input = useRef<HTMLInputElement>(null),
    pending = useRef<{ blob: Blob; id: string } | null>(null),
    locked = useRef(false);
  const [state, setState] = useState<
    'idle' | 'preparing' | 'uploading' | 'sent' | 'error'
  >('idle');
  const [percent, setPercent] = useState(0),
    [error, setError] = useState(''),
    [preview, setPreview] = useState(''),
    [sequence, setSequence] = useState(0),
    [canRetry, setCanRetry] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const send = async () => {
    if (!pending.current) return;
    setState('uploading');
    setPercent(0);
    setError('');
    const { blob, id } = pending.current;
    try {
      const spread = await new Promise<Spread>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/sessions/${session}/spreads`);
        xhr.timeout = 120000;
        xhr.setRequestHeader('Content-Type', 'image/jpeg');
        xhr.setRequestHeader('X-Upload-Id', id);
        xhr.setRequestHeader('X-Auto-Process', 'true');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setPercent(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onerror = () => reject(new Error('网络中断，请重试上传。'));
        xhr.ontimeout = () =>
          reject(new Error('上传超时，请重试；不会重复创建照片。'));
        xhr.onload = () => {
          try {
            const result = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(result);
            else reject(new Error(result.error || '上传失败。'));
          } catch {
            reject(new Error('服务连接异常，请重试。'));
          }
        };
        xhr.send(blob);
      });
      pending.current = null;
      setCanRetry(false);
      setSequence(spread.sequence);
      setPercent(100);
      setState('sent');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  };
  const capture = async (file: File) => {
    if (locked.current) return;
    locked.current = true;
    setState('preparing');
    setError('');
    setCanRetry(false);
    try {
      const blob = await preparePhoto(file);
      pending.current = { blob, id: createUploadId() };
      setCanRetry(true);
      setPreview(URL.createObjectURL(blob));
      await send();
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    } finally {
      locked.current = false;
    }
  };
  const busy = state === 'preparing' || state === 'uploading';
  return (
    <main className="capture-only">
      <header>
        <span>书页</span>
        <small>手机拍摄</small>
      </header>
      <section className="portrait-capture">
        {preview ? (
          <img src={preview} alt="刚拍摄的完整书页" />
        ) : (
          <div className="portrait-guide">
            <div className="open-book-guide">
              <span>左页</span>
              <span>右页</span>
            </div>
            <p>
              竖着拍，文字朝上
              <br />
              左右两页都放进画面
            </p>
          </div>
        )}
        {busy && (
          <div className="capture-working">
            <Loader2 className="spin" />
            <span>
              {state === 'preparing' ? '正在准备照片' : '正在上传照片'}
            </span>
          </div>
        )}
        {state === 'sent' && (
          <span className="capture-sent">
            <Check size={18} />第 {sequence} 张已上传
          </span>
        )}
      </section>
      <output className="capture-status" aria-live="polite">
        {state === 'uploading' ? (
          <>
            <Progress value={percent} aria-label="照片上传进度" />
            <p>
              {percent === 100
                ? '照片已发送，等待服务器确认…'
                : `正在上传 ${percent}%`}
            </p>
          </>
        ) : (
          <p>
            {state === 'sent'
              ? '电脑正在自动处理，可以继续拍下一张。'
              : state === 'preparing'
                ? '保留竖屏照片完整画面…'
                : '拍照确认后自动上传，无需其他操作。'}
          </p>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
      </output>
      <Button
        className="capture-shutter"
        disabled={busy}
        onClick={() => {
          if (state === 'error' && pending.current) {
            if (locked.current) return;
            locked.current = true;
            void send().finally(() => {
              locked.current = false;
            });
          } else input.current?.click();
        }}
      >
        {state === 'error' && canRetry ? <RotateCcw /> : <Camera />}
        {state === 'error' && canRetry
          ? '重试上传'
          : state === 'sent'
            ? '拍下一张'
            : '拍照'}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void capture(file);
        }}
      />
      <small className="capture-footnote">
        上传成功后可关闭页面 · 电脑需保持运行
      </small>
    </main>
  );
}
