const $ = (id) => document.getElementById(id);
let source = null,
  folder = "",
  logo = "",
  busy = false,
  cutConfirmed = false;
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
async function loadInput(file) {
    if (!file) return;
    source = null;
    $("file").textContent = file.split(/[\\/]/).at(-1);
    $("file").title = file;
    source = await bk.analyse(file);
    cutConfirmed = source.markers.length === 1;
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
          ? "Ingen grønnmarkør i de første to minuttene. Sett innpunkt manuelt."
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
}
$("add").onclick = () => action(async () => loadInput(await bk.pick("video")));
document.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (!busy) $("dropzone").classList.add("dragover");
  if (event.dataTransfer) event.dataTransfer.dropEffect = busy ? "none" : "copy";
});
document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) $("dropzone").classList.remove("dragover");
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  $("dropzone").classList.remove("dragover");
  if (busy) return;
  const files = [...(event.dataTransfer?.files || [])];
  action(async () => {
    if (files.length !== 1) throw Error("Slipp én videofil om gangen.");
    const file = bk.droppedPath(files[0]);
    if (!/\.(mov|mp4|mxf|mkv)$/i.test(file))
      throw Error("Velg en videofil (MOV, MP4, MXF eller MKV).");
    await loadInput(file);
  });
});
$("markers").onchange = () =>
  action(async () => {
    if ($("markers").value === "") return;
    cutConfirmed = true;
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
      const clip = await bk.playback(
        source.file,
        Number($(which === "in" ? "start" : "end").value),
      );
      $("player").src = clip.url;
      $("playbackCut").textContent =
        `Klippunkt ved ${clip.offset.toFixed(3)} s i denne forhåndsvisningen`;
      $("previewDialog").showModal();
      $("player").currentTime = 0;
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
        cutConfirmed = true;
        await preview(which);
        duration();
      });
}
for (const id of ["start", "end"])
  $(id).onchange = () =>
    action(async () => {
      if (!source) return;
      cutConfirmed = true;
      $(id).value = Math.round(Number($(id).value) * source.fps) / source.fps;
      await preview(id === "start" ? "in" : "out");
      duration();
    });
for (const id of ["name", "branded", "clean"]) $(id).oninput = outputs;
$("render").onclick = () =>
  action(async () => {
    if (!source) throw Error("Velg et opptak først.");
    if (!folder) throw Error("Velg målmappe.");
    if (!cutConfirmed)
      throw Error("Velg en markør eller sett innpunktet manuelt før eksport.");
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
  if (p.queue) {
    $("queue").replaceChildren(
      ...p.queue.map((job) => {
        const item = document.createElement("li");
        item.textContent = `${job.filename} · ${job.status}${Number.isFinite(job.eta) && job.eta > 0 ? " · ca. " + Math.max(1, Math.ceil(job.eta / 60)) + " min" : ""}`;
        return item;
      }),
    );
  }
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

$("closePreview").onclick = () => {
  $("player").pause();
  $("previewDialog").close();
};
$("previewDialog").oncancel = () => $("player").pause();
