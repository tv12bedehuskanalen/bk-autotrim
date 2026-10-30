const path = require("node:path");
const fs = require("node:fs");
function binary(name) {
  if (!["ffmpeg", "ffprobe"].includes(name))
    throw Error("Ukjent medieverktøy.");
  const root =
    process.resourcesPath &&
    fs.existsSync(path.join(process.resourcesPath, "media"))
      ? path.join(process.resourcesPath, "media")
      : path.join(__dirname, "../vendor/bin");
  const target = path.join(
    root,
    name + (process.platform === "win32" ? ".exe" : ""),
  );
  if (!fs.existsSync(target))
    throw Error("Medieverktøy mangler. Kjør npm run build:media før oppstart.");
  return target;
}
module.exports = { binary };
