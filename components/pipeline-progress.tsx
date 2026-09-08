'use client';
import { Progress } from '@/components/ui/progress';
import { stageLabels, isProcessing } from '@/lib/pipeline';
import type { Spread } from '@/lib/types';
import type { ProcessorHealth } from '@/lib/processor-health';
export function PipelineProgress({ spread, health, ahead = 0 }: { spread: Spread; health?: ProcessorHealth; ahead?: number }) {
  const p = spread.pipeline;
  if (!p || !isProcessing(spread)) return null;
  const offline = health === 'offline';
  const queued = spread.status === 'queued';
  const label = offline ? '后台离线，照片已保存' : queued
    ? (ahead > 0 ? `排队中，前面还有 ${ahead} 张` : '照片已接收，等待后台领取') : stageLabels[p.stage];
  return (
    <section className="pipeline-progress" aria-live="polite">
      <div>
        <strong>{label}</strong>
        <span>{offline ? '已暂停' : queued ? '等待中' : `${p.percent}%`}</span>
      </div>
      <Progress value={p.percent} aria-label="书页自动处理进度" />
      {offline && <p>处理电脑需保持开机、登录并联网，不能休眠。后台恢复后自动继续，无需重新上传。</p>}
      {health === 'unknown' && <p>暂时无法确认后台连接，照片已保留。</p>}
    </section>
  );
}
