const ROOT = "https://github.com/tv12bedehuskanalen/bk-autotrim";
function releaseTag(url) {
  const parsed = new URL(url);
  if (parsed.origin !== "https://github.com")
    throw Error("Uventet adresse for oppdatering.");
  const prefix = "/tv12bedehuskanalen/bk-autotrim/releases/tag/";
  if (!parsed.pathname.startsWith(prefix))
    throw Error("Fant ingen gyldig utgivelse.");
  const tag = decodeURIComponent(parsed.pathname.slice(prefix.length));
  if (!/^v\d+\.\d+\.\d+$/.test(tag))
    throw Error("Utgivelsen har ugyldig versjonsnummer.");
  return tag;
}
function newer(tag, current) {
  const a = tag.replace(/^v/, "").split(".").map(Number),
    b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
function installer(tag, platform, arch) {
  if (!["x64", "arm64"].includes(arch))
    throw Error("Denne prosessortypen støttes ikke.");
  const ext =
    platform === "darwin" ? "dmg" : platform === "win32" ? "exe" : null;
  if (!ext) throw Error("Oppdateringer støttes bare på Mac og Windows.");
  const name = `BK-Autotrim-${tag.slice(1)}-${platform}-${arch}.${ext}`;
  return { name, url: `${ROOT}/releases/download/${tag}/${name}` };
}
async function check(current, { fetcher = fetch } = {}) {
  const response = await fetcher(`${ROOT}/releases/latest`, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 404)
    return { message: "Ingen utgivelser tilgjengelig ennå.", available: false };
  if (!response.ok)
    throw Error(`Kunne ikke hente oppdateringer (HTTP ${response.status}).`);
  const tag = releaseTag(response.url);
  return {
    tag,
    available: newer(tag, current),
    message: newer(tag, current)
      ? `Ny versjon tilgjengelig: ${tag}`
      : "Du har nyeste versjon.",
    url: `${ROOT}/releases/tag/${tag}`,
  };
}
module.exports = { releaseTag, newer, installer, check };

async function checksum(tag, name, { fetcher = fetch } = {}) {
  const response = await fetcher(
    `${ROOT}/releases/download/${tag}/SHA256SUMS`,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw Error("Utgivelsen mangler kontrollsummer.");
  const line = (await response.text())
    .split("\n")
    .find((line) => line.trim().split(/\s+/).at(-1) === name);
  const hash = line?.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(hash || ""))
    throw Error("Fant ingen kontrollsum for installasjonen.");
  return hash;
}
module.exports.checksum = checksum;
