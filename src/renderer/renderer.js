window.addEventListener("DOMContentLoaded", async () => {
  // --- Logo smoke effect ---
  const smokeControl = initLogoSmoke();

  const config = await window.vapenvibe.getConfig();

  const shortcutEl = document.getElementById("shortcut");
  const changeBtn = document.getElementById("change-hotkey");
  const modelInfo = document.getElementById("model-info");
  const tooltipWhisper = document.getElementById("tooltip-whisper");
  const downloadBtn = document.getElementById("download-btn");
  const downloadProgress = document.getElementById("download-progress");
  const micSelect = document.getElementById("mic-select");
  const langSelect = document.getElementById("lang-select");
  const updateBtn = document.getElementById("update-btn");
  const versionBadge = document.getElementById("version-badge");
  const restartBtn = document.getElementById("restart-btn");

  // --- Language selector ---
  langSelect.value = config.language;
  langSelect.addEventListener("change", () => {
    window.vapenvibe.setLanguage(langSelect.value);
  });

  // --- Hotkey display ---
  shortcutEl.textContent = displayHotkey(config.hotkey);

  // --- Version badge ---
  versionBadge.textContent = `v${config.version}`;

  // --- Update button state machine ---
  let updateState = "idle";
  let revertTimer = null;

  function setUpdateState(state, version) {
    updateState = state;
    if (revertTimer) {
      clearTimeout(revertTimer);
      revertTimer = null;
    }
    updateBtn.classList.remove("highlight");
    updateBtn.disabled = false;

    switch (state) {
      case "idle":
        updateBtn.textContent = "Check for updates";
        break;
      case "checking":
        updateBtn.textContent = "Checking\u2026";
        updateBtn.disabled = true;
        break;
      case "available":
        updateBtn.textContent = `Download v${version}`;
        updateBtn.classList.add("highlight");
        break;
      case "up-to-date":
        updateBtn.textContent = "Up to date";
        updateBtn.disabled = true;
        revertTimer = setTimeout(() => setUpdateState("idle"), 5000);
        break;
      case "downloading":
        updateBtn.textContent = `Downloading\u2026 ${version}%`;
        updateBtn.disabled = true;
        break;
      case "downloaded":
        updateBtn.textContent = "Restart to update";
        updateBtn.classList.add("highlight");
        break;
      case "error":
        updateBtn.textContent = "Update failed";
        updateBtn.disabled = true;
        revertTimer = setTimeout(() => setUpdateState("idle"), 5000);
        break;
    }
  }

  updateBtn.addEventListener("click", () => {
    if (updateState === "idle") {
      window.vapenvibe.checkForUpdates();
    } else if (updateState === "available") {
      window.vapenvibe.downloadUpdate();
    } else if (updateState === "downloaded") {
      window.vapenvibe.installUpdate();
    }
  });

  window.vapenvibe.onUpdateStatus((data) => {
    if (data.state === "available") {
      setUpdateState("available", data.version);
    } else if (data.state === "downloading") {
      setUpdateState("downloading", data.percent);
    } else {
      setUpdateState(data.state);
    }
  });

  // --- Restart button ---
  function showRestartBtn() {
    restartBtn.classList.remove("hidden");
  }

  restartBtn.addEventListener("click", () => {
    window.vapenvibe.restartApp();
  });

  // --- Model state ---
  let modelsReady = config.modelExists;

  function updateFooter() {
    if (modelsReady) {
      tooltipWhisper.textContent = `Whisper: ${config.model}`;
      modelInfo.classList.remove("hidden");
      downloadBtn.classList.add("hidden");
    } else {
      downloadBtn.textContent = "Download Whisper model";
      tooltipWhisper.textContent = "Whisper: not downloaded";
      modelInfo.classList.remove("hidden");
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
    showRestartBtn();
  });

  window.vapenvibe.onDownloadsError((msg) => {
    downloadProgress.classList.add("hidden");
    downloadBtn.classList.remove("hidden");
    downloadBtn.textContent = "Retry download";
    console.error("Download error:", msg);
  });

  // --- Dictionary modal ---
  const dictionaryBtn = document.getElementById("dictionary-btn");
  const dictionaryModal = document.getElementById("dictionary-modal");
  const dictionaryClose = document.getElementById("dictionary-close");
  const dictionaryInput = document.getElementById("dictionary-input");
  const dictionaryAddBtn = document.getElementById("dictionary-add-btn");
  const dictionaryList = document.getElementById("dictionary-list");
  const dictionaryCount = document.getElementById("dictionary-count");
  let dictionaryWords = [];

  function updateDictionaryCount() {
    const n = dictionaryWords.length;
    dictionaryCount.textContent = n > 0 ? `${n} word${n === 1 ? "" : "s"}` : "";
  }

  function renderDictionaryList() {
    updateDictionaryCount();
    dictionaryList.innerHTML = "";
    dictionaryWords.forEach((word, i) => {
      const row = document.createElement("div");
      row.className = "dictionary-row";
      const span = document.createElement("span");
      span.className = "dictionary-word";
      span.textContent = word;
      const del = document.createElement("button");
      del.className = "dictionary-delete-btn";
      del.textContent = "\u00d7";
      del.addEventListener("click", () => {
        dictionaryWords.splice(i, 1);
        window.vapenvibe.setDictionary(dictionaryWords);
        renderDictionaryList();
      });
      row.appendChild(span);
      row.appendChild(del);
      dictionaryList.appendChild(row);
    });
  }

  function addDictionaryWord() {
    const word = dictionaryInput.value.trim();
    if (!word || /[\s,]/.test(word) || dictionaryWords.includes(word)) {
      dictionaryInput.value = "";
      return;
    }
    dictionaryWords.push(word);
    window.vapenvibe.setDictionary(dictionaryWords);
    dictionaryInput.value = "";
    renderDictionaryList();
  }

  // Load count on startup
  window.vapenvibe.getDictionary().then((words) => {
    dictionaryWords = words || [];
    updateDictionaryCount();
  });

  dictionaryBtn.addEventListener("click", async () => {
    dictionaryWords = (await window.vapenvibe.getDictionary()) || [];
    renderDictionaryList();
    dictionaryModal.classList.remove("hidden");
    dictionaryInput.focus();
  });

  dictionaryClose.addEventListener("click", () => {
    dictionaryModal.classList.add("hidden");
  });

  dictionaryAddBtn.addEventListener("click", addDictionaryWord);

  dictionaryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDictionaryWord();
    }
    if (e.key === " " || e.key === ",") {
      e.preventDefault();
    }
  });

  // --- Audio recording (push-to-talk) ---
  let audioContext = null;
  let processor = null;
  let source = null;
  let analyser = null;
  let freqData = null;
  let vizInterval = null;
  let stream = null;
  let audioChunks = [];
  let isRecording = false;

  async function ensureAudioContext() {
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 16000 });
      await audioContext.audioWorklet.addModule("audio-worklet-processor.js");
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  }

  async function startRecording() {
    if (isRecording) return;
    isRecording = true;
    audioChunks = [];
    shortcutEl.classList.add("recording");

    const deviceId = micSelect.value;
    try {
      await ensureAudioContext();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId, channelCount: 1, sampleRate: 16000 },
      });
    } catch (err) {
      isRecording = false;
      shortcutEl.classList.remove("recording");
      throw err;
    }
    source = audioContext.createMediaStreamSource(stream);

    // Set up analyser for overlay visualizer
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);

    // Stream frequency data to overlay at ~30fps
    vizInterval = setInterval(() => {
      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        window.vapenvibe.sendVizFreq(new Uint8Array(freqData));
      }
    }, 33);

    processor = new AudioWorkletNode(audioContext, "recorder-processor");
    processor.port.onmessage = (e) => {
      if (isRecording) {
        audioChunks.push(e.data);
      }
    };
    processor.port.postMessage("start");

    source.connect(processor);
  }

  async function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    shortcutEl.classList.remove("recording");

    if (vizInterval) {
      clearInterval(vizInterval);
      vizInterval = null;
    }

    if (processor) {
      processor.port.postMessage("stop");
      processor.disconnect();
      processor = null;
    }
    if (source) {
      source.disconnect();
      source = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    analyser = null;
    freqData = null;
    if (audioContext) await audioContext.suspend();

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
    try {
      if (on) {
        await startRecording();
      } else {
        await stopRecording();
      }
    } catch (err) {
      console.error("[renderer] Recording error:", err);
      isRecording = false;
      shortcutEl.classList.remove("recording");
    }
  });

  // Transcription status indicator
  window.vapenvibe.onTranscriptionStatus((status) => {
    if (status === "transcribing") {
      shortcutEl.textContent = "Transcribing\u2026";
      shortcutEl.classList.add("listening");
    } else {
      shortcutEl.textContent = displayHotkey(config.hotkey);
      shortcutEl.classList.remove("listening");
    }
  });

  // --- Hotkey rebinding ---
  let listening = false;
  const heldKeys = new Set();
  const resetFnBtn = document.getElementById("reset-fn");

  function updateFnButton() {
    // fn key is macOS-only — always hide the reset button on other platforms
    if (config.platform !== "darwin") {
      resetFnBtn.classList.add("hidden");
      return;
    }
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

  function displayHotkey(hotkey) {
    if (hotkey === "fn") return "fn";
    if (config.platform !== "darwin") return hotkey;
    return hotkey.replace(/\bAlt\b/, "Option").replace(/\bCmd\b/, "\u2318");
  }

  async function saveHotkey(hotkey) {
    await window.vapenvibe.setHotkey(hotkey);
    config.hotkey = hotkey;
    shortcutEl.textContent = displayHotkey(hotkey);
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

  function physicalKey(e) {
    const code = e.code;
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    const codeMap = {
      Space: "Space",
      Enter: "Enter",
      Tab: "Tab",
      Backquote: "`",
      Minus: "-",
      Equal: "=",
      BracketLeft: "[",
      BracketRight: "]",
      Backslash: "\\",
      Semicolon: ";",
      Quote: "'",
      Comma: ",",
      Period: ".",
      Slash: "/",
    };
    if (codeMap[code]) return codeMap[code];
    if (code.startsWith("F") && code.length <= 3) return code;
    return code;
  }

  document.addEventListener("keydown", (e) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.code === "Escape") {
      shortcutEl.textContent = displayHotkey(config.hotkey);
      stopListening();
      return;
    }

    const MOD_KEYS = ["Control", "Alt", "Shift", "Meta"];
    const key = MOD_KEYS.includes(e.key) ? e.key : physicalKey(e);
    heldKeys.add(key);
    shortcutEl.textContent =
      displayHotkey(formatKeys(heldKeys)) || "Press keys\u2026";
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
      else if (k === "Meta")
        mods.push(config.platform === "win32" ? "Win" : "Cmd");
      else parts.push(k.length === 1 ? k.toUpperCase() : k);
    }
    return [...mods, ...parts].join("+");
  }

  // --- Accessibility permission ---
  const accessStatus = document.getElementById("access-status");
  const grantAccessBtn = document.getElementById("grant-access-btn");

  function updateAccessUI(granted) {
    if (granted) {
      accessStatus.classList.remove("hidden");
      grantAccessBtn.classList.add("hidden");
    } else {
      accessStatus.classList.add("hidden");
      grantAccessBtn.classList.remove("hidden");
    }
  }

  // Hide accessibility row on non-macOS platforms
  if (config.platform !== "darwin") {
    const accessRow = accessStatus.parentElement;
    if (accessRow) accessRow.classList.add("hidden");
  }

  updateAccessUI(config.accessibilityGranted);

  let accessPoll = null;
  grantAccessBtn.addEventListener("click", async () => {
    await window.vapenvibe.requestAccessibility();
    grantAccessBtn.textContent = "Waiting…";
    // Clear any existing poll before starting a new one
    if (accessPoll) clearInterval(accessPoll);
    // Poll for permission grant (user must toggle in System Settings)
    accessPoll = setInterval(async () => {
      const granted = await window.vapenvibe.checkAccessibility();
      if (granted) {
        clearInterval(accessPoll);
        accessPoll = null;
        updateAccessUI(true);
        showRestartBtn();
      }
    }, 2000);
  });

  // --- System Events permission (macOS only) ---
  const seStatus = document.getElementById("se-status");
  const grantSeBtn = document.getElementById("grant-se-btn");
  const seSetting = document.getElementById("system-events-setting");

  function updateSeUI(granted) {
    if (granted) {
      seStatus.classList.remove("hidden");
      grantSeBtn.classList.add("hidden");
    } else {
      seStatus.classList.add("hidden");
      grantSeBtn.classList.remove("hidden");
    }
  }

  if (config.platform !== "darwin") {
    seSetting.classList.add("hidden");
  } else {
    const seGranted = await window.vapenvibe.checkSystemEvents();
    updateSeUI(seGranted);
  }

  let sePoll = null;
  grantSeBtn.addEventListener("click", async () => {
    grantSeBtn.textContent = "Waiting…";
    await window.vapenvibe.requestSystemEvents();
    if (sePoll) clearInterval(sePoll);
    sePoll = setInterval(async () => {
      const granted = await window.vapenvibe.checkSystemEvents();
      if (granted) {
        clearInterval(sePoll);
        sePoll = null;
        updateSeUI(true);
      }
    }, 2000);
  });

  // --- Pause work when window is hidden ---
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      smokeControl.pause();
      if (accessPoll) {
        clearInterval(accessPoll);
        accessPoll = null;
      }
      if (sePoll) {
        clearInterval(sePoll);
        sePoll = null;
      }
    } else {
      smokeControl.resume();
    }
  });

  // --- Microphone dropdown ---
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    tempStream.getTracks().forEach((t) => t.stop());
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

// --- Logo smoke effect (SVG turbulence animation) ---
function initLogoSmoke() {
  const turb = document.getElementById("smoke-turbulence");
  let frame = 0;
  const rad = Math.PI / 180;
  let smokeRafId = null;

  function animateTurbulence() {
    frame += 0.15;
    const bfx = 0.02 + 0.004 * Math.cos(frame * rad);
    const bfy = 0.02 + 0.004 * Math.sin(frame * rad * 0.7);
    turb.setAttribute("baseFrequency", `${bfx} ${bfy}`);
    smokeRafId = requestAnimationFrame(animateTurbulence);
  }
  smokeRafId = requestAnimationFrame(animateTurbulence);

  return {
    pause() {
      if (smokeRafId !== null) {
        cancelAnimationFrame(smokeRafId);
        smokeRafId = null;
      }
    },
    resume() {
      if (smokeRafId === null) {
        smokeRafId = requestAnimationFrame(animateTurbulence);
      }
    },
  };
}
