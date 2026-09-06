import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepClock } from '../src/app/core/FixedStepClock.ts';
for (const rate of [30, 60, 120, 144]) {
  test(`${rate} Hz advances exactly 600 fixed steps in ten seconds`, () => {
    const clock = new FixedStepClock(); clock.reset(0);
    let steps = 0;
    for (let i = 1; i <= rate * 10; i++) steps += clock.advance(i * 1000 / rate);
    assert.equal(steps, 600);
  });
}
test('a stalled frame has bounded catch-up', () => {
  const clock = new FixedStepClock(); clock.reset(0);
  assert.equal(clock.advance(60000), 3);
  assert.equal(clock.advance(60000), 0);
});
test('visibility reset discards hidden elapsed time', () => {
  const clock = new FixedStepClock(); clock.reset(0); clock.advance(16);
  clock.reset(); assert.equal(clock.advance(60000), 0);
  assert.equal(clock.advance(60017), 1);
});
