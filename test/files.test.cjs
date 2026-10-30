const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { deliver } = require("../lib/files.cjs");
test("deliver copies bytes, retains local file and never replaces existing output", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bk-files-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const local = path.join(directory, "local.mov"),
    target = path.join(directory, "output.mov");
  fs.writeFileSync(local, Buffer.alloc(1024 * 1024, 42));
  let progress = 0;
  await deliver(local, target, { onProgress: (p) => (progress = p.fraction) });
  assert.equal(fs.statSync(target).size, 1024 * 1024);
  assert.equal(progress, 1);
  assert.equal(fs.existsSync(local), true);
  fs.writeFileSync(local, "new");
  await assert.rejects(deliver(local, target), /finnes allerede/);
  assert.equal(fs.readFileSync(target)[0], 42);
  assert.equal(fs.existsSync(local), true);
});
test("cancelled copies preserve local export and remove only their own partial", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bk-cancel-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const local = path.join(directory, "local.mov"),
    target = path.join(directory, "output.mov");
  fs.writeFileSync(local, Buffer.alloc(1024 * 1024));
  const controller = new AbortController();
  await assert.rejects(
    deliver(local, target, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    }),
  );
  assert.ok(fs.existsSync(local));
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(target + ".partial"), false);
  fs.writeFileSync(target + ".partial", "other copy");
  await assert.rejects(deliver(local, target));
  assert.equal(fs.readFileSync(target + ".partial", "utf8"), "other copy");
});
