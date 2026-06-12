const path = require("node:path");

const defaults = {
  // Window
  window: {
    width: 400,
    height: 430,
  },

  // Model registry — every selectable transcription model.
  // Each entry lists its engine, downloadable files (url + sha256), and
  // optional subdirectory under the models dir.  resolveModelPaths()
  // fills in the absolute `path` of every file after app.whenReady().
  models: {
    "whisper-large-v3-turbo-q5": {
      engine: "whisper",
      label: "Whisper",
      lang: "auto",
      files: [
        {
          file: "ggml-large-v3-turbo-q5_0.bin",
          url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
          sha256:
            "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
        },
      ],
    },
    "parakeet-tdt-0.6b-v3-int8": {
      engine: "parakeet",
      label: "Parakeet",
      dir: "parakeet-tdt-0.6b-v3-int8",
      // Supported languages per the nvidia/parakeet-tdt-0.6b-v3 model card
      // (auto language detection — no per-language prompting needed).
      languages: [
        "bg",
        "hr",
        "cs",
        "da",
        "nl",
        "en",
        "et",
        "fi",
        "fr",
        "de",
        "el",
        "hu",
        "it",
        "lv",
        "lt",
        "mt",
        "pl",
        "pt",
        "ro",
        "sk",
        "sl",
        "es",
        "sv",
        "ru",
        "uk",
      ],
      files: [
        {
          file: "encoder.int8.onnx",
          url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/encoder.int8.onnx",
          sha256:
            "acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247",
        },
        {
          file: "decoder.int8.onnx",
          url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/decoder.int8.onnx",
          sha256:
            "179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e",
        },
        {
          file: "joiner.int8.onnx",
          url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/joiner.int8.onnx",
          sha256:
            "3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3",
        },
        {
          file: "tokens.txt",
          url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/tokens.txt",
          sha256:
            "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
        },
      ],
    },
  },

  defaultModel: "whisper-large-v3-turbo-q5",

  // Recording
  recording: {
    muteWhileRecording: true,
  },

  // Dictionary — built-in words to bias Whisper decoder
  dictionary: {
    builtIn: [
      "Anthropic",
      "Claude",
      "OpenAI",
      "ChatGPT",
      "GPT-4",
      "LLaMA",
      "Mistral",
      "GitHub",
      "Copilot",
      "VSCode",
      "TypeScript",
      "JavaScript",
      "Node.js",
      "React",
      "Next.js",
      "PostgreSQL",
      "MongoDB",
      "GraphQL",
      "OAuth",
      "Kubernetes",
      "Docker",
      "Terraform",
      "AWS",
      "Vercel",
      "Supabase",
      "Firebase",
      "Tailwind",
      "Webpack",
      "Vite",
      "ESLint",
      "Prettier",
      "macOS",
      "iOS",
      "Linux",
      "Ubuntu",
      "Wi-Fi",
      "Bluetooth",
      "API",
      "SDK",
      "CLI",
      "UI",
      "UX",
      "URL",
      "JSON",
      "YAML",
      "HTML",
      "CSS",
      "MCP",
      "Grep",
    ],
  },

  // Hotkey — fn on macOS, Ctrl+Space on Windows/Linux
  hotkey: process.platform === "darwin" ? "fn" : "Ctrl+Space",

  // Paths — resolved lazily via resolveModelPaths() after app.whenReady()
  paths: {
    models: null,
    tmp: require("node:os").tmpdir(),
  },

  /** Look up a model by key, falling back to the default model. */
  getModel(key) {
    return defaults.models[key] || defaults.models[defaults.defaultModel];
  },

  /** Find the first registry entry for an engine: { key, model } or null. */
  getModelByEngine(engine) {
    const entry = Object.entries(defaults.models).find(
      ([, m]) => m.engine === engine,
    );
    return entry ? { key: entry[0], model: entry[1] } : null;
  },

  // Call once inside app.whenReady() before accessing model paths
  resolveModelPaths() {
    const { getModelsDir } = require("./paths");
    defaults.paths.models = getModelsDir();
    for (const model of Object.values(defaults.models)) {
      const base = model.dir
        ? path.join(defaults.paths.models, model.dir)
        : defaults.paths.models;
      for (const f of model.files) {
        f.path = path.join(base, f.file);
      }
    }
  },
};

module.exports = defaults;
