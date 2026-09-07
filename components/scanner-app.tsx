'use client';
/* oxlint-disable nextjs/no-img-element -- OCR overlays must use the exact uploaded pixels, including blob previews and authenticated image endpoints. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG highlight rectangles use keyboard-accessible button roles; HTML buttons cannot be children of SVG. */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MarginalBook } from './marginal-book';
import { PipelineProgress } from './pipeline-progress';
import { isProcessing } from '@/lib/pipeline';
import { buildSentences } from '@/lib/sentences';
import { createUploadId } from '@/lib/upload-id';
import {
  BookOpen,
  Camera,
  Upload,
  Smartphone,
  ArrowRight,
  Check,
  RotateCw,
  Scissors,
  Sparkles,
  Loader2,
  X,
  Copy,
  Plus,
  Monitor,
  ScanLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { api, preparePhoto, imageUrl } from '@/lib/client';
import type { ScanSession, Spread, Seam } from '@/lib/types';
import { englishWordCount } from '@/lib/reading-context';

export function ScannerApp({
  mode,
  initialSession,
}: {
  mode: 'scan' | 'review';
  initialSession?: string;
}) {
  const [sessionId, setSessionId] = useState(initialSession || ''),
    [session, setSession] = useState<ScanSession | null>(null),
    [selected, setSelected] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [pairOpen, setPairOpen] = useState(false),
    [qr, setQr] = useState(''),
    [copied, setCopied] = useState(false);
  const [camera, setCamera] = useState(false),
    [cameraReady, setCameraReady] = useState(false),
    [captureData, setCaptureData] = useState<{
      blob: Blob;
      url: string;
    } | null>(null);
  const capture = captureData?.blob ?? null,
    captureUrl = captureData?.url ?? '';
  const setCapture = (blob: Blob | null) =>
    setCaptureData(blob ? { blob, url: URL.createObjectURL(blob) } : null);
  const [uploadId, setUploadId] = useState(''),
    [activeNote, setActiveNote] = useState(''),
    [tab, setTab] = useState('pages');
  const fileInput = useRef<HTMLInputElement>(null),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    highest = useRef(0),
    busyRef = useRef(false);
  const isPhone = mode === 'scan';
  const spread =
    session?.spreads.find((s) => s.id === selected) || session?.spreads.at(-1);
  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraReady(false);
    setCamera(false);
  }, []);
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (!captureUrl) return;
    return () => URL.revokeObjectURL(captureUrl);
  }, [captureUrl]);
  useEffect(() => {
    if (!camera) return;
    let disposed = false;
    const onHidden = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener('visibilitychange', onHidden);
    void (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
          throw new Error(
            '摄像头需要 HTTPS 连接。你也可以通过“选择照片”调用手机相机。',
          );
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
        });
        if (disposed) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
          setCameraReady(true);
        }
      } catch (e) {
        if (!disposed) {
          setError(
            e instanceof DOMException && e.name === 'NotAllowedError'
              ? '相机权限未允许。请在浏览器设置中允许访问，或选择已有照片。'
              : (e as Error).message,
          );
          stopCamera();
        }
      }
    })();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onHidden);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [camera, stopCamera]);
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await api<ScanSession>(`/api/sessions/${sessionId}`);
        if (!alive) return;
        setSession(data);
        const last = data.spreads.at(-1);
        if (last && last.sequence > highest.current) {
          highest.current = last.sequence;
          setSelected(last.id);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) timer = setTimeout(poll, 1500);
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sessionId]);
  useEffect(() => {
    if (!pairOpen || !sessionId) return;
    let live = true;
    import('qrcode')
      .then((q) =>
        q.toDataURL(`${location.origin}/scan/${sessionId}`, {
          width: 260,
          margin: 2,
          color: { dark: '#192438', light: '#ffffff' },
        }),
      )
      .then((url) => {
        if (live) setQr(url);
      })
      .catch(() => setError('二维码生成失败，请复制拍摄链接。'));
    return () => {
      live = false;
    };
  }, [pairOpen, sessionId]);
  const ensureSession = async () => {
    if (sessionId) return sessionId;
    const data = await api<ScanSession>('/api/sessions', { method: 'POST' });
    setSessionId(data.id);
    setSession(data);
    history.replaceState(null, '', `/review/${data.id}`);
    return data.id;
  };
  const perform = async (label: string, fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };
  const updateSpread = (value: Spread) => {
    setSession((s) =>
      s
        ? {
            ...s,
            spreads: [
              ...s.spreads.filter((x) => x.id !== value.id),
              value,
            ].sort((a, b) => a.sequence - b.sequence),
          }
        : s,
    );
    setSelected(value.id);
    highest.current = Math.max(highest.current, value.sequence);
  };
  const selectFile = (file: File) =>
    void perform('准备照片', async () => {
      setCapture(await preparePhoto(file));
      setUploadId(createUploadId());
      stopCamera();
    });
  const takePhoto = () =>
    void perform('拍摄中', async () => {
      if (!video.current) throw new Error('摄像头尚未就绪。');
      setCapture(await preparePhoto(video.current));
      setUploadId(createUploadId());
      stopCamera();
    });
  const upload = () =>
    void perform('上传照片并识别书脊', async () => {
      if (!capture) return;
      const id = await ensureSession();
      const result = await api<Spread>(`/api/sessions/${id}/spreads`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', 'X-Upload-Id': uploadId },
        body: capture,
      });
      updateSpread(result);
      setCapture(null);
      setTab(result.pipeline ? 'pages' : 'split');
      setActiveNote('');
    });
  const saveSeam = (seam: Seam) =>
    void perform('重新分割左右页', async () => {
      if (!spread) return;
      const updated = await api<Spread>(
        `/api/sessions/${sessionId}/spreads/${spread.id}/split`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            top: seam.top,
            bottom: seam.bottom,
            revision: spread.revision,
          }),
        },
      );
      updateSpread(updated);
      setActiveNote('');
      setTab('pages');
    });
  const generate = () =>
    void perform('提交后台处理', async () => {
      if (!spread) return;
      const updated = await api<Spread>(
        `/api/sessions/${sessionId}/spreads/${spread.id}/process`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            revision: spread.revision,
          }),
        },
      );
      updateSpread(updated);
      setActiveNote(updated.annotations?.[0]?.id || '');
      setTab('pages');
    });
  const pair = () =>
    void perform('准备手机连接', async () => {
      await ensureSession();
      setPairOpen(true);
    });
  const selectSpread = (id: string) => {
    setSelected(id);
    setActiveNote('');
    setTab('pages');
  };
  const selectableSpreadIds = session?.spreads.map((s) => s.id).join('|') ?? '';
  useEffect(() => {
    const ctx = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!ctx) return;
    const controller = new AbortController();
    const tool = {
      name: 'select_scanned_spread',
      title: '查看已扫描的书页',
      description: '选择当前会话内已经扫描的一组左右页并显示预览。',
      inputSchema: {
        type: 'object',
        properties: { spreadId: { type: 'string' } },
        required: ['spreadId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input: unknown) => {
        if (busyRef.current)
          throw new Error('当前操作尚未完成，请稍后切换书页');
        const id = (input as { spreadId?: unknown })?.spreadId;
        if (
          typeof id !== 'string' ||
          !selectableSpreadIds.split('|').filter(Boolean).includes(id)
        )
          throw new Error('扫描记录不存在');
        setSelected(id);
        setActiveNote('');
        setTab('pages');
        return { selectedSpreadId: id };
      },
    };
    try {
      void Promise.resolve(
        ctx.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, [selectableSpreadIds]);
  const busyNow = !!busy;
  return (
    <main className={`shell ${isPhone ? 'phone-shell' : ''}`}>
      <header className="topbar">
        <Link className="brand" href="/">
          <BookOpen />
          <span>
            书页<span className="brand-sub">双页扫描与批注</span>
          </span>
        </Link>
        <div className="row">
          <span className="mode-indicator">
            {isPhone ? (
              <>
                <Smartphone size={15} />
                拍摄端
              </>
            ) : (
              <>
                <Monitor size={15} />
                阅读工作台
              </>
            )}
          </span>
          {sessionId && !isPhone && (
            <Button
              variant="ghost"
              className="action"
              onClick={pair}
              disabled={busyNow}
            >
              <Smartphone />
              连接手机
            </Button>
          )}
        </div>
      </header>
      <section className="workspace">
        <div className="heading">
          <div>
            <p className="eyebrow">
              {isPhone ? 'CAPTURE / 01' : 'YOUR READING DESK'}
            </p>
            <h1>{isPhone ? '拍下这一页。' : '把书页，留在这里。'}</h1>
            <p className="muted">
              {isPhone
                ? '拍摄完整的左右两页，电脑会同步收到。'
                : '手动拍摄 · 自动分割 · 先左页，再右页'}
            </p>
          </div>
          <div className="row wrap">
            {!isPhone && (
              <Button
                variant="outline"
                className="action"
                disabled={busyNow}
                onClick={pair}
              >
                <Smartphone />
                手机拍摄
              </Button>
            )}
            <Button
              className="action"
              disabled={busyNow || !!capture}
              onClick={() => {
                setError('');
                setCamera(true);
              }}
            >
              <Camera />
              {isPhone ? '打开相机' : '使用相机'}
            </Button>
            <Button
              variant="outline"
              className="action"
              disabled={busyNow}
              onClick={() => fileInput.current?.click()}
            >
              <Upload />
              选择照片
            </Button>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) selectFile(f);
            e.target.value = '';
          }}
        />
        {error && (
          <div role="alert" className="error row">
            <span style={{ flex: 1 }}>{error}</span>
            <button aria-label="关闭错误提示" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        <div aria-live="polite" aria-atomic="true">
          {busy && (
            <div className="busy-bar">
              <Loader2 className="spin" size={18} />
              <span>{busy}</span>
              <span className="muted">请保持此页面打开</span>
            </div>
          )}
        </div>
        {camera && (
          <section className="camera-panel">
            <div className="camera-viewport">
              <video ref={video} playsInline muted autoPlay />
              <div className="camera-guide">
                <span>左页</span>
                <span>右页</span>
              </div>
              {!cameraReady && (
                <div className="camera-loading">等待相机权限…</div>
              )}
            </div>
            <div className="camera-controls">
              <Button className="action" variant="outline" onClick={stopCamera}>
                关闭相机
              </Button>
              <Button
                className="shutter"
                disabled={!cameraReady || busyNow}
                onClick={takePhoto}
                aria-label="拍摄左右书页"
              >
                <Camera size={26} />
              </Button>
              <span>书脊对齐中线</span>
            </div>
          </section>
        )}
        {capture && (
          <section className="capture-panel">
            <div className="panel-title">
              <h2>确认这张照片</h2>
              <span className="muted">文字朝上，左右页完整</span>
            </div>
            <img
              className="capture-image"
              src={captureUrl}
              alt="刚拍摄的双页书本"
            />
            <div className="capture-controls">
              <Button
                className="action"
                variant="outline"
                disabled={busyNow}
                onClick={() =>
                  void perform('旋转照片', async () =>
                    setCapture(await preparePhoto(capture, 90)),
                  )
                }
              >
                <RotateCw />
                旋转
              </Button>
              <Button
                className="action"
                variant="outline"
                disabled={busyNow}
                onClick={() => setCapture(null)}
              >
                重新选择
              </Button>
              <Button className="action" disabled={busyNow} onClick={upload}>
                <Scissors />
                上传并自动分割
              </Button>
            </div>
          </section>
        )}
        {!capture &&
          !camera &&
          (!session?.spreads.length ? (
            <div className="start-grid">
              <div className="empty-surface">
                <div className="empty-icon">
                  <ScanLine size={38} />
                </div>
                <h2>
                  {isPhone
                    ? '准备好书本，就可以开始了'
                    : '你的书页将在这里展开'}
                </h2>
                <p>
                  让书本尽量铺平，书脊竖直，避免手指遮住文字。拍摄后可以微调分割线。
                </p>
                <Button
                  className="action"
                  disabled={busyNow}
                  onClick={isPhone ? () => setCamera(true) : pair}
                >
                  {isPhone ? <Camera /> : <Smartphone />}
                  {isPhone ? '打开相机' : '连接手机开始拍摄'}
                  <ArrowRight size={16} />
                </Button>
              </div>
              <aside className="start-aside">
                <span className="eyebrow">一次拍摄，两页阅读</span>
                <ol className="steps">
                  <li>
                    <span>01</span>
                    <div>
                      <h3>拍下展开的书本</h3>
                      <p>手机拍摄，或从设备选择照片。</p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <h3>确认左右页分割</h3>
                      <p>自动寻找书脊，支持调整分割线。</p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <h3>在电脑端生成批注</h3>
                      <p>原文整行高亮，通过引导线连接页边英文批注。</p>
                    </div>
                  </li>
                </ol>
                <div className="note-tip">
                  <BookOpen size={18} />
                  <p>
                    支持中英文横排印刷书籍。保留页面边缘，暂不展平书脊曲面。
                  </p>
                </div>
              </aside>
            </div>
          ) : (
            <>
              <div className="filmstrip" aria-label="已扫描的书页">
                {session.spreads.map((s) => (
                  <button
                    key={s.id}
                    className={`film-item ${spread?.id === s.id ? 'chosen' : ''}`}
                    aria-pressed={spread?.id === s.id}
                    disabled={busyNow}
                    onClick={() => selectSpread(s.id)}
                  >
                    <img src={imageUrl(sessionId, s, 'original')} alt="" />
                    <span>
                      第 {s.sequence} 次拍摄
                      <small>
                        {isProcessing(s)
                          ? `处理中 ${s.pipeline?.percent ?? 0}%`
                          : s.status === 'failed'
                            ? '处理失败 · 可重试'
                            : `左 ${s.sequence * 2 - 1} → 右 ${s.sequence * 2}`}
                      </small>
                    </span>
                    {s.status === 'annotated' && <Check size={15} />}
                  </button>
                ))}
                <Button
                  variant="ghost"
                  className="add-spread"
                  disabled={busyNow}
                  onClick={() =>
                    isPhone ? setCamera(true) : fileInput.current?.click()
                  }
                >
                  <Plus />
                  继续扫描
                </Button>
              </div>
              {spread && (
                <section className="review-section">
                  <PipelineProgress spread={spread} />
                  <Tabs
                    value={tab}
                    onValueChange={(value) => setTab(String(value))}
                  >
                    <div className="review-toolbar">
                      <TabsList className="view-tabs">
                        <TabsTrigger value="pages">左右页预览</TabsTrigger>
                        <TabsTrigger
                          value="split"
                          disabled={
                            !!spread.pipeline && !spread.pipeline.splitReady
                          }
                        >
                          原图与分割
                        </TabsTrigger>
                        <TabsTrigger value="text">识别文字</TabsTrigger>
                      </TabsList>
                      <span className="page-order">
                        第 {spread.sequence * 2 - 1} 页 <ArrowRight size={14} />{' '}
                        第 {spread.sequence * 2} 页
                      </span>
                    </div>
                    <TabsContent value="split">
                      <SeamEditor
                        key={`${spread.id}-${spread.revision}`}
                        session={sessionId}
                        spread={spread}
                        disabled={busyNow || isProcessing(spread)}
                        onSave={saveSeam}
                      />
                    </TabsContent>
                    <TabsContent value="pages">
                      <div className="reading-actions">
                        <div>
                          <span className="eyebrow">MARGIN NOTES</span>
                          <p>
                            每张通常 1 处 · 简单英文 10–15 词 ·
                            只标记重要情节与写法
                          </p>
                        </div>
                        {!isPhone && (
                          <Button
                            className="action"
                            disabled={busyNow || isProcessing(spread)}
                            onClick={generate}
                          >
                            <Sparkles />
                            {isProcessing(spread)
                              ? '后台自动处理中'
                              : spread.status === 'failed'
                                ? '重试自动处理'
                                : spread.annotations?.length
                                  ? '重新识别并生成批注'
                                  : '识别文字并生成批注'}
                          </Button>
                        )}
                      </div>
                      {spread.error && (
                        <p className="inline-error">{spread.error}</p>
                      )}
                      {spread.annotationWarning && (
                        <p className="quality-note">
                          {spread.annotationWarning}
                        </p>
                      )}
                      {spread.spans?.some((s) => s.confidence < 60) && (
                        <p className="quality-note">
                          部分 OCR
                          文字不够清晰，请在“识别文字”中核对。完整句子由各行拼接，原图坐标保持不变。
                        </p>
                      )}
                      {spread.pipeline && !spread.pipeline.splitReady ? (
                        <div className="processing-photo">
                          <img
                            src={imageUrl(sessionId, spread, 'original')}
                            alt="已上传的原始照片，等待自动分割"
                          />
                          <p>原图已保存，正在后台自动分割。</p>
                        </div>
                      ) : (
                        <MarginalBook
                          session={sessionId}
                          spread={spread}
                          activeNote={activeNote}
                          onNote={setActiveNote}
                        />
                      )}
                      <p className="model-label">
                        {spread.model || 'GPT-5.6 Sol'} · 图片与原文联合理解 ·
                        已参考前 {spread.contextSources?.length ?? 0} 张照片 ·{' '}
                        {spread.annotations?.length ?? 0} 处批注 /{' '}
                        {spread.annotations?.reduce(
                          (n, a) => n + englishWordCount(a.comment),
                          0,
                        ) ?? 0}{' '}
                        词
                      </p>
                      {!spread.annotations?.length && (
                        <p className="muted">
                          {spread.status === 'annotated'
                            ? '这张照片没有识别到值得特别标记的内容，不强行凑批注。'
                            : isProcessing(spread)
                              ? '后台会自动完成全部步骤，无需点击。'
                              : isPhone
                                ? '照片已同步。请在电脑端生成批注。'
                                : '确认左右分割后生成批注，笔记会出现在句子旁边。'}
                        </p>
                      )}
                    </TabsContent>
                    <TabsContent value="text">
                      <article className="transcript joined-transcript">
                        <h2>连续原文 · 先左页，再右页</h2>
                        <p className="muted">
                          按句连接换行与跨页内容；灰色标记表示来源页面。OCR
                          仍可能有错字，请结合原图核对。
                        </p>
                        {buildSentences(spread.spans ?? []).map((s) => (
                          <p key={s.id}>
                            <small className="sentence-origin">
                              {s.sides
                                .map((side) =>
                                  side === 'left' ? '左页' : '右页',
                                )
                                .join(' → ')}
                            </small>
                            {s.text}
                          </p>
                        ))}
                        {!spread.spans?.length && (
                          <p className="muted">尚未识别文字。</p>
                        )}
                      </article>
                    </TabsContent>
                  </Tabs>
                </section>
              )}
            </>
          ))}
        {sessionId && (
          <footer className="workspace-footer">
            <span className="row">
              <span className="live-dot" />
              自动同步手机照片与后台处理进度
            </span>
            {isPhone ? (
              <a href={`/review/${sessionId}`}>
                <Monitor size={15} />
                查看完整结果
              </a>
            ) : (
              <Link href="/">
                新建扫描会话
                <ArrowRight size={14} />
              </Link>
            )}
          </footer>
        )}
      </section>
      <Dialog open={pairOpen} onOpenChange={setPairOpen}>
        <DialogContent className="pair-dialog">
          <DialogTitle>用手机连接这张书桌</DialogTitle>
          <DialogDescription>
            手机扫码后拍摄，结果会自动出现在当前电脑页面。私有站点需使用同一账号登录。
          </DialogDescription>
          <div className="qr-wrap">
            {qr ? (
              <img src={qr} width={260} height={260} alt="手机拍摄页面二维码" />
            ) : (
              <Loader2 className="spin" />
            )}
          </div>
          <Button
            className="action"
            variant="outline"
            onClick={() => {
              if (!navigator.clipboard) {
                setError(
                  '当前 HTTP 页面不支持自动复制，请长按下方拍摄链接复制，或直接扫描二维码。',
                );
                return;
              }
              navigator.clipboard
                .writeText(`${location.origin}/scan/${sessionId}`)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
                .catch(() => setError('复制失败，请使用下方链接。'));
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? '已复制' : '复制拍摄链接'}
          </Button>
          <a className="pair-link" href={`/scan/${sessionId}`}>
            在当前设备打开拍摄页
            <ArrowRight size={14} />
          </a>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function SeamEditor({
  session,
  spread,
  disabled,
  onSave,
}: {
  session: string;
  spread: Spread;
  disabled: boolean;
  onSave: (seam: Seam) => void;
}) {
  const [seam, setSeam] = useState(spread.seam),
    [point, setPoint] = useState<'top' | 'bottom'>('top');
  const moved =
    seam.top !== spread.seam.top || seam.bottom !== spread.seam.bottom;
  const adjust = (value: number) =>
    setSeam((s) => ({
      ...s,
      [point]: Math.min(0.85, Math.max(0.15, value)),
      method: 'manual',
      confidence: 1,
    }));
  return (
    <div className="split-layout">
      <div className="split-photo">
        <div className="split-photo-inner">
          <img
            src={imageUrl(session, spread, 'original')}
            alt="原始双页照片，蓝线表示书脊分割位置"
          />
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onPointerDown={(e) => {
              if (disabled) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const p =
                (e.clientY - rect.top) / rect.height < 0.5 ? 'top' : 'bottom';
              setPoint(p);
              setSeam((s) => ({
                ...s,
                [p]: Math.min(
                  0.85,
                  Math.max(0.15, (e.clientX - rect.left) / rect.width),
                ),
                method: 'manual',
                confidence: 1,
              }));
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId))
                return;
              const rect = e.currentTarget.getBoundingClientRect();
              adjust((e.clientX - rect.left) / rect.width);
            }}
          >
            <polygon
              points={`0,0 ${seam.top * 100},0 ${seam.bottom * 100},100 0,100`}
              fill="rgba(40,91,197,.07)"
            />
            <line
              x1={seam.top * 100}
              y1="0"
              x2={seam.bottom * 100}
              y2="100"
              stroke="#4b8dff"
              strokeWidth=".4"
            />
            <circle
              cx={seam.top * 100}
              cy="3"
              r="1.6"
              fill="#fff"
              stroke="#285bc5"
              strokeWidth=".4"
            />
            <circle
              cx={seam.bottom * 100}
              cy="97"
              r="1.6"
              fill="#fff"
              stroke="#285bc5"
              strokeWidth=".4"
            />
          </svg>
          <span className="side-tag tag-left">左页</span>
          <span className="side-tag tag-right">右页</span>
        </div>
      </div>
      <aside className="split-settings">
        <div className="row">
          <Scissors size={22} />
          <h2>确认书脊位置</h2>
        </div>
        <p
          className={
            spread.seam.method === 'center' || spread.seam.confidence < 0.4
              ? 'quality-note'
              : 'muted'
          }
        >
          {spread.seam.method === 'manual'
            ? '已使用手动调整的分割线。'
            : spread.seam.method === 'center'
              ? '未找到明显书脊，暂按中线分割。请调整后确认。'
              : spread.seam.confidence < 0.4
                ? '找到可能的书脊，请核对分割线。'
                : '已自动找到书脊，请核对左右页边界。'}
        </p>
        <p className="muted">
          拖动照片中的分割线端点，或使用下方滑块微调。照片上半部调整顶部，下半部调整底部。
        </p>
        {(['top', 'bottom'] as const).map((p) => (
          <div className="seam-slider" key={p}>
            <label id={`seam-${p}`}>
              <span>{p === 'top' ? '顶部位置' : '底部位置'}</span>
              <span>{Math.round(seam[p] * 100)}%</span>
            </label>
            <Slider
              aria-labelledby={`seam-${p}`}
              min={15}
              max={85}
              step={0.2}
              value={[seam[p] * 100]}
              disabled={disabled}
              onValueChange={(v) =>
                setSeam((s) => ({
                  ...s,
                  [p]: (Array.isArray(v) ? v[0] : (v as number)) / 100,
                  method: 'manual',
                  confidence: 1,
                }))
              }
            />
          </div>
        ))}
        <Button
          className="action"
          disabled={disabled || !moved}
          onClick={() => onSave(seam)}
        >
          <Check />
          保存并重新分割
        </Button>
        <Button
          className="action"
          variant="ghost"
          disabled={disabled || !moved}
          onClick={() => setSeam(spread.seam)}
        >
          恢复已保存位置
        </Button>
        <p className="muted">
          重新分割会清空本次拍摄的旧批注。原图始终保留，左右顺序不会改变。
        </p>
      </aside>
    </div>
  );
}
