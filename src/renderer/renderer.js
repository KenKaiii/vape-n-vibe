window.addEventListener("DOMContentLoaded", async () => {
  const config = await window.vapenvibe.getConfig();

  const shortcutEl = document.getElementById("shortcut");
  const changeBtn = document.getElementById("change-hotkey");
  const modelInfo = document.getElementById("model-info");
  const tooltipWhisper = document.getElementById("tooltip-whisper");
  const tooltipLlm = document.getElementById("tooltip-llm");
  const downloadBtn = document.getElementById("download-btn");
  const downloadProgress = document.getElementById("download-progress");
  const cleanupToggle = document.getElementById("cleanup-toggle");
  const micSelect = document.getElementById("mic-select");

  // --- Hotkey display ---
  shortcutEl.textContent = config.hotkey;

  // --- Cleanup toggle state ---
  let cleanupEnabled = config.cleanupEnabled;

  function updateCleanupUI() {
    cleanupToggle.classList.toggle("active", cleanupEnabled);
  }

  updateCleanupUI();

  cleanupToggle.addEventListener("click", async () => {
    cleanupEnabled = !cleanupEnabled;
    await window.vapenvibe.toggleCleanup(cleanupEnabled);
    updateCleanupUI();
  });

  // --- Model state ---
  let modelsReady = config.modelExists && config.llmModelExists;

  function updateFooter() {
    if (modelsReady) {
      tooltipWhisper.textContent = "Whisper: " + config.model;
      tooltipLlm.textContent = "LLM: " + config.llmModel;
      modelInfo.classList.remove("hidden");
      downloadBtn.classList.add("hidden");
    } else {
      modelInfo.classList.add("hidden");
      downloadBtn.classList.remove("hidden");
    }
  }

  updateFooter();

  // --- Downloads ---
  downloadBtn.addEventListener("click", async () => {
    downloadBtn.classList.add("hidden");
    downloadProgress.classList.remove("hidden");
    downloadProgress.textContent = "Downloading\u2026 0%";
    await window.vapenvibe.startDownloads();
  });

  window.vapenvibe.onDownloadsProgress((pct) => {
    downloadProgress.textContent = `Downloading\u2026 ${pct}%`;
  });

  window.vapenvibe.onDownloadsComplete(() => {
    downloadProgress.classList.add("hidden");
    modelsReady = true;
    updateFooter();
  });

  window.vapenvibe.onDownloadsError((msg) => {
    downloadProgress.classList.add("hidden");
    downloadBtn.classList.remove("hidden");
    downloadBtn.textContent = "Retry download";
    console.error("Download error:", msg);
  });

  // --- Audio recording (push-to-talk) ---
  let audioContext = null;
  let processor = null;
  let analyser = null;
  let freqData = null;
  let vizInterval = null;
  let stream = null;
  let audioChunks = [];
  let isRecording = false;

  async function startRecording() {
    if (isRecording) return;
    isRecording = true;
    audioChunks = [];
    shortcutEl.classList.add("recording");

    const deviceId = micSelect.value;
    audioContext = new AudioContext({ sampleRate: 16000 });
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId, channelCount: 1, sampleRate: 16000 },
    });
    const source = audioContext.createMediaStreamSource(stream);

    // Set up analyser for overlay visualizer
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);

    // Stream frequency data to overlay at ~30fps
    vizInterval = setInterval(() => {
      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        window.vapenvibe.sendVizFreq(Array.from(freqData));
      }
    }, 33);

    processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (isRecording) {
        audioChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  }

  async function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    shortcutEl.classList.remove("recording");

    if (vizInterval) {
      clearInterval(vizInterval);
      vizInterval = null;
    }

    if (processor) processor.disconnect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    analyser = null;
    freqData = null;
    if (audioContext) await audioContext.close();

    if (audioChunks.length === 0) return;

    const length = audioChunks.reduce((sum, c) => sum + c.length, 0);
    const pcm = new Float32Array(length);
    let offset = 0;
    for (const chunk of audioChunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    audioChunks = [];

    const wavBuffer = encodeWav(pcm, 16000);
    await window.vapenvibe.sendAudio(wavBuffer);
  }

  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return buffer;
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // Listen for push-to-talk from main process
  window.vapenvibe.onRecordingToggle(async (on) => {
    if (on) {
      await startRecording();
    } else {
      await stopRecording();
    }
  });

  // Transcription status indicator
  window.vapenvibe.onTranscriptionStatus((status) => {
    if (status === "transcribing") {
      shortcutEl.textContent = "Transcribing\u2026";
      shortcutEl.classList.add("listening");
    } else if (status === "cleaning") {
      shortcutEl.textContent = "Cleaning\u2026";
      shortcutEl.classList.add("listening");
    } else {
      shortcutEl.textContent = config.hotkey;
      shortcutEl.classList.remove("listening");
    }
  });

  // --- Hotkey rebinding ---
  let listening = false;
  const heldKeys = new Set();
  const resetFnBtn = document.getElementById("reset-fn");

  function updateFnButton() {
    resetFnBtn.classList.toggle("hidden", config.hotkey === "fn");
  }

  updateFnButton();

  function stopListening() {
    listening = false;
    heldKeys.clear();
    shortcutEl.classList.remove("listening");
    changeBtn.classList.remove("invisible");
    updateFnButton();
  }

  async function saveHotkey(hotkey) {
    await window.vapenvibe.setHotkey(hotkey);
    config.hotkey = hotkey;
    shortcutEl.textContent = hotkey;
    stopListening();
  }

  changeBtn.addEventListener("click", () => {
    if (listening) return;
    listening = true;
    heldKeys.clear();
    shortcutEl.textContent = "Press keys\u2026";
    shortcutEl.classList.add("listening");
    changeBtn.classList.add("invisible");
    resetFnBtn.classList.remove("hidden");
  });

  resetFnBtn.addEventListener("click", async () => {
    await saveHotkey("fn");
  });

  document.addEventListener("keydown", (e) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      shortcutEl.textContent = config.hotkey;
      stopListening();
      return;
    }

    heldKeys.add(e.key);
    shortcutEl.textContent = formatKeys(heldKeys) || "Press keys\u2026";
  });

  document.addEventListener("keyup", async (e) => {
    if (!listening) return;
    e.preventDefault();

    if (heldKeys.size === 0) return;

    const hotkey = formatKeys(heldKeys);
    heldKeys.clear();

    if (!hotkey) return;

    await saveHotkey(hotkey);
  });

  function formatKeys(keys) {
    const parts = [];
    const mods = [];
    for (const k of keys) {
      if (k === "Control") mods.push("Ctrl");
      else if (k === "Alt") mods.push("Alt");
      else if (k === "Shift") mods.push("Shift");
      else if (k === "Meta") mods.push("Cmd");
      else parts.push(k.length === 1 ? k.toUpperCase() : k);
    }
    return [...mods, ...parts].join("+");
  }

  // --- Accessibility permission ---
  const accessStatus = document.getElementById("access-status");
  const grantAccessBtn = document.getElementById("grant-access-btn");

  function updateAccessUI(granted) {
    if (granted) {
      accessStatus.textContent = "Granted";
      accessStatus.classList.add("granted");
      grantAccessBtn.classList.add("hidden");
    } else {
      accessStatus.textContent = "Required";
      accessStatus.classList.remove("granted");
      grantAccessBtn.classList.remove("hidden");
    }
  }

  updateAccessUI(config.accessibilityGranted);

  grantAccessBtn.addEventListener("click", async () => {
    await window.vapenvibe.requestAccessibility();
    grantAccessBtn.textContent = "Waiting…";
    // Poll for permission grant (user must toggle in System Settings)
    const poll = setInterval(async () => {
      const granted = await window.vapenvibe.checkAccessibility();
      if (granted) {
        clearInterval(poll);
        updateAccessUI(true);
      }
    }, 2000);
  });

  // --- Microphone dropdown ---
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");

    micSelect.innerHTML = "";
    mics.forEach((mic, i) => {
      const option = document.createElement("option");
      option.value = mic.deviceId;
      option.textContent = mic.label || `Microphone ${i + 1}`;
      if (mic.deviceId === "default" || i === 0) option.selected = true;
      micSelect.appendChild(option);
    });
  } catch {
    micSelect.innerHTML = '<option value="default">No mic access</option>';
  }
});
