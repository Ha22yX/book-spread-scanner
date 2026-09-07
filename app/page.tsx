'use client';
import { useState } from 'react';
import { BookOpen, Upload, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
export default function Home() {
  const [preview, setPreview] = useState('');
  return <main className="shell"><header className="topbar"><a className="brand" href="/"><BookOpen/><span>书页<span className="brand-sub">双页扫描</span></span></a><span className="stage-label">01 / 拍摄与分割</span></header><section className="workspace"><div className="heading"><div><p className="eyebrow">YOUR READING DESK</p><h1>把书页，留在这里。</h1><p className="muted">拍下展开的书本，按左页 → 右页整理。</p></div><Button className="action" onClick={()=>document.getElementById('photo')?.click()}><Upload/>选择书页照片</Button></div><input id="photo" type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)setPreview(URL.createObjectURL(f))}}/><div className="empty-surface">{preview?<img src={preview} alt="待分割的书页照片" style={{maxHeight:500,maxWidth:'100%'}}/>:<><Camera size={42}/><h2>从第一张书页开始</h2><p>将左右两页完整放入画面，保持书脊竖直。</p><Button className="action" variant="outline" onClick={()=>document.getElementById('photo')?.click()}>选择照片</Button></>}</div></section></main>;
}
