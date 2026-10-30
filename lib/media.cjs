const { binary } = require("./tools.cjs");
const { checkSpace, deliver } = require("./files.cjs");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
function run(bin, args, { progress, signal, binaryOutput = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(binary(bin), args, { windowsHide: true, signal });
    let out = "",
      chunks = [],
      err = "",
      childError;
    p.stdout.on("data", (b) => {
      if (binaryOutput) chunks.push(b);
      else out += b;
      progress?.(String(b));
    });
    p.stderr.on("data", (b) => {
      err += b;
      if (err.length > 200000) err = err.slice(-200000);
    });
    p.on("error", (error) => {
      childError = error;
    });
    p.on("close", (code) =>
      childError
        ? reject(childError)
        : code === 0
          ? resolve({ out: binaryOutput ? Buffer.concat(chunks) : out, err })
          : reject(Error(err.slice(-5000) || `${bin}: ${code}`)),
    );
  });
}
async function probe(file) {
  const { out } = await run("ffprobe", [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    file,
  ]);
  const data = JSON.parse(out),
    v = data.streams.find((s) => s.codec_type === "video"),
    a = data.streams.filter((s) => s.codec_type === "audio");
  if (!v) throw Error("Filen har ingen videostrøm.");
  const [n, d] = v.avg_frame_rate.split("/").map(Number);
  return {
    file,
    duration: Number(data.format.duration),
    video: v,
    audio: a,
    fps: n / d,
  };
}
function bounds(marker, duration, fps) {
  const start = Math.round((marker + 10) * fps) / fps,
    end = Math.floor((duration - 1) * fps) / fps;
  if (start >= end) throw Error("Startpunktet er etter sluttpunktet.");
  return { start, end };
}
function green(frame) {
  let count = 0;
  for (let i = 0; i < frame.length; i += 3)
    if (
      frame[i + 1] > 150 &&
      frame[i + 1] > frame[i] * 1.35 &&
      frame[i + 1] > frame[i + 2] * 1.35
    )
      count++;
  return count / (frame.length / 3) > 0.95;
}
async function detect(file, { signal, onProgress } = {}) {
  const p = spawn(
    binary("ffmpeg"),
    [
      "-v",
      "error",
      "-i",
      file,
      "-an",
      "-vf",
      "fps=5,scale=32:18",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "-",
    ],
    { windowsHide: true, signal },
  );
  let pending = Buffer.alloc(0),
    index = 0,
    first = null,
    count = 0,
    err = "";
  const markers = [];
  const finish = () => {
    if (count >= 3 && count <= 10) markers.push(first);
    first = null;
    count = 0;
  };
  return new Promise((resolve, reject) => {
    p.stderr.on("data", (b) => {
      err = (err + b).slice(-5000);
    });
    p.on("error", reject);
    p.stdout.on("data", (b) => {
      pending = Buffer.concat([pending, b]);
      while (pending.length >= 1728) {
        const frame = pending.subarray(0, 1728);
        pending = pending.subarray(1728);
        if (green(frame)) {
          if (first === null) first = index / 5;
          count++;
        } else finish();
        index++;
        if (index % 50 === 0) onProgress?.(index / 5);
      }
    });
    p.on("close", (code) => {
      if (code === 0) {
        finish();
        resolve(markers);
      } else reject(Error(err || "Søket ble avbrutt."));
    });
  });
}
async function refine(file, coarse, fps, { signal } = {}) {
  const offset = Math.max(0, Math.ceil((coarse - 0.6) * fps - 0.000001) / fps);
  return new Promise((resolve, reject) => {
    const p = spawn(
      binary("ffmpeg"),
      [
        "-v",
        "error",
        "-ss",
        String(offset),
        "-i",
        file,
        "-t",
        "2.4",
        "-an",
        "-vf",
        "scale=32:18",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
      ],
      { windowsHide: true, signal },
    );
    let pending = Buffer.alloc(0),
      i = 0,
      first = null;
    p.on("error", reject);
    p.stdout.on("data", (b) => {
      pending = Buffer.concat([pending, b]);
      while (pending.length >= 1728) {
        let g = 0;
        for (let j = 0; j < 1728; j += 3)
          if (
            pending[j + 1] > 150 &&
            pending[j + 1] > pending[j] * 1.35 &&
            pending[j + 1] > pending[j + 2] * 1.35
          )
            g++;
        if (first === null && g / 576 > 0.95)
          first = Math.round(offset * fps + i) / fps;
        pending = pending.subarray(1728);
        i++;
      }
    });
    p.on("close", (c) =>
      c === 0
        ? resolve(first ?? coarse)
        : reject(Error("Kunne ikke kontrollere markøren.")),
    );
  });
}
function safeName(name) {
  if (
    !name ||
    name !== path.basename(name) ||
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    name === "." ||
    name === ".." ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw Error("Skriv et gyldig filnavn uten mappe eller spesialtegn.");
  const base = name.replace(/\.(mov|mp4)$/i, "");
  if (!base) throw Error("Filnavnet mangler.");
  return base;
}
async function copyEligible(file, start, fps, { signal } = {}) {
  const { out } = await run(
    "ffprobe",
    [
      "-v",
      "error",
      "-read_intervals",
      `${start}%+0.1`,
      "-select_streams",
      "v:0",
      "-show_packets",
      "-show_entries",
      "packet=pts_time,flags",
      "-of",
      "json",
      file,
    ],
    { signal },
  );
  const first = JSON.parse(out).packets?.[0];
  return Boolean(
    first?.flags.includes("K") &&
      Math.abs(Number(first.pts_time) - start) < 0.1 / fps,
  );
}
async function frameHash(file, time, { signal } = {}) {
  const { out } = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(time),
      "-i",
      file,
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-f",
      "framemd5",
      "-",
    ],
    { signal },
  );
  return out
    .split("\n")
    .find((line) => line && !line.startsWith("#"))
    ?.split(",")
    .at(-1)
    ?.trim();
}
async function verifyCopy(source, output, start, end, fps, { signal } = {}) {
  const { out } = await run(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames,start_time,duration",
      "-of",
      "json",
      output,
    ],
    { signal },
  );
  const video = JSON.parse(out).streams[0];
  if (
    Number(video.nb_read_frames) !== Math.round((end - start) * fps) ||
    Math.abs(Number(video.start_time)) > 0.1 / fps ||
    Math.abs(Number(video.duration) - (end - start)) > 0.1 / fps
  )
    return false;
  for (const [original, copied] of [
    [start, 0],
    [end - 1 / fps, end - start - 1 / fps],
  ]) {
    const a = await frameHash(source, original, { signal }),
      b = await frameHash(output, copied, { signal });
    if (!a || a !== b) return false;
  }
  return true;
}
async function render(job, { signal, onProgress = () => {} } = {}) {
  const { file, start, end, folder, name, logo, branded, clean, temp } = job;
  if (
    !(
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      end > start
    )
  )
    throw Error("Kontroller inn- og utpunkt.");
  if (!branded && !clean) throw Error("Velg minst én eksport.");
  if (branded) {
    if (!fs.existsSync(logo || "")) throw Error("Velg en PNG-logo.");
    await validateLogo(logo);
  }
  const meta = await probe(file);
  if (branded) {
    const overlay = await probe(logo);
    if (
      overlay.video.width !== meta.video.width ||
      overlay.video.height !== meta.video.height
    )
      throw Error(
        "Logoens bildeflate må være identisk med opptaket. Logoen skaleres ikke.",
      );
  }
  if (end > meta.duration + 0.02)
    throw Error("Sluttpunktet er utenfor opptaket.");
  if (meta.audio.length !== 1 || meta.audio[0].channels !== 2)
    throw Error("Denne versjonen krever én stereolydstrøm.");
  const base = safeName(name),
    duration = end - start;
  if (
    Math.abs(start * meta.fps - Math.round(start * meta.fps)) > 0.001 ||
    Math.abs(end * meta.fps - Math.round(end * meta.fps)) > 0.001
  )
    throw Error("Klipp må ligge på hele bilder.");
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(temp, { recursive: true });
  const estimate =
    duration * ((Number(meta.video.bit_rate) || 60000000) / 8 + 288000) * 1.5;
  await checkSpace(temp, estimate);
  await checkSpace(folder, estimate * (Number(branded) + Number(clean)));
  const variants = [...(branded ? [true] : []), ...(clean ? [false] : [])];
  for (const b of variants)
    if (fs.existsSync(path.join(folder, base + (b ? "_BRANDED" : "") + ".mov")))
      throw Error("En målfil finnes allerede. Velg et annet navn.");
  onProgress({ stage: "Måler lyd", fraction: 0 });
  const measurement = await run(
    "ffmpeg",
    [
      "-hide_banner",
      "-ss",
      String(start),
      "-i",
      file,
      "-t",
      String(duration),
      "-vn",
      "-af",
      `atrim=duration=${duration},asetpts=PTS-STARTPTS,loudnorm=I=-23:TP=-1:LRA=50:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { signal },
  );
  const match = measurement.err.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw Error("Kunne ikke måle lydnivået.");
  const m = JSON.parse(match[0]);
  if (!Number.isFinite(Number(m.input_i)))
    throw Error("Lydsporet er stille eller kunne ikke normaliseres.");
  const af = `atrim=duration=${duration},asetpts=PTS-STARTPTS,loudnorm=I=-23:TP=-1:LRA=50:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const jobs = [];
  const queue = () =>
    jobs.map(({ filename, target, status, eta }) => ({
      filename,
      target,
      status,
      eta,
    }));
  const emit = (data) => onProgress({ ...data, queue: queue() });
  function software(args, branded) {
    const result = [...args],
      first = result.indexOf("-c:v"),
      last = Math.min(
        ...[
          "-color_primaries",
          "-color_trc",
          "-colorspace",
          "-color_range",
          "-movflags",
        ]
          .map((option) => result.indexOf(option))
          .filter((index) => index > first),
      );
    result.splice(
      first,
      last - first,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-pix_fmt",
      branded ? "yuv420p" : meta.video.pix_fmt,
    );
    return result;
  }
  function argumentsFor(branded, copying, length, destination) {
    const args = [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-ss",
      String(start),
      "-i",
      file,
    ];
    if (branded) args.push("-i", logo);
    args.push("-t", String(length));
    if (branded)
      args.push(
        "-filter_complex",
        "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]",
        "-map",
        "[v]",
      );
    else args.push("-map", "0:v:0");
    args.push("-map", "0:a:0", "-af", af, "-ar", "48000", "-c:a", "pcm_s24le");
    if (copying) args.push("-c:v", "copy");
    else if (branded && process.platform === "darwin")
      args.push(
        "-c:v",
        "h264_videotoolbox",
        "-b:v",
        "35M",
        "-pix_fmt",
        "yuv420p",
      );
    else if (branded && process.platform === "win32")
      args.push(
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p5",
        "-rc",
        "vbr",
        "-cq",
        "18",
        "-b:v",
        "0",
        "-pix_fmt",
        "yuv420p",
      );
    else
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
        "-pix_fmt",
        branded ? "yuv420p" : meta.video.pix_fmt,
      );
    for (const [option, value] of [
      ["-color_primaries", meta.video.color_primaries],
      ["-color_trc", meta.video.color_transfer],
      ["-colorspace", meta.video.color_space],
      ["-color_range", meta.video.color_range],
    ]) {
      if (value && value !== "unknown") args.push(option, value);
    }
    args.push(
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      "-nostats",
      destination,
    );
    return args;
  }
  async function encode(args, branded, progress) {
    try {
      await run("ffmpeg", args, { signal, progress });
      return args;
    } catch (error) {
      if (
        signal?.aborted ||
        !args.some((value) =>
          ["h264_nvenc", "h264_videotoolbox", "copy"].includes(value),
        )
      )
        throw error;
      const fallback = software(args, branded);
      await run("ffmpeg", fallback, { signal, progress });
      return fallback;
    }
  }
  // A short real encode gives a machine-specific estimate for each queued export.
  for (const branded of variants) {
    const filename = base + (branded ? "_BRANDED" : "") + ".mov",
      target = path.join(folder, filename),
      local = path.join(temp, filename);
    const copying =
      !branded &&
      meta.video.codec_name === "h264" &&
      (await copyEligible(file, start, meta.fps, { signal }));
    const length = Math.min(2, duration),
      sample = path.join(temp, "benchmark-" + filename),
      began = Date.now();
    emit({ stage: "Beregner eksporttid", filename, target, fraction: 0 });
    let calibrated;
    try {
      calibrated = await encode(
        argumentsFor(branded, copying, length, sample),
        branded,
      );
    } finally {
      fs.rmSync(sample, { force: true });
    }
    const eta = ((Date.now() - began) / 1000 / length) * duration;
    let args = argumentsFor(branded, copying, duration, local);
    if (calibrated[calibrated.indexOf("-c:v") + 1] === "libx264")
      args = software(args, branded);
    jobs.push({
      filename,
      target,
      local,
      branded,
      args,
      status: "Venter",
      eta,
    });
    emit({ stage: "Beregner eksporttid", filename, target, fraction: 0 });
  }
  for (const job of jobs) {
    const { filename, target, local, branded } = job;
    let began = Date.now(),
      buffer = "";
    job.status = "Eksporterer";
    const progress = (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("out_time_us=")) continue;
        const fraction = Math.min(
          1,
          Math.max(0, Number(line.slice(12)) / 1e6 / duration),
        );
        job.eta =
          fraction > 0
            ? (((Date.now() - began) / 1000) * (1 - fraction)) / fraction
            : job.eta;
        emit({ stage: job.status, filename, target, fraction, eta: job.eta });
      }
    };
    emit({ stage: job.status, filename, target, fraction: 0, eta: job.eta });
    job.args = await encode(job.args, branded, progress);
    if (job.args[job.args.indexOf("-c:v") + 1] === "copy") {
      job.status = "Kontrollerer videokopi";
      emit({ stage: job.status, filename, target, fraction: 0 });
      if (!(await verifyCopy(file, local, start, end, meta.fps, { signal }))) {
        job.status = "Omkoder for nøyaktige klippepunkter";
        began = Date.now();
        await run("ffmpeg", software(job.args, branded), { signal, progress });
      }
    }
    const output = await probe(local);
    if (
      Math.abs(output.duration - duration) > 1 / meta.fps ||
      output.video.width !== meta.video.width ||
      output.video.height !== meta.video.height ||
      Math.abs(output.fps - meta.fps) > 0.001
    )
      throw Error(
        "Eksporten har uventet varighet eller videoformat. Lokal fil er beholdt.",
      );
    job.status = "Kopierer";
    job.eta = null;
    emit({ stage: job.status, filename, target, fraction: 0 });
    await deliver(local, target, {
      signal,
      onProgress: (p) => {
        job.eta = p.eta;
        emit({ stage: job.status, filename, target, ...p });
      },
    });
    fs.unlinkSync(local);
    job.status = "Ferdig";
    job.eta = 0;
    emit({ stage: "Ferdig", filename, target, fraction: 1 });
  }
}
module.exports = {
  green,
  validateLogo,
  run,
  probe,
  detect,
  refine,
  bounds,
  safeName,
  render,
  copyEligible,
  verifyCopy,
  validateRecovery,
};

