const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { execFileSync } = require("node:child_process");
const [platform, arch] = process.argv.slice(2);
const appDirectory =
  platform === "darwin"
    ? path.resolve(
        "dist",
        arch === "arm64" ? "mac-arm64" : "mac",
        "BK Autotrim.app",
        "Contents",
      )
    : path.resolve("dist", "win-unpacked");
const resources = path.join(
  appDirectory,
  platform === "darwin" ? "Resources" : "resources",
);
const executable =
  platform === "darwin"
    ? path.join(appDirectory, "MacOS", "BK Autotrim")
    : path.join(appDirectory, "BK Autotrim.exe");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bk-installed-"));
try {
  const env = { ...process.env, PATH: "", BK_SMOKE_DIRECTORY: directory };
  execFileSync(
    path.join(
      resources,
      "media",
      "ffmpeg" + (platform === "win32" ? ".exe" : ""),
    ),
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1920x1080:rate=50:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=duration=2:sample_rate=48000",
      "-vf",
      "format=yuv422p10le,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-ac",
      "2",
      "-c:a",
      "pcm_s24le",
      path.join(directory, "source.mov"),
    ],
    { env, stdio: "inherit", timeout: 60000 },
  );
  execFileSync(executable, ["--bk-smoke-test", "--disable-gpu"], {
    env,
    cwd: directory,
    stdio: "inherit",
    timeout: 180000,
  });
  const result = JSON.parse(
    fs.readFileSync(path.join(directory, "result.json"), "utf8"),
  );
  if (result.version !== require("../package.json").version)
    throw Error("Unexpected installed version");
  console.log("Packaged app exports passed:", JSON.stringify(result));
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
