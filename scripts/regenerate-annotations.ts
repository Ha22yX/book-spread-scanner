import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { ANNOTATION_PROMPT_VERSION } from '../lib/prompts';
import { validAnnotationComment } from '../lib/annotation-style';
import { pageLabel } from '../lib/page-numbers';
import type { ScanSession, Spread } from '../lib/types';

process.loadEnvFile('.dev.vars');
const session=process.argv[2];
if(!session || !/^[0-9a-f-]{36}$/i.test(session))throw new Error('Supply the exact session UUID.');
const base=process.env.PROCESSOR_BASE_URL!;
if(!base || !process.env.SITE_ACCESS_TOKEN)throw new Error('Configure the existing site connection.');
const headers={'OAI-Sites-Authorization':`Bearer ${process.env.SITE_ACCESS_TOKEN}`};
async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const requestHeaders=new Headers(headers);
  new Headers(init?.headers).forEach((value,key)=>requestHeaders.set(key,value));
  const response=await fetch(base+path,{...init,headers:requestHeaders,signal:AbortSignal.timeout(30000)});
  const data=await response.json() as T & {error?:string};
  if(!response.ok)throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
const stable=(s:Spread)=>createHash('sha256').update(JSON.stringify({revision:s.revision,seam:s.seam,width:s.width,height:s.height,left:s.left,right:s.right,spans:s.spans,ocrEngine:s.ocrEngine})).digest('hex');
mkdirSync('outputs',{recursive:true});
const backup=`outputs/annotations-before-v8-${session}.json`;
let snapshot:ScanSession;
if(existsSync(backup))snapshot=JSON.parse(readFileSync(backup,'utf8')) as ScanSession;
else {
  snapshot=await api<ScanSession>(`/api/sessions/${session}`);
  assert.ok(snapshot.spreads.length,'No existing photos.');
  assert.ok(snapshot.spreads.every(s=>s.spans?.length),'A photo lacks OCR; stopped without recomputing it.');
  writeFileSync(backup,JSON.stringify(snapshot),{flag:'wx'});
}
const checkpoint=`outputs/annotations-${ANNOTATION_PROMPT_VERSION.split('-').at(-1)}-${session}.json`;
const results: {sequence:number;id:string;label:string;notes:number;unknownPage:boolean}[]=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint,'utf8')):[];
const ordered=[...snapshot.spreads].sort((a,b)=>a.sequence-b.sequence);
console.log(`Regenerating annotations only: ${ordered.length} existing photos, starting at capture ${ordered[0].sequence}. Original notes backed up.`);
for(const old of ordered){
  if(results.some(r=>r.id===old.id))continue;
  const path=`/api/sessions/${session}/spreads/${old.id}`;
  let current=await api<Spread>(path);
  assert.equal(stable(current),stable(old),'OCR or split changed; stopped to avoid overwriting user edits.');
  if(current.status!=='queued' && current.status!=='processing' && !(current.status==='annotated' && current.promptVersion===ANNOTATION_PROMPT_VERSION)){
    current=await api<Spread>(path+'/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:old.revision,mode:'annotations'})});
  }
  const deadline=Date.now()+600000;
  while(current.status==='queued' || current.status==='processing'){
    assert.equal(current.pipeline?.mode,'annotations','Another workflow owns this photo; stopped.');
    if(Date.now()>deadline)throw new Error(`Capture ${old.sequence} timed out; rerun this script to resume.`);
    await sleep(2000);
    current=await api<Spread>(path);
  }
  assert.equal(current.status,'annotated',current.error || 'Generation did not finish.');
  assert.equal(current.promptVersion,ANNOTATION_PROMPT_VERSION);
  assert.equal(stable(current),stable(old),'OCR/split was unexpectedly modified.');
  assert.ok(current.annotations && current.annotations.length>=2 && current.annotations.length<=4,'Expected 2–4 verified notes; stopped for review.');
  assert.ok(current.annotations.every(n=>validAnnotationComment(n.comment) && n.anchors.length<=8));
  assert.ok(current.pageNumbers);
  results.push({sequence:current.sequence,id:current.id,label:pageLabel(current),notes:current.annotations.length,unknownPage:current.pageNumbers.left===null || current.pageNumbers.right===null});
  writeFileSync(checkpoint+'.tmp',JSON.stringify(results));
  renameSync(checkpoint+'.tmp',checkpoint);
  console.log(`Completed ${results.length}/${ordered.length}: capture ${current.sequence}, ${pageLabel(current)}, ${current.annotations.length} notes. OCR/split unchanged.`);
}
console.log(`DONE: ${results.length} photos; ${results.filter(r=>r.unknownPage).length} have an unreadable/missing folio. No OCR or split recomputed.`);
