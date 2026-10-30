const fs = require("node:fs");
const { installer } = require("../lib/updates.cjs");
const version = require("../package.json").version;
const expected = installer(
  `v${version}`,
  process.argv[2],
  process.argv[3],
).name;
if (!fs.existsSync(`dist/${expected}`))
  throw Error("Mangler forventet installasjon: " + expected);
console.log("Kontrollert:", expected);
