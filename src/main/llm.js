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
      "Clean up this transcribed speech. Remove filler words (um, uh, like, you know, " +
      "basically, actually, literally, sort of, kind of), false starts, and repetitions. " +
      "Fix grammar, punctuation, and capitalization. Keep the original meaning and tone. " +
      "Output only the cleaned text.",
  });

  try {
    const cleaned = await session.prompt(rawText);
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
