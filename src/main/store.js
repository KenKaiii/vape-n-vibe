const Store = require("electron-store");

const store = new Store({
  defaults: {
    hotkey: "fn",
    cleanupEnabled: false,
  },
});

module.exports = store;
