const Store = require("electron-store");

const store = new Store({
  defaults: {
    hotkey: "fn",
    language: "auto",
    cleanupEnabled: false,
  },
});

module.exports = store;
