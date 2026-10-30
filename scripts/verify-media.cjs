const { execFileSync } = require("node:child_process");
const { binary } = require("../lib/tools.cjs");
for (const tool of ["ffmpeg", "ffprobe"]) {
  const version = execFileSync(binary(tool), ["-version"], {
    encoding: "utf8",
  });
  if (!version.split("\n")[0].includes("7.1.2"))
    throw Error("Uventet medieverktøyversjon: " + tool);
  if (version.includes("--enable-nonfree"))
    throw Error("Kan ikke distribuere nonfree-build: " + tool);
  console.log(version.split("\n")[0]);
}
const encoders = execFileSync(binary("ffmpeg"), ["-encoders"], {
  encoding: "utf8",
});
for (const encoder of ["libx264", "pcm_s24le", "aac", "mjpeg", "png"]) {
  if (!encoders.includes(encoder)) throw Error("Mangler enkoder: " + encoder);
}
const filters = execFileSync(binary("ffmpeg"), ["-filters"], {
  encoding: "utf8",
});
for (const filter of ["overlay", "scale", "loudnorm", "alphaextract", "fps"]) {
  if (!filters.includes(filter)) throw Error("Mangler filter: " + filter);
}
