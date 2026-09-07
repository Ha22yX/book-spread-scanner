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
