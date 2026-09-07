'use client';
import { Progress } from '@/components/ui/progress';
import { stageLabels, isProcessing } from '@/lib/pipeline';
import type { Spread } from '@/lib/types';
export function PipelineProgress({ spread }: { spread: Spread }) {
  const p = spread.pipeline;
  if (!p || !isProcessing(spread)) return null;
  return (
    <section className="pipeline-progress" aria-live="polite">
      <div>
        <strong>{stageLabels[p.stage]}</strong>
        <span>{spread.status === 'failed' ? '可重试' : `${p.percent}%`}</span>
      </div>
      <Progress value={p.percent} aria-label="书页自动处理进度" />
    </section>
  );
}
