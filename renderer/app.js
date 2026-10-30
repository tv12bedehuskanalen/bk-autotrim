const $ = (id) => document.getElementById(id);
let source = null,
  folder = "",
  logo = "",
  busy = false;
function lock(value) {
  busy = value;
  for (const control of document.querySelectorAll("button,input,select")) {
    if (!["cancel", "open"].includes(control.id)) control.disabled = value;
  }
  $("cancel").disabled = !value;
}
async function action(fn) {
  if (busy) return;
  $("error").textContent = "";
  lock(true);
  try {
    await fn();
  } catch (e) {
    $("error").textContent = e.message || String(e);
  } finally {
    lock(false);
  }
}
function outputs() {
  const name = ($("name").value || "Program").replace(/\.(mov|mp4)$/i, "");
  $("outputs").textContent = [
    $("branded").checked ? `${folder || "Målmappe"}/${name}_BRANDED.mov` : null,
    $("clean").checked ? `${folder || "Målmappe"}/${name}.mov` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
function cut(which) {
  return which === "in"
    ? Number($("start").value)
    : Math.max(0, Number($("end").value) - 1 / source.fps);
}
async function preview(which) {
  if (source)
    $(which + "Image").src = await bk.preview(source.file, cut(which));
}
function duration() {
  const seconds = Number($("end").value) - Number($("start").value);
  $("duration").textContent =
    seconds > 0
      ? `Varighet: ${seconds.toFixed(3)} s · ${Math.round(seconds * (source?.fps || 50))} bilder. Utpunktet er første bilde som utelates.`
      : "Kontroller klippepunktene.";
}
$("add").onclick = () =>
  action(async () => {
    const file = await bk.pick("video");
    if (!file) return;
    source = null;
    $("file").textContent = file;
    source = await bk.analyse(file);
    $("start").value = source.start;
    $("end").value = source.end;
    $("start").step = $("end").step = 1 / source.fps;
    $("name").value = file
      .split(/[\\/]/)
      .at(-1)
      .replace(/\.[^.]+$/, "");
    $("info").textContent =
      `${source.video.width} × ${source.video.height} · ${source.fps.toFixed(3)} fps · ${source.video.pix_fmt} · ${source.audio.map((a) => a.channels + " kanaler / " + a.sample_rate + " Hz").join(", ")}`;
    $("marker").textContent =
      source.markers.length > 1
        ? `${source.markers.length} mulige markører. Velg og kontroller innpunkt.`
        : source.marker === null
          ? "Ingen grønnmarkør. Sett innpunkt manuelt."
          : `Grønnmarkør: ${source.marker.toFixed(3)} s`;
    $("markers").replaceChildren(new Option("Velg markør …", ""));
    for (const marker of source.markers)
      $("markers").add(
        new Option(
          `${marker.toFixed(3)} s → inn ${(marker + 10).toFixed(3)} s`,
          marker,
        ),
      );
    $("markers").hidden = source.markers.length < 2;
    $("status").textContent = "Kontroller klippepunktene før eksport";
    await preview("in");
    await preview("out");
    outputs();
    duration();
  });
$("markers").onchange = () =>
  action(async () => {
    if ($("markers").value === "") return;
    $("start").value =
      Math.round((Number($("markers").value) + 10) * source.fps) / source.fps;
    await preview("in");
    duration();
  });
$("folder").onclick = () =>
  action(async () => {
    folder = (await bk.pick("folder")) || folder;
    $("folderPath").textContent = folder;
    outputs();
  });
$("logo").onclick = () =>
  action(async () => {
    logo = (await bk.pick("logo")) || logo;
    $("logoPath").textContent = logo;
  });
$("open").onclick = async () => {
  if (folder) {
    const error = await bk.open(folder);
    if (error) $("error").textContent = error;
  }
};
for (const which of ["in", "out"]) {
  $(which + "Preview").onclick = () => action(() => preview(which));
  $(which + "Play").onclick = () =>
    action(async () => {
      if (!source) return;
      $("status").textContent = "Lager avspillbar forhåndsvisning";
      $("player").src = await bk.playback(source.file, cut(which));
      $("player").hidden = false;
      $("player").currentTime = 2;
      await $("player").play();
    });
  for (const delta of [-1, 1])
    $(which + (delta < 0 ? "Back" : "Next")).onclick = () =>
      action(async () => {
        if (!source) return;
        const field = $(which === "in" ? "start" : "end");
        field.value =
          Math.max(
            0,
            Math.min(
              Math.floor(source.duration * source.fps),
              Math.round(Number(field.value) * source.fps) + delta,
            ),
          ) / source.fps;
        await preview(which);
        duration();
      });
}
for (const id of ["start", "end"])
  $(id).onchange = () =>
    action(async () => {
      if (!source) return;
      $(id).value = Math.round(Number($(id).value) * source.fps) / source.fps;
      await preview(id === "start" ? "in" : "out");
      duration();
    });
for (const id of ["name", "branded", "clean"]) $(id).oninput = outputs;
$("render").onclick = () =>
  action(async () => {
    if (!source) throw Error("Velg et opptak først.");
    if (!folder) throw Error("Velg målmappe.");
    await bk.render({
      file: source.file,
      start: Number($("start").value),
      end: Number($("end").value),
      folder,
      name: $("name").value,
      logo,
      branded: $("branded").checked,
      clean: $("clean").checked,
    });
    $("status").textContent = "Alle eksportene er ferdige";
  });
$("recover").onclick = () =>
  action(async () => {
    const target = await bk.recover();
    if (target) $("status").textContent = "Kopiert: " + target;
  });
$("cancel").onclick = () => bk.cancel();
$("update").onclick = () =>
  action(async () => {
    $("status").textContent = (await bk.update()).message;
  });
bk.onProgress((p) => {
  $("status").textContent = p.stage;
  $("progress").value = p.fraction || 0;
  $("detail").textContent = [
    p.filename,
    p.target,
    p.seconds ? `Undersøkt ${Math.round(p.seconds)} s` : null,
    Number.isFinite(p.eta)
      ? `Anslått gjenstående: ${Math.ceil(p.eta / 60)} min`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
});
lock(false);

bk.defaults().then((defaults) => {
  logo = defaults.logo;
  $("logoPath").textContent = "bk-logo.png · 1920 × 1080 · original plassering";
});
