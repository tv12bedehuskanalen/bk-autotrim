const fs = require("node:fs");
const { pipeline } = require("node:stream/promises");
async function checkSpace(directory, bytes) {
  const stats = await fs.promises.statfs(directory);
  if (Number(stats.bavail) * Number(stats.bsize) < bytes) {
    throw Error(
      `For lite ledig plass i ${directory}. Trenger omtrent ${Math.ceil(bytes / 1e9)} GB.`,
    );
  }
}
async function deliver(local, target, { signal, onProgress = () => {} } = {}) {
  const partial = target + ".partial";
  const size = (await fs.promises.stat(local)).size;
  await checkSpace(require("node:path").dirname(target), size);
  signal?.throwIfAborted();
  if (fs.existsSync(target)) throw Error("Målfilen finnes allerede: " + target);
  let owned = false;
  try {
    const handle = await fs.promises.open(partial, "wx");
    owned = true;
    const output = handle.createWriteStream();
    let copied = 0;
    const began = Date.now();
    const input = fs.createReadStream(local);
    input.on("data", (data) => {
      copied += data.length;
      onProgress({
        fraction: copied / size,
        eta: copied
          ? (((Date.now() - began) / 1000) * (size - copied)) / copied
          : null,
      });
    });
    await pipeline(input, output, { signal });
    if ((await fs.promises.stat(partial)).size !== size)
      throw Error("Kopien har feil størrelse.");
    signal?.throwIfAborted();
    // The exclusive partial file serializes deliveries from app instances.
    if (fs.existsSync(target))
      throw Error("Målfilen finnes allerede: " + target);
    await fs.promises.rename(partial, target);
  } catch (error) {
    if (owned) await fs.promises.rm(partial, { force: true }).catch(() => {});
    throw error;
  }
}
module.exports = { checkSpace, deliver };
