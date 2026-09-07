'use client';
import { Progress } from '@/components/ui/progress';
import { stageLabels, isProcessing } from '@/lib/pipeline';
import type { Spread } from '@/lib/types';
export function PipelineProgress({ spread }: { spread: Spread }) {
  const p = spread.pipeline;
  if (!p) return null;
  return (
    <section className="pipeline-progress" aria-live="polite">
      <div>
        <strong>{stageLabels[p.stage]}</strong>
        <span>{spread.status === 'failed' ? '可重试' : `${p.percent}%`}</span>
      </div>
      <Progress value={p.percent} aria-label="书页自动处理进度" />
      <ol>
        {['照片接收', '左右分割', '文字识别', '联读前文', '英文批注'].map(
          (text, i) => (
            <li
              key={text}
              className={p.percent >= [5, 35, 70, 85, 100][i] ? 'done' : ''}
            >
              {text}
            </li>
          ),
        )}
      </ol>
      {isProcessing(spread) && (
        <p>阶段进度 · 后台独立处理，可继续拍摄；AI 等待时百分比会保持不变。</p>
      )}
      {spread.error && <p className="inline-error">{spread.error}</p>}
    </section>
  );
}
