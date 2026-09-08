import { z } from 'zod';
import { aiSchema, resolveAnnotations } from './anchors';
import type { TextSpan, Annotation } from './types';
import { ANNOTATION_PROMPT } from './prompts';
import {
  readingInput,
  type ReadingContext,
} from './reading-context';
import { buildSentences } from './sentences';
import { validAnnotationComment } from './annotation-style';
import { selectedAnchors } from './selected-anchors';
export class ModelError extends Error {}
const outputSchema = z.object({
  annotations: z
    .array(
      z.object({
        comment: z.string().min(1).max(500),
        type: z.enum(['理解', '关键词', '结构', '思考']),
        sentence_ids: z.array(z.string()).min(1).max(2),
      }),
    )
    .max(2),
});
export async function annotate(
  spans: TextSpan[],
  key: string,
  model: string,
  history: ReadingContext[] = [],
  photoDataUrl?: string,
  repair = false,
): Promise<{ annotations: Annotation[]; omitted: number }> {
  const sentences = buildSentences(spans).filter(
    (s) => s.anchors.length <= 6 && s.text.length <= 550,
  );
  if (!sentences.length) return { annotations: [] as Annotation[], omitted: 0 };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(115000),
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 3500,
      instructions: ANNOTATION_PROMPT + (repair ? '\nYour previous attempt failed validation. Return at most ONE note with 4–8 simple English words and exactly ONE current sentence_id. Do not include any longer note.' : ''),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(readingInput(spans, history)),
            },
            ...(photoDataUrl
              ? [
                  {
                    type: 'input_image',
                    image_url: photoDataUrl,
                    detail: 'high',
                  },
                ]
              : []),
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'reading_annotations',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['annotations'],
            properties: {
              annotations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['comment', 'type', 'sentence_ids'],
                  properties: {
                    comment: { type: 'string' },
                    type: {
                      type: 'string',
                      enum: ['理解', '关键词', '结构', '思考'],
                    },
                    sentence_ids: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: sentences.map((s) => s.id),
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });
  if (!response.ok) {
    const data = (await response.json()) as { error?: { code?: string } };
    throw new ModelError(
      response.status === 401
        ? '服务端 API Key 无效，请更新配置。'
        : data.error?.code === 'model_not_found'
          ? `当前 API Key 无法访问 ${model}，请检查模型权限。`
          : response.status === 429
            ? 'AI 调用额度或速率达到限制，请稍后重试。'
            : `AI 服务暂时不可用（${response.status}）。`,
    );
  }
  const result = (await response.json()) as {
    status: string;
    output: { content?: { type: string; text?: string }[] }[];
  };
  if (result.status !== 'completed')
    throw new ModelError('AI 输出未完成，请重试。');
  const text = result.output
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text ?? '')
    .join('');
  let parsed;
  try {
    parsed = outputSchema.parse(JSON.parse(text));
  } catch {
    throw new ModelError('AI 返回格式无效，请重试。');
  }
  const annotations: Annotation[] = [];
  let omitted = 0;
  for (const note of parsed.annotations) {
    try {
      if (!validAnnotationComment(note.comment))
        throw new Error('Invalid length or language');
      const anchors = selectedAnchors(note.sentence_ids, sentences, spans);
      const resolved = resolveAnnotations(
        aiSchema.parse({ annotations: [{ comment: note.comment, type: note.type, anchors }] }),
        spans,
      )[0];
      annotations.push({ ...resolved, id: `note-${annotations.length + 1}` });
    } catch {
      omitted++;
    }
  }
  if (parsed.annotations.length && !annotations.length && !repair)
    return annotate(spans, key, model, history, photoDataUrl, true);
  if (parsed.annotations.length && !annotations.length)
    throw new ModelError('批注未通过句子定位或长度校验，请重新生成。');
  return { annotations, omitted };
}
