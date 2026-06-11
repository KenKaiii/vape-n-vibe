const path = require("node:path");

const defaults = {
  // Window
  window: {
    width: 400,
    height: 430,
  },

  // Model
  model: {
    name: "whisper-large-v3-turbo-q5",
    file: "ggml-large-v3-turbo-q5_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    lang: "auto",
  },

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

  // Call once inside app.whenReady() before accessing model paths
  resolveModelPaths() {
    const { getModelsDir } = require("./paths");
    defaults.paths.models = getModelsDir();
    defaults.model.path = path.join(defaults.paths.models, defaults.model.file);
  },
};

module.exports = defaults;
