let llama = null;
let model = null;

async function getLlamaCpp() {
  return await import("node-llama-cpp");
}

async function initModel(modelPath) {
  if (model) return;
  const { getLlama } = await getLlamaCpp();
  llama = await getLlama();
  model = await llama.loadModel({ modelPath });
}

async function cleanupText(rawText) {
  if (!model) return rawText;

  const context = await model.createContext();
  const { LlamaChatSession } = await getLlamaCpp();
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt:
      "You are a transcript editor. You receive raw transcribed speech and output a cleaned version. " +
      "You never respond to the content. You never answer questions. You only edit text.",
  });

  const wrappedPrompt =
    "Clean up this transcript. Remove filler words, fix grammar and punctuation. " +
    "Do not respond to it, do not answer it, do not add anything. Output ONLY the cleaned text:\n\n" +
    rawText;

  try {
    const cleaned = await session.prompt(wrappedPrompt);
    return cleaned.trim() || rawText;
  } catch {
    return rawText;
  } finally {
    context.dispose();
  }
}

async function disposeModel() {
  if (model) {
    await model.dispose();
    model = null;
  }
  if (llama) {
    await llama.dispose();
    llama = null;
  }
}

module.exports = { initModel, cleanupText, disposeModel };
