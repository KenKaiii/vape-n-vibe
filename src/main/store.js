const Store = require("electron-store");

const defaults = require("../config/defaults");

const store = new Store({
  defaults: {
    hotkey: defaults.hotkey,
    language: "auto",
    cleanupEnabled: false,
  },
});

module.exports = store;
