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
    lang: "en",
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
    name: "Qwen3-0.6B-Q4_K_M",
    file: "Qwen3-0.6B-Q4_K_M.gguf",
    url: "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf",
  },

  // Paths (resolved at runtime)
  paths: {
    models: path.join(__dirname, "..", "..", "models"),
    tmp: require("node:os").tmpdir(),
  },
};

// Resolved model path
defaults.model.path = path.join(defaults.paths.models, defaults.model.file);
defaults.llm.path = path.join(defaults.paths.models, defaults.llm.file);

module.exports = defaults;
