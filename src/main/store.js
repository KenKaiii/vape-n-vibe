const electronStore = require("electron-store");

const defaults = require("../config/defaults");

const Store = electronStore.default || electronStore;

const store = new Store({
  projectName: "vape-n-vibe",
  defaults: {
    hotkey: defaults.hotkey,
    language: "auto",
    dictionaryWords: [],
  },
});

module.exports = store;
