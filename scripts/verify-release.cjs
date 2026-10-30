const version = require("../package.json").version;
const tag = process.env.GITHUB_REF_NAME || process.argv[2];
if (!tag || tag !== `v${version}`) {
  console.error(
    `Utgivelsestaggen ${tag || "(mangler)"} stemmer ikke med package.json: v${version}`,
  );
  process.exit(1);
}
console.log(`Versjon kontrollert: ${tag}`);
