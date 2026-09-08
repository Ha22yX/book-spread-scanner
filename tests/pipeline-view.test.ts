import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PipelineProgress } from '../components/pipeline-progress';
import type { Spread } from '../lib/types';

const spread: Spread = {id:'test',sequence:1,created_at:1,revision:1,status:'processing',width:800,height:600,
  left:{width:400,height:600},right:{width:400,height:600},seam:{top:.5,bottom:.5,confidence:1,method:'gutter'},
  pipeline:{stage:'ocr_left',percent:35,updatedAt:1,splitReady:true,attempts:1},
};
void test('compact progress keeps current stage and percentage without a redundant step list', () => {
  const html = renderToStaticMarkup(createElement(PipelineProgress,{spread}));
  assert.ok(html.includes('识别左页文字'));
  assert.ok(html.includes('35%'));
  assert.ok(html.includes('书页自动处理进度'));
  assert.ok(!html.includes('<ol'));
});
void test('finished captures no longer occupy space with a completed progress card', () => {
  const html = renderToStaticMarkup(createElement(PipelineProgress,{spread:{...spread,status:'annotated',pipeline:{...spread.pipeline!,stage:'complete',percent:100}}}));
  assert.equal(html,'');
});
void test('offline processor explains pause and never claims to be processing at five percent', () => {
  const html = renderToStaticMarkup(createElement(PipelineProgress,{spread:{...spread,status:'queued'},health:'offline'}));
  assert.ok(html.includes('后台离线，照片已保存'));
  assert.ok(html.includes('无需重新上传'));
  assert.ok(html.includes('已暂停'));
  assert.ok(!html.includes('<span>35%</span>'));
});
void test('online queue shows previous captures without pretending OCR has started', () => {
  const html = renderToStaticMarkup(createElement(PipelineProgress,{spread:{...spread,status:'queued'},health:'online',ahead:3}));
  assert.ok(html.includes('前面还有 3 张'));
  assert.ok(html.includes('等待中'));
});
