// Invoked only by --bk-smoke-test; verifies the installed resource paths and IPC bridge.
const path = require("node:path");
const fs = require("node:fs");
async function check({ app, win, media }) {
  const directory = process.env.BK_SMOKE_DIRECTORY;
  if (!directory || !path.isAbsolute(directory))
    throw Error("Missing absolute smoke directory");
  const defaults = await win.webContents.executeJavaScript("bk.defaults()");
  if (!fs.existsSync(defaults.logo) || defaults.logo.includes("app.asar"))
    throw Error("FFmpeg cannot access packaged branding");
  const state = await win.webContents.executeJavaScript(
    '({title:document.title,buttons:document.querySelectorAll("button").length})',
  );
  if (state.title !== "BK Autotrim" || state.buttons < 15)
    throw Error("Incomplete packaged interface");
  await media.render({
    file: path.join(directory, "source.mov"),
    start: 0.22,
    end: 1.22,
    folder: path.join(directory, "outputs"),
    temp: path.join(directory, "render"),
    name: "Packaged",
    branded: true,
    clean: true,
    logo: defaults.logo,
  });
  for (const name of ["Packaged.mov", "Packaged_BRANDED.mov"]) {
    const info = await media.probe(path.join(directory, "outputs", name));
    if (
      info.fps !== 50 ||
      Math.abs(info.duration - 1) > 0.02 ||
      info.video.width !== 1920
    )
      throw Error("Unexpected packaged export");
  }
  fs.writeFileSync(
    path.join(directory, "result.json"),
    JSON.stringify({
      version: app.getVersion(),
      logo: defaults.logo,
      ...state,
    }),
  );
}
module.exports = { check };
