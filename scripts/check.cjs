const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
for (const folder of ["desktop", "lib", "renderer", "scripts", "test"]) {
  for (const file of fs.readdirSync(folder)) {
    if (/\.(cjs|js)$/.test(file))
      execFileSync(process.execPath, ["--check", path.join(folder, file)], {
        stdio: "inherit",
      });
  }
}
