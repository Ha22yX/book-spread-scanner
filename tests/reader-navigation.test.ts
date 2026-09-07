import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentCapture, horizontalWheelDelta, revealOffset, navigationDirection } from '../lib/reader-navigation';

void test('arrow navigation follows existing capture order, skips deleted gaps and stops at boundaries', () => {
  const ids = ['capture-1','capture-3','capture-7'];
  assert.equal(adjacentCapture(ids,'capture-3',-1),'capture-1');
  assert.equal(adjacentCapture(ids,'capture-3',1),'capture-7');
  assert.equal(adjacentCapture(ids,'capture-1',-1),null);
  assert.equal(adjacentCapture(ids,'capture-7',1),null);
  assert.equal(adjacentCapture([],'missing',1),null);
});
void test('wheel supports mouse lines, trackpad pixels, page units and both directions without doubling diagonal input', () => {
  assert.equal(horizontalWheelDelta(0,100,0,800),100);
  assert.equal(horizontalWheelDelta(0,-3,1,800),-48);
  assert.equal(horizontalWheelDelta(0,1,2,800),800);
  assert.equal(horizontalWheelDelta(60,20,0,800),60);
  assert.equal(horizontalWheelDelta(0,0,0,800),0);
});
void test('selection reveals only the horizontal overflow, leaving visible captures stationary', () => {
  assert.equal(revealOffset(20,100,0,500),0);
  assert.equal(revealOffset(-20,100,0,500),-20);
  assert.equal(revealOffset(450,550,0,500),50);
});
void test('shortcuts do not consume browser modifier combinations, IME or handled events', () => {
  const event = {key:'ArrowRight',ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,isComposing:false,defaultPrevented:false};
  assert.equal(navigationDirection(event),1);
  assert.equal(navigationDirection({...event,key:'ArrowLeft'}),-1);
  for (const flag of ['ctrlKey','altKey','metaKey','shiftKey','isComposing','defaultPrevented']) assert.equal(navigationDirection({...event,[flag]:true}),null);
  assert.equal(navigationDirection({...event,key:'ArrowDown'}),null);
});
