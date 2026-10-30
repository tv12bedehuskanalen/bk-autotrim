const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const media = require("../../lib/media.cjs");
test(
  "bundled tools export exact frame boundaries, native clean chroma and original overlay",
  { timeout: 180000 },
  async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bk-export-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const source = path.join(directory, "source.mov");
    await media.run("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1920x1080:rate=50:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:sample_rate=48000:duration=3",
      "-vf",
      "format=yuv422p10le,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited",
      "-af",
      "volume=if(lt(t\\,1.22)\\,0.1\\,1):eval=frame",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "18",
      "-ac",
      "2",
      "-c:a",
      "pcm_s24le",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      "-color_range",
      "tv",
      source,
    ]);
    await media.validateLogo(path.join(__dirname, "../../assets/bk-logo.png"));
    await media.render(
      {
        file: source,
        start: 0.22,
        end: 1.22,
        folder: path.join(directory, "out"),
        name: "Test",
        logo: path.join(__dirname, "../../assets/bk-logo.png"),
        branded: true,
        clean: true,
        temp: path.join(directory, "temp"),
      },
      { onProgress: () => {} },
    );
    for (const branded of [true, false]) {
      const file = path.join(
        directory,
        "out",
        branded ? "Test_BRANDED.mov" : "Test.mov",
      );
      const meta = await media.probe(file);
      assert.equal(meta.fps, 50);
      assert.equal(meta.video.color_primaries, "bt709");
      assert.equal(meta.video.color_transfer, "bt709");
      assert.equal(meta.video.color_space, "bt709");
      assert.equal(meta.video.color_range, "tv");
      assert.equal(meta.video.width, 1920);
      assert.equal(meta.video.height, 1080);
      assert.equal(meta.video.pix_fmt, branded ? "yuv420p" : "yuv422p10le");
      assert.equal(meta.audio[0].codec_name, "pcm_s24le");
      assert.equal(meta.audio[0].sample_rate, "48000");
      const { out } = await media.run("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_read_frames",
        "-of",
        "json",
        file,
      ]);
      assert.equal(JSON.parse(out).streams[0].nb_read_frames, "50");
      assert.ok(Math.abs(meta.duration - 1) < 0.025);
      const measured = await media.run("ffmpeg", [
        "-hide_banner",
        "-i",
        file,
        "-vn",
        "-af",
        "loudnorm=I=-23:TP=-1:LRA=50:print_format=json",
        "-f",
        "null",
        "-",
      ]);
      const loudness = JSON.parse(
        measured.err.match(/\{\s*"input_i"[\s\S]*?\}/)[0],
      );
      assert.ok(
        Math.abs(Number(loudness.input_i) + 23) < 0.2,
        `Unexpected loudness: ${loudness.input_i}`,
      );
      assert.ok(Number(loudness.input_tp) <= -0.9);
      if (!branded) {
        const pixels = async (input, time) =>
          (
            await media.run(
              "ffmpeg",
              [
                "-v",
                "error",
                "-ss",
                String(time),
                "-i",
                input,
                "-frames:v",
                "1",
                "-vf",
                "scale=160:90",
                "-pix_fmt",
                "gray",
                "-f",
                "rawvideo",
                "-",
              ],
              { binaryOutput: true },
            )
          ).out;
        const error = (a, b) =>
          a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0) /
          a.length;
        for (const [sourceTime, outputTime, adjacent] of [
          [0.22, 0, 0.2],
          [1.2, 0.98, 1.22],
        ]) {
          const actual = await pixels(file, outputTime),
            expected = await pixels(source, sourceTime),
            wrong = await pixels(source, adjacent);
          assert.ok(
            error(actual, expected) < error(actual, wrong),
            "Encoded output is closer to an adjacent frame than the selected cut",
          );
        }
      }
    }
  },
);

test(
  "clean export copies eligible H.264 and proves decoded cut boundaries",
  { timeout: 120000 },
  async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bk-copy-video-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const source = path.join(directory, "source.mov");
    await media.run("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=50:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:sample_rate=48000:duration=3",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "1",
      "-ac",
      "2",
      "-c:a",
      "pcm_s24le",
      source,
    ]);
    assert.equal(await media.copyEligible(source, 0.22, 50), true);
    await media.render({
      file: source,
      start: 0.22,
      end: 1.22,
      folder: path.join(directory, "out"),
      name: "Copy",
      branded: false,
      clean: true,
      temp: path.join(directory, "temp"),
    });
    assert.equal(
      await media.verifyCopy(
        source,
        path.join(directory, "out", "Copy.mov"),
        0.22,
        1.22,
        50,
      ),
      true,
    );
  },
);

test(
  "opening marker scan stops at the first marker and refines its first frame",
  { timeout: 60000 },
  async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bk-markers-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, "markers.mov");
    await media.run("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=black:size=320x180:rate=50:duration=5,drawbox=color=0x00fd00:t=fill:enable='between(t,1,1.94)+between(t,3,3.94)'",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      file,
    ]);
    const coarse = await media.detect(file);
    assert.equal(coarse.length, 1);
    const markers = [];
    for (const candidate of coarse)
      markers.push(await media.refine(file, candidate, 50));
    assert.deepEqual(markers, [1]);
  },
);

test("reject opaque and invisible PNG overlays before export", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bk-alpha-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, opacity] of [
    ["opaque", 1],
    ["invisible", 0],
  ]) {
    const file = path.join(directory, name + ".png");
    await media.run("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=white@${opacity}:size=32x18,format=rgba`,
      "-frames:v",
      "1",
      file,
    ]);
    await assert.rejects(
      media.validateLogo(file),
      name === "opaque" ? /heldekkende/ : /gjennomsiktig/,
    );
  }
});

test("recovery rejects incomplete exports and benchmark files", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bk-recovery-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const local = path.join(directory, "Program.mov");
  await media.run("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=black:size=32x18:rate=50:duration=1",
    "-f",
    "lavfi",
    "-i",
    "sine=duration=1",
    "-c:v",
    "libx264",
    "-c:a",
    "pcm_s24le",
    local,
  ]);
  await assert.rejects(media.validateRecovery(local), /Jobbinformasjon/);
  const job = {
    name: "Program",
    start: 0,
    end: 2,
    clean: true,
    branded: false,
  };
  fs.writeFileSync(path.join(directory, "job.json"), JSON.stringify(job));
  await assert.rejects(media.validateRecovery(local), /ufullstendig/);
  job.end = 1;
  fs.writeFileSync(path.join(directory, "job.json"), JSON.stringify(job));
  assert.equal((await media.validateRecovery(local)).duration, 1);
  fs.copyFileSync(local, path.join(directory, "benchmark-Program.mov"));
  await assert.rejects(
    media.validateRecovery(path.join(directory, "benchmark-Program.mov")),
    /ikke en ferdig/,
  );
});
