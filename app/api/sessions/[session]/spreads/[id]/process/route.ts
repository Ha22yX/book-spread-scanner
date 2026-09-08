import { env } from 'cloudflare:workers';
import { checkOrigin,getSpread,db,json,failure,ApiError,readJson } from '@/lib/server';
import { isProcessing,queueSpread } from '@/lib/pipeline';
export async function POST(request:Request,{params}:{params:Promise<{session:string;id:string}>}) {
  try {
    checkOrigin(request);
    if(!env.PROCESSOR_TOKEN) throw new ApiError(503,'自动处理后台尚未启动。');
    const {session,id}=await params;const {value}=await getSpread(session,id);
    const input=await readJson(request,1000);
    if(input.revision!==value.revision) throw new ApiError(409,'书页已更新，请刷新。');
    if(isProcessing(value)) return json(value);
    if(input.mode !== undefined && !['full','annotations'].includes(input.mode as string)) throw new ApiError(400,'无效处理方式。');
    if(input.mode === 'annotations' && !value.spans?.length) throw new ApiError(400,'没有已有 OCR，无法仅重新生成批注。');
    const queued=queueSpread(value,input.mode === 'annotations' ? 'annotations' : 'full');
    const updated=await db().prepare("UPDATE spreads SET status='queued',job_started=NULL,data=? WHERE id=? AND session_id=? AND revision=? AND status NOT IN ('queued','processing','annotating')")
      .bind(JSON.stringify(queued),id,session,value.revision).run();
    if(!updated.meta.changes) throw new ApiError(409,'书页已经开始处理。');
    return json(queued,202);
  }catch(error){return failure(error);}
}
