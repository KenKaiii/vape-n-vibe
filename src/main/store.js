const electronStore = require("electron-store");

const defaults = require("../config/defaults");

const Store = electronStore.default || electronStore;

const store = new Store({
  projectName: "vape-n-vibe",
  defaults: {
    hotkey: defaults.hotkey,
    language: "auto",
    selectedModel: defaults.defaultModel,
    dictionaryWords: [],
  },
});

module.exports = store;
