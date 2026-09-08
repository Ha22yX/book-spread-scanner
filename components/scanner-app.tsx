'use client';
/* oxlint-disable nextjs/no-img-element -- OCR overlays must use the exact uploaded pixels, including blob previews and authenticated image endpoints. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG highlight rectangles use keyboard-accessible button roles; HTML buttons cannot be children of SVG. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MarginalBook } from './marginal-book';
import { LazyThumbnail } from './lazy-thumbnail';
import { DetailCache, spreadVersion, summarizeSpread } from '@/lib/spread-summary';
import { adjacentCapture, horizontalWheelDelta, revealOffset, navigationDirection } from '@/lib/reader-navigation';
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
  Trash2,
  MoreHorizontal,
  FileText,
  Info,
  ArrowLeft,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { api, preparePhoto, imageUrl } from '@/lib/client';
import type { ScanSession, Spread, Seam } from '@/lib/types';
import { englishWordCount } from '@/lib/reading-context';
import { APP_VERSION } from '@/lib/app-version';
import { pageLabel } from '@/lib/page-numbers';

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
  const [deleteTarget, setDeleteTarget] = useState<Spread | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const removedIds = useRef(new Set<string>());
  const detailCache = useRef(new DetailCache(3));
  const [detail, setDetail] = useState<{key:string; value:Spread} | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);
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
    filmstrip = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    highest = useRef(0),
    busyRef = useRef(false);
  const isPhone = mode === 'scan';
  const summary =
    session?.spreads.find((s) => s.id === selected) || session?.spreads.at(-1);
  const detailKey = summary ? spreadVersion(summary) : '';
  const spread = detail?.key === detailKey ? detail.value : summary;
  const detailLoading = !!summary && !isProcessing(summary) && detail?.key !== detailKey;
  const sentences = useMemo(() => buildSentences(spread?.spans ?? []), [spread?.spans]);
  useEffect(() => {
    if (!summary || isProcessing(summary)) return;
    const controller = new AbortController();
    const cached = detailCache.current.get(detailKey);
    void (cached ? Promise.resolve(cached) : api<Spread>(`/api/sessions/${sessionId}/spreads/${summary.id}`, {signal:controller.signal}))
      .then((value) => {
        if (controller.signal.aborted || removedIds.current.has(value.id)) return;
        detailCache.current.set(detailKey, value);
        setDetailError('');
        setDetail({key:detailKey, value});
      }).catch((e: Error) => { if (!controller.signal.aborted) setDetailError(e.message); });
    return () => controller.abort();
  }, [sessionId, summary, detailKey, detailRetry]);
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
    let etag = '';
    let pending = false;
    let processing = false;
    const controller = new AbortController();
    const poll = async () => {
      if (!alive || pending) return;
      if (document.hidden) { timer = setTimeout(poll, 15000); return; }
      pending = true;
      try {
        const response = await fetch(`/api/sessions/${sessionId}?summary=1`, {
          headers: etag ? {'If-None-Match':etag} : {}, cache:'no-store', signal:controller.signal,
        });
        if (response.status === 304) { setSyncFailed(false); return; }
        if (!response.ok) throw new Error('无法同步拍摄进度，请检查连接或登录状态。');
        const data = await response.json() as ScanSession;
        if (!alive) return;
        setSyncFailed(false);
        etag = response.headers.get('etag') || '';
        data.spreads = data.spreads.filter((s) => !removedIds.current.has(s.id));
        processing = data.spreads.some(isProcessing);
        setSession((previous) => {
          const old = new Map(previous?.spreads.map((s) => [s.id, s]));
          return {...data, spreads:data.spreads.map((s) => {
            const existing = old.get(s.id);
            return existing && spreadVersion(existing) === spreadVersion(s) ? existing : s;
          })};
        });
        const last = data.spreads.at(-1);
        if (last && last.sequence > highest.current) {
          highest.current = last.sequence;
          setSelected(last.id);
        }
      } catch {
        if (alive) setSyncFailed(true);
      } finally {
        pending = false;
        if (alive) timer = setTimeout(poll, processing ? 1500 : 4000);
      }
    };
    void poll();
    const wake = () => { if (!document.hidden) { clearTimeout(timer); void poll(); } };
    document.addEventListener('visibilitychange', wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener('visibilitychange', wake);
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
    detailCache.current.set(spreadVersion(value), value);
    setDetail({key:spreadVersion(value), value});
    setSession((s) =>
      s
        ? {
            ...s,
            spreads: [
              ...s.spreads.filter((x) => x.id !== value.id),
              summarizeSpread(value),
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
            mode: spread.spans?.length ? 'annotations' : 'full',
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
  const deleteCapture = () => void perform('删除拍摄记录', async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    await api(`/api/sessions/${sessionId}/spreads/${id}`, { method: 'DELETE' });
    removedIds.current.add(id);
    detailCache.current.clear();
    setSession((current) => current ? { ...current, spreads: current.spreads.filter((s) => s.id !== id) } : current);
    if (spread?.id === id) { setSelected(''); setActiveNote(''); setTab('pages'); }
    setDeleteTarget(null);
  });
  const selectSpread = useCallback((id: string) => {
    setSelected(id);
    setActiveNote('');
    setTab('pages');
  }, []);
  const selectableSpreadIds = session?.spreads.map((s) => s.id).join('|') ?? '';
  const currentSpreadId = spread?.id ?? '';
  useEffect(() => {
    const strip = filmstrip.current;
    if (!strip || isPhone) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || strip.scrollWidth <= strip.clientWidth) return;
      const delta = horizontalWheelDelta(event.deltaX, event.deltaY, event.deltaMode, strip.clientWidth);
      if (!delta || !event.cancelable) return;
      event.preventDefault();
      strip.scrollLeft += delta;
    };
    strip.addEventListener('wheel', wheel, {passive:false});
    return () => strip.removeEventListener('wheel', wheel);
  }, [isPhone, selectableSpreadIds, camera, capture]);
  useEffect(() => {
    const strip = filmstrip.current;
    if (!strip || isPhone) return;
    const chosen = strip.querySelector<HTMLElement>('.film-item.chosen');
    if (!chosen) return;
    const item = chosen.getBoundingClientRect(), bounds = strip.getBoundingClientRect();
    const left = revealOffset(item.left, item.right, bounds.left + 3, bounds.right - 3);
    // Move only this horizontal strip, never scroll the document vertically.
    if (left) strip.scrollBy({left, behavior:'instant'});
  }, [isPhone, currentSpreadId, selectableSpreadIds, camera, capture]);
  useEffect(() => {
    if (isPhone || camera || capture || pairOpen || infoOpen || deleteTarget) return;
    const keydown = (event: KeyboardEvent) => {
      const direction = navigationDirection(event);
      if (!direction || busyRef.current) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],[role="textbox"],[role="combobox"],[role="spinbutton"],[role="listbox"],[role="tablist"],[data-slot="dropdown-menu-trigger"]')) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"]')) return;
      const next = adjacentCapture(selectableSpreadIds.split('|').filter(Boolean), currentSpreadId, direction);
      event.preventDefault();
      if (!next) return;
      selectSpread(next);
      if (target?.closest('.film-item')) {
        filmstrip.current?.querySelector<HTMLElement>(`[data-capture-id="${CSS.escape(next)}"]`)?.focus({preventScroll:true});
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [isPhone, camera, capture, pairOpen, infoOpen, deleteTarget, selectableSpreadIds, currentSpreadId, selectSpread]);
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
    <main className={`shell ${isPhone ? 'phone-shell' : 'reader-shell'}`}>
      <header className="topbar">
        <Link className="brand" href="/">
          <BookOpen />
          <span>
            书页
          </span>
        </Link>
        <div className="row">
          {isPhone && <span className="mode-indicator">
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
          </span>}
          {!isPhone && (
            <Button
              variant="outline"
              className="action"
              onClick={pair}
              disabled={busyNow}
            >
              <Smartphone />
              连接手机
            </Button>
          )}
          {!isPhone && <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="reader-more" aria-label="更多操作" />}><MoreHorizontal size={20} /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="reader-menu">
              <DropdownMenuItem disabled={busyNow} onClick={() => fileInput.current?.click()}><Upload /> 导入照片</DropdownMenuItem>
              <DropdownMenuItem disabled={busyNow || !!capture} onClick={() => { setError(''); setCamera(true); }}><Camera /> 使用电脑相机</DropdownMenuItem>
              {spread && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={busyNow} onClick={() => setTab('pages')}><BookOpen /> 查看批注</DropdownMenuItem>
                <DropdownMenuItem disabled={busyNow || detailLoading} onClick={() => setTab('text')}><FileText /> 查看识别原文</DropdownMenuItem>
                <DropdownMenuItem disabled={busyNow || (!!spread.pipeline && !spread.pipeline.splitReady)} onClick={() => setTab('split')}><Scissors /> 调整左右分割</DropdownMenuItem>
                <DropdownMenuItem disabled={busyNow || isProcessing(spread) || detailLoading} onClick={generate}><Sparkles /> {spread.spans?.length ? '只重新生成批注' : '识别并生成批注'}</DropdownMenuItem>
                <DropdownMenuItem disabled={detailLoading} onClick={() => setInfoOpen(true)}><Info /> 处理信息</DropdownMenuItem>
              </>}
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/" />}><Plus /> 新建会话</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
      </header>
      <section className="workspace">
        {isPhone && <div className="heading">
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
        </div>}
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
        {session?.appVersion && session.appVersion !== APP_VERSION && <div className="reader-failure" role="status">
          <span>网站已更新。刷新后可使用最新处理状态和批注规则。</span>
          <Button variant="outline" disabled={busyNow || camera || !!capture} onClick={() => window.location.reload()}>刷新页面</Button>
        </div>}
        {syncFailed && <div className="reader-failure" role="status">连接中断，正在重连；显示的进度可能不是最新状态。请勿重复上传。</div>}
        {!syncFailed && session?.processorHealth === 'offline' && session.spreads.some(isProcessing) && <div className="reader-failure" role="alert">处理后台离线，照片已保存。请确认处理电脑已开机联网，并在“任务计划程序”中启用 BookSpreadScanner-Background。</div>}
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
            <div className={isPhone ? 'start-grid' : 'reader-start'}>
              <div className="empty-surface">
                <div className="empty-icon">
                  <ScanLine size={38} />
                </div>
                <h2>
                  {isPhone
                    ? '准备好书本，就可以开始了'
                    : '从手机拍下书页'}
                </h2>
                <p>
                  拍摄后自动处理，批注会显示在这里。
                </p>
                <Button
                  className="action"
                  disabled={busyNow}
                  onClick={isPhone ? () => setCamera(true) : pair}
                >
                  {isPhone ? <Camera /> : <Smartphone />}
                  {isPhone ? '打开相机' : '连接手机'}
                  <ArrowRight size={16} />
                </Button>
              </div>
              {isPhone && <aside className="start-aside">
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
              </aside>}
            </div>
          ) : (
            <>
              <div ref={filmstrip} className="filmstrip" aria-label="已扫描的书页；滚轮左右滚动，方向键切换拍摄" title="滚轮左右滚动 · ← → 切换拍摄">
                {session.spreads.map((s) => (
                  <ContextMenu key={s.id}>
                  <ContextMenuTrigger render={<button type="button" aria-label={`第 ${s.sequence} 次拍摄，右键可删除`} disabled={busyNow} />}
                    className={`film-item ${spread?.id === s.id ? 'chosen' : ''}`}
                    aria-pressed={spread?.id === s.id}
                    data-capture-id={s.id}
                    onClick={() => selectSpread(s.id)}
                    title="右键可删除这次拍摄"
                  >
                    <LazyThumbnail session={sessionId} id={s.id} />
                    <span>
                      {pageLabel(s)}
                      {(isProcessing(s) || s.status === 'failed') && <small>
                        {isProcessing(s)
                          ? syncFailed ? '连接异常' : session.processorHealth === 'offline' ? '后台离线' : s.status === 'queued' ? '排队中' : `处理中 ${s.pipeline?.percent ?? 0}%`
                          : s.status === 'failed'
                            ? '处理失败 · 可重试'
                            : '等待识别印刷页码'}
                      </small>}
                    </span>
                    {s.status === 'annotated' && <Check size={15} />}
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem variant="destructive" disabled={busyNow} onClick={() => setDeleteTarget(s)}>
                      <Trash2 /> 删除第 {s.sequence} 次拍摄
                    </ContextMenuItem>
                  </ContextMenuContent>
                  </ContextMenu>
                ))}
                {isPhone && <Button
                  variant="ghost"
                  className="add-spread"
                  disabled={busyNow}
                  onClick={() =>
                    isPhone ? setCamera(true) : fileInput.current?.click()
                  }
                >
                  <Plus />
                  继续扫描
                </Button>}
              </div>
              {spread && (
                <section className="review-section">
                  <PipelineProgress spread={spread} health={syncFailed ? 'unknown' : session.processorHealth} ahead={session.spreads.filter((s) => s.sequence < spread.sequence && isProcessing(s)).length} />
                  {spread.status === 'failed' && <div className="reader-failure" role="alert">
                    <span>{spread.error || '这张照片处理失败。'}</span>
                    <Button variant="outline" disabled={busyNow || detailLoading} onClick={generate}>重试</Button>
                  </div>}
                  {detailLoading && <div className="detail-loading" role="status">
                    {detailError ? <><span>{detailError}</span><Button variant="outline" onClick={() => setDetailRetry((n) => n + 1)}>重新加载</Button></> : <><Loader2 className="spin" size={16} /> 正在读取这张照片的批注…</>}
                  </div>}
                  <div>
                    {tab !== 'pages' && <div className="reader-view-header">
                      <Button variant="ghost" onClick={() => setTab('pages')}><ArrowLeft size={16} /> 返回批注</Button>
                      <span>{tab === 'split' ? '调整分割' : '识别原文'}</span>
                    </div>}
                    {tab === 'split' && <div>
                      <SeamEditor
                        key={`${spread.id}-${spread.revision}`}
                        session={sessionId}
                        spread={spread}
                        disabled={busyNow || isProcessing(spread)}
                        onSave={saveSeam}
                      />
                    </div>}
                    {tab === 'pages' && <div>
                      {(spread.annotationWarning || spread.spans?.some((s) => s.confidence < 60)) && <details className="reader-quality">
                        <summary>识别提示</summary>
                        {spread.annotationWarning && <p>{spread.annotationWarning}</p>}
                        {spread.spans?.some((s) => s.confidence < 60) && <p>部分文字不够清晰，可在“更多操作 → 查看识别原文”中核对。</p>}
                      </details>}
                      {spread.pipeline && !spread.pipeline.splitReady ? (
                        <div className="processing-photo">
                          <img
                            src={imageUrl(sessionId, spread, 'original')}
                            alt="已上传的原始照片，等待自动分割"
                          />
                        </div>
                      ) : (
                        <MarginalBook
                          session={sessionId}
                          spread={spread}
                          activeNote={activeNote}
                          onNote={setActiveNote}
                        />
                      )}
                      {!detailLoading && spread.status === 'annotated' && !spread.annotations?.length && (
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
                    </div>}
                    {tab === 'text' && <div>
                      <article className="transcript joined-transcript">
                        <h2>连续原文 · 先左页，再右页</h2>
                        <p className="muted">
                          按句连接换行与跨页内容；灰色标记表示来源页面。OCR
                          仍可能有错字，请结合原图核对。
                        </p>
                        {sentences.map((s) => (
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
                    </div>}
                  </div>
                </section>
              )}
            </>
          ))}
        {sessionId && isPhone && (
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
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="reader-info">
          <DialogTitle>拍摄 {spread?.sequence} · 处理信息</DialogTitle>
          <DialogDescription>当前照片的批注记录。</DialogDescription>
          <p>模型：{spread?.model || 'GPT-5.6 Sol'}</p>
          <p>已参考前 {spread?.contextSources?.length ?? 0} 张照片</p>
          <p>{spread?.annotations?.length ?? 0} 处批注，共 {spread?.annotations?.reduce((n, a) => n + englishWordCount(a.comment), 0) ?? 0} 个英文词</p>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !busyRef.current) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogTitle>删除第 {deleteTarget?.sequence} 次拍摄？</AlertDialogTitle>
          <AlertDialogDescription>
            将删除这张原图、左右页、识别文字和批注，无法恢复。正在处理的结果不会再保存；后续生成批注时不再使用这张照片。其他拍摄及其编号保持不变。
          </AlertDialogDescription>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyNow}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busyNow} onClick={deleteCapture}>
              {busyNow ? '正在删除…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