async function validateRecovery(local) {
  let job;
  try {
    job = JSON.parse(
      fs.readFileSync(path.join(path.dirname(local), "job.json"), "utf8"),
    );
  } catch {
    throw Error(
      "Velg en lokal eksport fra jobbmappen som ble oppgitt i feilmeldingen. Jobbinformasjon mangler.",
    );
  }
  const base = safeName(job.name);
  const names = [
    ...(job.branded ? [base + "_BRANDED.mov"] : []),
    ...(job.clean ? [base + ".mov"] : []),
  ];
  if (!names.includes(path.basename(local)))
    throw Error("Dette er ikke en ferdig eksport fra den valgte jobben.");
  const info = await probe(local),
    duration = Number(job.end) - Number(job.start);
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(info.duration) ||
    !Number.isFinite(info.fps) ||
    Math.abs(info.duration - duration) > 1 / info.fps ||
    !info.audio.length
  )
    throw Error(
      "Eksporten er ufullstendig og må rendres på nytt. Den lokale filen er beholdt.",
    );
  return info;
}

async function validateLogo(file) {
  const info = await probe(file);
  if (
    info.video.codec_name !== "png" ||
    !/rgba|bgra|argb|abgr|yuva|gbrap/.test(info.video.pix_fmt || "")
  )
    throw Error("Logoen må være en PNG med alfakanal.");
  const { out } = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      "alphaextract",
      "-frames:v",
      "1",
      "-pix_fmt",
      "gray",
      "-f",
      "rawvideo",
      "-",
    ],
    { binaryOutput: true },
  );
  if (!out.length || !out.some((alpha) => alpha < 255))
    throw Error("Logoen er heldekkende. Velg en transparent logo-overlay.");
  if (!out.some((alpha) => alpha > 0))
    throw Error(
      "Logoen er helt gjennomsiktig og inneholder ingen synlig grafikk.",
    );
  return info;
}
