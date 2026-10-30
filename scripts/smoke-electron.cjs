const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
require("../desktop/main.cjs");
app.whenReady().then(async () => {
  const window = BrowserWindow.getAllWindows()[0];
  const errors = [];
  window.webContents.on("console-message", (_event, ...args) => {
    if (args[0] === 3) errors.push(args[1]);
  });
  window.webContents.once("did-finish-load", async () => {
    try {
      const state = await window.webContents.executeJavaScript(
        `(async()=>({title:document.title,buttons:document.querySelectorAll('button').length,defaults:await bk.defaults(),background:getComputedStyle(document.body).backgroundColor}))()`,
      );
      if (
        state.title !== "BK Autotrim" ||
        state.buttons < 15 ||
        !state.defaults.logo.endsWith("bk-logo.png")
      )
        throw Error("Ufullstendig grensesnitt");
      if (errors.length) throw Error(errors.join("\n"));
      const screenshot = path.join(os.tmpdir(), "bk-autotrim-window.png");
      fs.writeFileSync(
        screenshot,
        (await window.webContents.capturePage()).toPNG(),
      );
      console.log(JSON.stringify({ ...state, screenshot }));
      app.quit();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
