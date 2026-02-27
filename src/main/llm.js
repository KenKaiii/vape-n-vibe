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

  let context;
  try {
    context = await model.createContext();
    const { LlamaChatSession } = await getLlamaCpp();
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt:
        "You are a text processing function. You receive raw text and return cleaned text. " +
        "You are NOT a chatbot. You do NOT converse. You do NOT offer options. " +
        "You do NOT explain your changes. You do NOT ask questions. " +
        "You output exactly one thing: the cleaned text. Nothing else.",
    });

    const wrappedPrompt =
      "INPUT:\n" +
      rawText +
      "\n\n" +
      "TASK: Output a single cleaned version of the INPUT. Apply these rules:\n" +
      "- Remove filler words (um, uh, like, you know, so, err), stutters, false starts, and self-corrections.\n" +
      "- Fix grammar, spelling, and punctuation.\n" +
      "- Preserve the speaker's exact word choice, tone, and level of formality. Do not rephrase or elevate their language.\n" +
      "- Do not condense or summarize. Keep the speaker's full expression.\n" +
      "- Do not add any information the speaker did not say.\n" +
      "- Do not wrap output in quotes.\n\n" +
      "OUTPUT:\n";

    const cleaned = await session.prompt(wrappedPrompt);
    return cleaned.trim() || rawText;
  } catch {
    return rawText;
  } finally {
    if (context) context.dispose();
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
