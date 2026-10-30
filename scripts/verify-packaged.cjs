const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");
const [platform, arch] = process.argv.slice(2);
const resources =
  platform === "darwin"
    ? path.join(
        "dist",
        arch === "arm64" ? "mac-arm64" : "mac",
        "BK Autotrim.app",
        "Contents",
        "Resources",
      )
    : path.join("dist", "win-unpacked", "resources");
const archive = path.join(resources, "app.asar");
const packaged = JSON.parse(
  asar.extractFile(archive, "package.json").toString(),
);
if (packaged.version !== require("../package.json").version)
  throw Error("Feil appversjon i installasjonen.");
const logo = fs.readFileSync(path.join(resources, "branding", "bk-logo.png"));
if (!logo.equals(fs.readFileSync("assets/bk-logo.png")))
  throw Error("Logoen er endret i installasjonen.");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "bk-packaged-"));
try {
  const input = path.resolve(resources, "branding", "bk-logo.png");
  if (!fs.readFileSync(input).equals(logo))
    throw Error("Ekstern FFmpeg-logo mangler eller er endret.");
  for (const tool of ["ffmpeg", "ffprobe"]) {
    const binary = path.resolve(
      resources,
      "media",
      tool + (platform === "win32" ? ".exe" : ""),
    );
    const output = execFileSync(binary, ["-version"], {
      cwd: temporary,
      env: { ...process.env, PATH: "" },
      encoding: "utf8",
    });
    if (output.includes("--enable-nonfree"))
      throw Error("Nonfree-verktøy i installasjonen.");
    console.log("Pakket verktøy:", output.split("\n")[0]);
  }
  execFileSync(
    path.resolve(
      resources,
      "media",
      "ffmpeg" + (platform === "win32" ? ".exe" : ""),
    ),
    [
      "-v",
      "error",
      "-i",
      input,
      "-vf",
      "alphaextract",
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ],
    { cwd: temporary, env: { ...process.env, PATH: "" }, stdio: "inherit" },
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
