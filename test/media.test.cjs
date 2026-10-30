const { test } = require("node:test");
const assert = require("node:assert/strict");
const { bounds, safeName } = require("../lib/media.cjs");
test("marker offsets and exclusive end match sample", () =>
  assert.deepEqual(bounds(48.2, 3513.4, 50), { start: 58.2, end: 3512.4 }));
test("reject invalid cuts and path traversal", () => {
  assert.throws(() => bounds(100, 50, 50));
  for (const n of ["../x", "a/b", "a\\b", ""]) assert.throws(() => safeName(n));
  assert.equal(safeName("Program.mov"), "Program");
});
test("reject Windows device names, empty stem and trailing dots", () => {
  for (const n of ["CON.mov", "nul", "LPT1.mp4", ".mov", "trailing.", "space "])
    assert.throws(() => safeName(n));
});
test("green detection tolerates transmission shift while rejecting partial green", () => {
  const { green } = require("../lib/media.cjs");
  const frame = Buffer.alloc(32 * 18 * 3);
  for (let i = 0; i < frame.length; i += 3) {
    frame[i] = 4;
    frame[i + 1] = 245;
    frame[i + 2] = 8;
  }
  assert.equal(green(frame), true);
  frame.fill(100, 0, 300);
  assert.equal(green(frame), false);
});
