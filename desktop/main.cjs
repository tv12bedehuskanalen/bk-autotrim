const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { pathToFileURL } = require("node:url");
const path = require("node:path"),
  fs = require("node:fs"),
  os = require("node:os");
const updates = require("../lib/updates.cjs");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
const media = require("../lib/media.cjs");
let win, controller;
const previews = [];
function event(data) {
  win?.webContents.send("progress", data);
}
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 850,
    minHeight: 650,
    backgroundColor: "#080f11",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
});
app.on("window-all-closed", () => app.quit());
ipcMain.handle("pick", async (_, kind) => {
  const result = await dialog.showOpenDialog(
    win,
    kind === "folder"
      ? { properties: ["openDirectory"] }
      : {
          properties: ["openFile"],
          filters:
            kind === "logo"
              ? [{ name: "PNG", extensions: ["png"] }]
              : [{ name: "Video", extensions: ["mov", "mp4", "mxf", "mkv"] }],
        },
  );
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("analyse", async (_, file) => {
  if (controller) throw Error("En jobb kjører allerede.");
  controller = new AbortController();
  try {
    const info = await media.probe(file);
    event({ stage: "Søker etter grønnmarkør" });
    if (
      !Number.isFinite(info.fps) ||
      info.fps <= 0 ||
      !Number.isFinite(info.duration)
    )
      throw Error("Kunne ikke lese opptakets varighet eller bildefrekvens.");
    const candidates = await media.detect(file, {
      signal: controller.signal,
      onProgress: (seconds) =>
        event({
          stage: "Søker etter grønnmarkør",
          seconds,
          fraction: seconds / info.duration,
        }),
    });
    const markers = [];
    for (const candidate of candidates)
      markers.push(
        await media.refine(file, candidate, info.fps, {
          signal: controller.signal,
        }),
      );
    const marker = markers.length === 1 ? markers[0] : null;
    return {
      ...info,
      markers,
      marker,
      ...(marker === null
        ? {
            start: 0,
            end: Math.max(
              0,
              Math.floor((info.duration - 1) * info.fps) / info.fps,
            ),
          }
        : media.bounds(marker, info.duration, info.fps)),
    };
  } finally {
    controller = null;
  }
});
ipcMain.handle("preview", async (_, file, seconds) => {
  const directory = fs.mkdtempSync(
    path.join(app.getPath("temp"), "bk-preview-"),
  );
  const target = path.join(directory, "preview.jpg");
  await media.run("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(Math.max(0, seconds)),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-1",
    "-y",
    target,
  ]);
  const data = fs.readFileSync(target).toString("base64");
  fs.rmSync(directory, { recursive: true, force: true });
  return "data:image/jpeg;base64," + data;
});
ipcMain.handle("render", async (_, job) => {
  if (controller) throw Error("En jobb kjører allerede.");
  controller = new AbortController();
  const temp = fs.mkdtempSync(path.join(app.getPath("temp"), "bk-autotrim-"));
  fs.writeFileSync(path.join(temp, "job.json"), JSON.stringify(job, null, 2));
  try {
    await media.render(
      { ...job, temp },
      { signal: controller.signal, onProgress: event },
    );
    fs.rmSync(temp, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    throw Error(e.message + " Midlertidige filer: " + temp);
  } finally {
    controller = null;
  }
});
ipcMain.handle("cancel", () => controller?.abort());
ipcMain.handle("open", (_, folder) => shell.openPath(folder));
ipcMain.handle("update", async () => {
  const result = await updates.check(app.getVersion());
  if (!result.available) return result;
  if (controller)
    return {
      ...result,
      message: result.message + " Fullfør eksporten før oppdatering.",
    };
  const choice = await dialog.showMessageBox(win, {
    type: "info",
    message: result.message,
    detail: "Last ned installasjonen fra GitHub?",
    buttons: ["Last ned", "Senere"],
    cancelId: 1,
  });
  if (choice.response !== 0) return result;
  const asset = updates.installer(result.tag, process.platform, process.arch);
  const directory = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, asset.name),
    partial = target + ".partial";
  event({ stage: "Laster ned oppdatering", filename: asset.name });
  try {
    const response = await fetch(asset.url, {
      signal: AbortSignal.timeout(600000),
    });
    if (!response.ok || !response.body)
      throw Error(
        "Installasjonen er ikke tilgjengelig for denne maskinen ennå.",
      );
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(partial),
    );
    fs.renameSync(partial, target);
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
  const install = await dialog.showMessageBox(win, {
    type: "info",
    message: "Oppdateringen er lastet ned.",
    buttons: ["Åpne installasjon", "Senere"],
    cancelId: 1,
  });
  if (install.response === 0) {
    const error = await shell.openPath(target);
    if (error) throw Error(error);
  }
  return { ...result, message: "Oppdateringen er lastet ned." };
});
ipcMain.handle("release", (_, url) => {
  if (
    /^https:\/\/github.com\/tv12bedehuskanalen\/bk-autotrim\/releases\//.test(
      url,
    )
  )
    return shell.openExternal(url);
});

ipcMain.handle("playback", async (_, file, seconds) => {
  if (controller) throw Error("Vent til gjeldende jobb er ferdig.");
  const directory = fs.mkdtempSync(
    path.join(app.getPath("temp"), "bk-playback-"),
  );
  previews.push(directory);
  const target = path.join(directory, "clip.mp4");
  await media.run("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(Math.max(0, seconds - 2)),
    "-i",
    file,
    "-t",
    "4",
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    "scale=960:-2",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    target,
  ]);
  return pathToFileURL(target).href;
});

ipcMain.handle("recover", async () => {
  const picked = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "Lokal eksport", extensions: ["mov"] }],
  });
  if (picked.canceled) return;
  const local = picked.filePaths[0];
  const destination = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });
  if (destination.canceled) return;
  if (controller) throw Error("En jobb kjører allerede.");
  controller = new AbortController();
  try {
    const target = path.join(destination.filePaths[0], path.basename(local));
    await require("../lib/files.cjs").deliver(local, target, {
      signal: controller.signal,
      onProgress: (p) => event({ stage: "Kopierer", target, ...p }),
    });
    return target;
  } finally {
    controller = null;
  }
});

app.on("before-quit", () => {
  controller?.abort();
  for (const directory of previews)
    fs.rmSync(directory, { recursive: true, force: true });
});

ipcMain.handle("defaults", () => ({
  logo: path.join(__dirname, "../assets/bk-logo.png"),
}));
