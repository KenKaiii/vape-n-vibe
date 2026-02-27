const path = require("node:path");

const defaults = {
  // Window
  window: {
    width: 400,
    height: 400,
  },

  // Model
  model: {
    name: "whisper-large-v3-turbo-q5",
    file: "ggml-large-v3-turbo-q5_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    sha256: null,
    lang: "auto",
    threads: 4,
  },

  // Recording
  recording: {
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    muteWhileRecording: true,
  },

  // Hotkey
  hotkey: "fn",

  // Paste method — uses CMD+V on mac, CTRL+V on windows/linux
  paste: {
    darwin: "Command+V",
    win32: "Control+V",
    linux: "Control+V",
  },

  // LLM (text cleanup)
  llm: {
    name: "gemma-3-1b-it-Q4_K_M",
    file: "gemma-3-1b-it-Q4_K_M.gguf",
    url: "https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf",
    sha256: null,
  },

  // Paths — resolved lazily via resolveModelPaths() after app.whenReady()
  paths: {
    models: null,
    tmp: require("node:os").tmpdir(),
  },

  // Call once inside app.whenReady() before accessing model paths
  resolveModelPaths() {
    const { getModelsDir } = require("./paths");
    defaults.paths.models = getModelsDir();
    defaults.model.path = path.join(defaults.paths.models, defaults.model.file);
    defaults.llm.path = path.join(defaults.paths.models, defaults.llm.file);
  },
};

module.exports = defaults;
