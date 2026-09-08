import type { ReadingSentence } from './sentences';
import type { TextSpan } from './types';
export function evidenceAnchors(evidence: {sentence_id:string;quote:string}[], sentences: ReadingSentence[], spans: TextSpan[]) {
  const ranges:{span_id:string;start:number;end:number}[]=[];
  for(const item of evidence){
    const selected=new Map<string,{start:number;end:number}>();
    const sentence=sentences.find(s=>s.id===item.sentence_id);
    const quote=item.quote.trim();
    const start=sentence?.text.indexOf(quote) ?? -1;
    if(!sentence?.source || !quote || start<0 || sentence.text.indexOf(quote,start+1)>=0) throw new Error('引用必须是当前句子内的唯一原文');
    for(const ref of sentence.source.slice(start,start+quote.length)) if(ref){
      const old=selected.get(ref.span_id);
      selected.set(ref.span_id,{start:Math.min(old?.start??ref.offset,ref.offset),end:Math.max(old?.end??0,ref.offset+1)});
    }
    for(const [span_id,r] of selected)ranges.push({span_id,...r});
  }
  ranges.sort((a,b)=>spans.findIndex(s=>s.id===a.span_id)-spans.findIndex(s=>s.id===b.span_id)||a.start-b.start);
  const merged:typeof ranges=[];
  for(const r of ranges){
    const last=merged.at(-1);
    if(last?.span_id===r.span_id && r.start<=last.end)last.end=Math.max(last.end,r.end);
    else merged.push({...r});
  }
  if(!merged.length || merged.length>8) throw new Error('引用范围过大');
  return merged.map(({span_id,...r})=>{
    const span=spans.find(s=>s.id===span_id);
    if(!span)throw new Error('引用不存在');
    return {span_id,...r,quote:span.text.slice(r.start,r.end)};
  });
}
