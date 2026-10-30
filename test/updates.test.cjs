const { test } = require("node:test");
const assert = require("node:assert/strict");
const { releaseTag, newer, installer, check } = require("../lib/updates.cjs");
test("validate redirect repository and tag", () => {
  assert.equal(
    releaseTag(
      "https://github.com/tv12bedehuskanalen/bk-autotrim/releases/tag/v0.2.0",
    ),
    "v0.2.0",
  );
  assert.throws(() => releaseTag("https://example.com/releases/tag/v0.2.0"));
  assert.throws(() =>
    releaseTag("https://github.com/other/repo/releases/tag/v0.2.0"),
  );
});
test("compare semantic version numerically", () => {
  assert.equal(newer("v0.10.0", "0.9.0"), true);
  assert.equal(newer("v0.1.0", "0.1.0"), false);
  assert.equal(newer("v0.1.0", "0.2.0"), false);
});
test("public installer URL matches artifact naming", () =>
  assert.equal(
    installer("v0.1.0", "win32", "x64").name,
    "BK-Autotrim-0.1.0-win32-x64.exe",
  ));
test("check uses public redirect without authentication", async () => {
  const r = await check("0.1.0", {
    fetcher: async (url, options) => {
      assert.equal(
        url,
        "https://github.com/tv12bedehuskanalen/bk-autotrim/releases/latest",
      );
      assert.equal(options.headers, undefined);
      return {
        ok: true,
        url: "https://github.com/tv12bedehuskanalen/bk-autotrim/releases/tag/v0.2.0",
      };
    },
  });
  assert.equal(r.available, true);
});
test("installer checksum must exist and be a valid SHA-256", async () => {
  const { checksum } = require("../lib/updates.cjs");
  const hash = "a".repeat(64);
  assert.equal(
    await checksum("v0.1.0", "app.exe", {
      fetcher: async () => ({
        ok: true,
        text: async () => hash + "  app.exe\n",
      }),
    }),
    hash,
  );
  await assert.rejects(
    checksum("v0.1.0", "other.exe", {
      fetcher: async () => ({
        ok: true,
        text: async () => hash + "  app.exe\n",
      }),
    }),
  );
});
