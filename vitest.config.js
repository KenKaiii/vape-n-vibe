import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      electron: path.resolve(__dirname, "__mocks__/electron.js"),
      "uiohook-napi": path.resolve(__dirname, "__mocks__/uiohook-napi.js"),
    },
  },
  test: {
    globals: false,
    restoreMocks: true,
  },
});
