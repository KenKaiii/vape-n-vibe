window.addEventListener("DOMContentLoaded", async () => {
  const config = await window.vapenvibe.getConfig();
  document.documentElement.classList.toggle(
    "platform-macos",
    config.platform === "darwin",
  );

  const shortcutEl = document.getElementById("shortcut");
  const changeBtn = document.getElementById("change-hotkey");
  const holdStatus = document.getElementById("hold-status");
  const modelStatus = document.getElementById("model-status");
  const downloadBtn = document.getElementById("download-btn");
  const downloadBar = document.getElementById("download-bar");
  const micSelect = document.getElementById("mic-select");
  const langSelect = document.getElementById("lang-select");
  const modelSelect = document.getElementById("model-select");
  // Words are a Whisper spelling prompt; other engines only use corrections.
  const dictionarySections = document.getElementById("dictionary-sections");
  const updateBtn = document.getElementById("update-btn");
  const versionBadge = document.getElementById("version-badge");
  const restartBtn = document.getElementById("restart-btn");

  // --- Input modality ---
  // Focus rings show only for keyboard navigation. A click, tap or a native
  // dropdown closing never leaves one behind (see styles.css).
  const NAV_KEYS = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Enter",
    " ",
  ]);
  function setInputMode(mode) {
    if (document.documentElement.dataset.input !== mode) {
      document.documentElement.dataset.input = mode;
    }
  }
  document.addEventListener("pointerdown", () => setInputMode("pointer"), {
    capture: true,
  });
  document.addEventListener(
    "keydown",
    (e) => {
      // Editing keys in a text field are typing, not navigation.
      const typing = e.target instanceof HTMLInputElement;
      if (e.key === "Tab" || (!typing && NAV_KEYS.has(e.key))) {
        setInputMode("keyboard");
      }
    },
    { capture: true },
  );

  // --- Motion helpers ---
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /**
   * Play an element's ".closing" (or other) animation, then run done().
   * A timer backs up animationend so state never gets stuck.
   */
  function afterAnimation(el, className, done, fallbackMs = 260) {
    if (reducedMotion.matches) {
      done();
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.removeEventListener("animationend", onEnd);
      el.classList.remove(className);
      done();
    };
    const onEnd = (e) => {
      if (e.target === el) finish();
    };
    el.addEventListener("animationend", onEnd);
    el.classList.add(className);
    setTimeout(finish, fallbackMs);
  }

  /** Hide with the element's closing animation; no-op if already closed. */
  function hideAnimated(el, onHidden) {
    if (el.classList.contains("hidden") || el.classList.contains("closing")) {
      return;
    }
    afterAnimation(el, "closing", () => {
      el.classList.add("hidden");
      if (onHidden) onHidden();
    });
  }

  function showAnimated(el) {
    el.classList.remove("closing");
    el.classList.remove("hidden");
  }

  // --- Hamburger menu / view states ---
  const menuBtn = document.getElementById("menu-btn");
  const menuDropdown = document.getElementById("menu-dropdown");
  const menuPermissions = document.getElementById("menu-permissions");
  const logo = document.getElementById("logo");
  const backBtn = document.getElementById("back-btn");
  const mainView = document.getElementById("main-view");
  const permissionsView = document.getElementById("permissions-view");

  function isMenuOpen() {
    return (
      !menuDropdown.classList.contains("hidden") &&
      !menuDropdown.classList.contains("closing")
    );
  }

  function closeMenuDropdown() {
    menuBtn.setAttribute("aria-expanded", "false");
    hideAnimated(menuDropdown);
  }

  function showMainView() {
    mainView.classList.remove("hidden");
    permissionsView.classList.add("hidden");
    logo.classList.remove("hidden");
    backBtn.classList.add("hidden");
    versionBadge.classList.remove("hidden");
  }

  function showPermissionsView() {
    mainView.classList.add("hidden");
    permissionsView.classList.remove("hidden");
    logo.classList.add("hidden");
    backBtn.classList.remove("hidden");
    versionBadge.classList.add("hidden");
    closeMenuDropdown();
  }

  function toggleMenuDropdown() {
    if (isMenuOpen()) {
      closeMenuDropdown();
      return;
    }
    showAnimated(menuDropdown);
    menuBtn.setAttribute("aria-expanded", "true");
    menuPermissions.focus();
  }

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenuDropdown();
  });

  menuPermissions.addEventListener("click", showPermissionsView);

  backBtn.addEventListener("click", showMainView);

  document.addEventListener("click", (e) => {
    if (
      isMenuOpen() &&
      !menuDropdown.contains(e.target) &&
      e.target !== menuBtn
    ) {
      closeMenuDropdown();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMenuOpen()) {
      closeMenuDropdown();
      menuBtn.focus();
    }
  });

  // --- Language selector ---
  langSelect.value = config.language;
  langSelect.addEventListener("change", async () => {
    const res = await window.vapenvibe.setLanguage(langSelect.value);
    if (res && res.parakeetUnsupported) {
      console.warn(
        "[renderer] Language unsupported by Parakeet — Whisper will be used",
      );
    }
    if (res && res.appleUnsupported) {
      console.warn(
        "[renderer] Language unsupported by Apple — Whisper will be used",
      );
    }
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
  const modelList = config.models || [];
  let selectedModel = config.selectedModel || config.model;
  let modelsReady = config.modelExists;

  function getSelectedModelMeta() {
    return modelList.find((m) => m.key === selectedModel) || null;
  }

  function engineName() {
    const meta = getSelectedModelMeta();
    return meta ? meta.label : "Whisper";
  }

  function wordsApply() {
    const meta = getSelectedModelMeta();
    return !meta || meta.engine === "whisper";
  }

  function updateDictionaryHint() {
    dictionarySections.classList.toggle("hidden", !wordsApply());
  }

  function setDownloadActionLabel(label) {
    downloadBtn.setAttribute("aria-label", label);
    downloadBtn.title = label;
  }

  function updateFooter() {
    modelSelect.title = `${engineName()}: ${selectedModel}`;
    modelStatus.textContent = modelsReady ? "Ready" : "Not downloaded";
    downloadBtn.classList.toggle("hidden", modelsReady);
    if (!modelsReady) setDownloadActionLabel(`Download ${engineName()}`);
  }

  function showDownloadProgress(pct) {
    downloadBtn.classList.add("hidden");
    modelStatus.textContent = `Downloading\u2026 ${pct}%`;
    downloadBar.style.setProperty("--p", `${pct}%`);
    downloadBar.classList.remove("hidden");
  }

  function showDownloadFailed() {
    downloadBar.classList.add("hidden");
    updateFooter();
    modelStatus.textContent = "Download failed";
    setDownloadActionLabel(`Retry ${engineName()} download`);
  }

  // --- Model selector ---
  modelSelect.innerHTML = "";
  modelList.forEach((m) => {
    const option = document.createElement("option");
    option.value = m.key;
    option.textContent = m.label;
    if (m.key === selectedModel) option.selected = true;
    modelSelect.appendChild(option);
  });

  modelSelect.addEventListener("change", async () => {
    const key = modelSelect.value;
    const res = await window.vapenvibe.setModel(key);
    if (!res || res.ok !== true) {
      modelSelect.value = selectedModel;
      return;
    }
    selectedModel = key;
    modelsReady = res.downloaded;
    const meta = getSelectedModelMeta();
    if (meta) meta.downloaded = res.downloaded;
    updateFooter();
    updateDictionaryHint();
    updateDictionarySummary();
  });

  updateFooter();
  updateDictionaryHint();

  // --- Downloads ---
  downloadBtn.addEventListener("click", async () => {
    downloadBtn.classList.add("hidden");
    showDownloadProgress(0);
    try {
      await window.vapenvibe.startDownloads(selectedModel);
    } catch (err) {
      console.error("[renderer] Download failed:", err);
      showDownloadFailed();
    }
  });

  window.vapenvibe.onDownloadsProgress((pct) => {
    showDownloadProgress(pct);
  });

  window.vapenvibe.onDownloadsComplete(() => {
    downloadBar.classList.add("hidden");
    modelsReady = true;
    const meta = getSelectedModelMeta();
    if (meta) meta.downloaded = true;
    updateFooter();
    showRestartBtn();
  });

  window.vapenvibe.onDownloadsError((msg) => {
    showDownloadFailed();
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
  const dictionaryError = document.getElementById("dictionary-error");
  const dictionaryPanel = dictionaryModal.querySelector("[role='dialog']");
  let dictionaryWords = [];
  // The entry just added, so only it animates in when the list re-renders.
  let justAddedWord = null;
  let justAddedRule = null;

  function updateDictionaryCount() {
    updateDictionarySummary();
  }

  const svgNs = "http://www.w3.org/2000/svg";

  /** Icon-only remove button with an accessible name. */
  function createRemoveButton(label, onRemove) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "remove-btn";
    btn.setAttribute("aria-label", label);
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("class", "ic");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(svgNs, "use");
    use.setAttribute("href", "#i-x");
    svg.appendChild(use);
    btn.appendChild(svg);
    btn.addEventListener("click", () => {
      const item = btn.closest("li");
      btn.disabled = true;
      afterAnimation(item, "is-leaving", onRemove, 200);
    });
    return btn;
  }

  function renderEmptyList(list, text) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = text;
    list.appendChild(li);
  }

  /** After removing an item, keep keyboard focus inside the list. */
  function focusAfterRemove(list, index, fallback) {
    const buttons = list.querySelectorAll(".remove-btn");
    const next = buttons[Math.min(index, buttons.length - 1)];
    (next || fallback).focus();
  }

  function renderDictionaryList() {
    updateDictionaryCount();
    dictionaryList.innerHTML = "";
    if (dictionaryWords.length === 0) {
      renderEmptyList(dictionaryList, "No words yet");
      return;
    }
    const added = justAddedWord;
    justAddedWord = null;
    dictionaryWords.forEach((word, i) => {
      const chip = document.createElement("li");
      chip.className = word === added ? "chip is-new" : "chip";
      const span = document.createElement("span");
      span.className = "chip-text";
      span.textContent = word;
      const del = createRemoveButton(`Remove ${word}`, () => {
        dictionaryWords.splice(i, 1);
        window.vapenvibe.setDictionary(dictionaryWords);
        renderDictionaryList();
        focusAfterRemove(dictionaryList, i, dictionaryInput);
      });
      chip.append(span, del);
      dictionaryList.appendChild(chip);
    });
  }

  function setDictionaryError(message) {
    dictionaryError.textContent = message;
    dictionaryInput.setAttribute("aria-invalid", String(Boolean(message)));
  }

  function addDictionaryWord() {
    const word = dictionaryInput.value.trim();
    if (!word) {
      setDictionaryError("");
      return;
    }
    if (/[\s,]/.test(word)) {
      setDictionaryError("One word at a time, without spaces or commas.");
      return;
    }
    if (dictionaryWords.includes(word)) {
      setDictionaryError(`${word} is already in the dictionary.`);
      return;
    }
    setDictionaryError("");
    dictionaryWords.push(word);
    justAddedWord = word;
    window.vapenvibe.setDictionary(dictionaryWords);
    dictionaryInput.value = "";
    renderDictionaryList();
  }

  function isDictionaryOpen() {
    return (
      !dictionaryModal.classList.contains("hidden") &&
      !dictionaryModal.classList.contains("closing")
    );
  }

  function closeDictionary() {
    if (!isDictionaryOpen()) return;
    setDictionaryError("");
    hideAnimated(dictionaryModal);
    dictionaryBtn.focus();
  }

  // Keep Tab inside the open dictionary.
  function trapDictionaryFocus(e) {
    const focusable = Array.from(
      dictionaryPanel.querySelectorAll("button, input"),
    ).filter(
      (el) => !el.disabled && el.offsetParent !== null && el.tabIndex >= 0,
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener("keydown", (e) => {
    if (!isDictionaryOpen()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeDictionary();
    } else if (e.key === "Tab") {
      trapDictionaryFocus(e);
    }
  });

  // Clicking the dimmed backdrop closes the dictionary.
  dictionaryModal.addEventListener("click", (e) => {
    if (e.target === dictionaryModal) closeDictionary();
  });

  // Load count on startup
  window.vapenvibe
    .getDictionary()
    .then((words) => {
      dictionaryWords = words || [];
      updateDictionaryCount();
    })
    .catch((err) => {
      console.error("[renderer] Failed to load dictionary:", err);
    });

  dictionaryBtn.addEventListener("click", async () => {
    dictionaryWords = (await window.vapenvibe.getDictionary()) || [];
    corrections = (await window.vapenvibe.getCorrections()) || [];
    renderDictionaryList();
    renderCorrectionList();
    // Grow the card out of the row it was opened from.
    const anchor = dictionaryBtn.closest(".row").getBoundingClientRect();
    dictionaryModal.style.setProperty(
      "--anchor-right",
      `${window.innerWidth - anchor.right}px`,
    );
    dictionaryModal.style.setProperty(
      "--anchor-bottom",
      `${window.innerHeight - anchor.bottom}px`,
    );
    showAnimated(dictionaryModal);
    selectDictionaryTab(wordsApply() ? 0 : 1);
  });

  dictionaryClose.addEventListener("click", closeDictionary);

  dictionaryAddBtn.addEventListener("click", addDictionaryWord);
  dictionaryInput.addEventListener("input", () => setDictionaryError(""));

  dictionaryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDictionaryWord();
    }
    if (e.key === " " || e.key === ",") {
      e.preventDefault();
    }
  });

  // --- Dictionary tabs (Words / Corrections) ---
  const dictionaryTabs = [
    {
      tab: document.getElementById("dictionary-tab-words"),
      panel: document.getElementById("dictionary-words-panel"),
      focus: dictionaryInput,
    },
    {
      tab: document.getElementById("dictionary-tab-corrections"),
      panel: document.getElementById("dictionary-corrections-panel"),
      focus: document.getElementById("correction-from"),
    },
  ];

  function selectDictionaryTab(index, { focusTab = false } = {}) {
    dictionaryTabs.forEach(({ tab, panel }, i) => {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.classList.toggle("hidden", !selected);
    });
    dictionarySections.style.setProperty("--seg-index", String(index));
    if (focusTab) dictionaryTabs[index].tab.focus();
    else dictionaryTabs[index].focus.focus();
  }

  dictionaryTabs.forEach(({ tab }, i) => {
    tab.addEventListener("click", () => selectDictionaryTab(i));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      const next = (i + step + dictionaryTabs.length) % dictionaryTabs.length;
      selectDictionaryTab(next, { focusTab: true });
    });
  });

  // --- Corrections (find-and-replace, every engine) ---
  const correctionFrom = document.getElementById("correction-from");
  const correctionTo = document.getElementById("correction-to");
  const correctionAddBtn = document.getElementById("correction-add-btn");
  const correctionList = document.getElementById("correction-list");
  const correctionsNote = document.getElementById("corrections-note");
  const correctionsCount = document.getElementById("corrections-count");
  let corrections = [];

  if (config.builtInCorrections > 0) {
    const builtIn = document.getElementById("corrections-builtin");
    builtIn.textContent = `+${config.builtInCorrections} built in`;
    builtIn.title =
      "Common AI and developer terms (OpenAI, MCP, Docker\u2026) are fixed automatically. Your rules take priority.";
    correctionsNote.textContent = "Works with every engine";
  }

  function updateDictionarySummary() {
    const w = dictionaryWords.length;
    const c = corrections.length;
    const words = `${w} word${w === 1 ? "" : "s"}`;
    const rules =
      c > 0 ? `${c} correction${c === 1 ? "" : "s"}` : "No corrections";
    if (wordsApply()) {
      dictionaryCount.textContent = w > 0 ? words : "No words";
      correctionsCount.textContent = c > 0 ? rules : "";
    } else {
      // Only corrections apply to this engine.
      dictionaryCount.textContent = rules;
      correctionsCount.textContent = "";
    }
  }

  async function saveCorrections() {
    await window.vapenvibe.setCorrections(corrections);
    // Read back the stored, validated rules so the list matches them.
    corrections = (await window.vapenvibe.getCorrections()) || [];
    renderCorrectionList();
  }

  function renderCorrectionList() {
    updateDictionarySummary();
    correctionList.innerHTML = "";
    if (corrections.length === 0) {
      renderEmptyList(correctionList, "No corrections yet");
      return;
    }
    const added = justAddedRule;
    justAddedRule = null;
    corrections.forEach((rule, i) => {
      const row = document.createElement("li");
      row.className =
        added && rule.from.toLowerCase() === added ? "rule is-new" : "rule";
      const from = document.createElement("span");
      from.className = "rule-from";
      from.textContent = rule.from;
      from.title = rule.from;
      const arrow = document.createElementNS(svgNs, "svg");
      arrow.setAttribute("class", "ic");
      arrow.setAttribute("aria-hidden", "true");
      const arrowUse = document.createElementNS(svgNs, "use");
      arrowUse.setAttribute("href", "#i-arrow");
      arrow.appendChild(arrowUse);
      const to = document.createElement("span");
      to.className = "rule-to";
      to.title = rule.to;
      const said = document.createElement("span");
      said.className = "sr-only";
      said.textContent = " becomes ";
      to.append(said, rule.to);
      const del = createRemoveButton(
        `Remove correction for ${rule.from}`,
        async () => {
          corrections.splice(i, 1);
          await saveCorrections();
          focusAfterRemove(correctionList, i, correctionFrom);
        },
      );
      row.append(from, arrow, to, del);
      correctionList.appendChild(row);
    });
  }

  function addCorrection() {
    const from = correctionFrom.value.trim();
    const to = correctionTo.value.trim();
    if (!from) {
      correctionFrom.focus();
      return;
    }
    if (!to) {
      correctionTo.focus();
      return;
    }
    // Same "heard as" phrase replaces the earlier rule.
    corrections = corrections.filter(
      (r) => r.from.toLowerCase() !== from.toLowerCase(),
    );
    corrections.unshift({ from, to });
    justAddedRule = from.toLowerCase();
    correctionFrom.value = "";
    correctionTo.value = "";
    correctionFrom.focus();
    saveCorrections();
  }

  correctionAddBtn.addEventListener("click", addCorrection);
  [correctionFrom, correctionTo].forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addCorrection();
      }
    });
  });

  window.vapenvibe
    .getCorrections()
    .then((rules) => {
      corrections = rules || [];
      updateDictionarySummary();
    })
    .catch((err) => {
      console.error("[renderer] Failed to load corrections:", err);
    });

  // --- Hero state (orb + status line) ---
  // "Transcribing" starts the moment the key is released, so the orb never
  // drops back to rest during the stop tail and upload.
  const hero = { recording: false, transcribing: false };

  function refreshHero() {
    const mood = hero.recording
      ? "recording"
      : hero.transcribing
        ? "processing"
        : "idle";
    const state = listening ? "listening" : mood;
    const labels = {
      listening: "Press a new shortcut",
      recording: "Listening",
      processing: "Transcribing\u2026",
      idle: "Hold to talk",
    };
    document.body.dataset.state = state;
    if (holdStatus.textContent !== labels[state]) {
      holdStatus.textContent = labels[state];
      // Restart the swap animation so each new status settles in.
      holdStatus.classList.remove("swap");
      void holdStatus.offsetWidth;
      holdStatus.classList.add("swap");
    }
    window.vaperHero.setMood(mood);
  }

  // --- Audio recording (push-to-talk) ---
  let audioContext = null;
  let processor = null;
  let source = null;
  let analyser = null;
  let freqData = null;
  let vizInterval = null;
  let partialInterval = null;
  let streamInterval = null;
  // Live-preview window size in seconds — partials transcribe only the
  // most recent slice so preview cost stays constant regardless of
  // total recording length.
  const PARTIAL_WINDOW_S = 15;
  // Keep capturing this long after the hotkey is released so the last
  // word isn't clipped.
  const STOP_TAIL_MS = 250;
  // Keep the mic open this long after a dictation so the next one starts
  // instantly and includes the audio from just before the key press
  // (see PREROLL_S in audio-worklet-processor.js).
  const MIC_WARM_MS = 30000;
  // How often audio is forwarded to a live (Apple) transcription stream.
  const STREAM_FLUSH_MS = 100;
  let stream = null;
  let streamDeviceId = null;
  let micCloseTimer = null;
  let audioChunks = [];
  let streamSentIdx = 0;
  let isRecording = false;
  let capturing = false;
  let streaming = false;

  async function createAudioContext() {
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule("audio-worklet-processor.js");
    return ctx;
  }

  async function ensureAudioContext() {
    // A cached context can end up "closed" (Chromium audio service
    // crash, device wedge) — resume() then throws InvalidStateError on
    // every subsequent recording attempt, permanently. Rebuild instead.
    if (audioContext && audioContext.state === "closed") {
      audioContext = null;
    }
    if (!audioContext) {
      audioContext = await createAudioContext();
    }
    if (audioContext.state !== "running") {
      try {
        await audioContext.resume();
      } catch {
        // resume() failed — context is wedged. Rebuild once from scratch.
        try {
          await audioContext.close();
        } catch {
          // already closed
        }
        audioContext = await createAudioContext();
        await audioContext.resume();
      }
    }
  }

  function clearCaptureTimers() {
    if (partialInterval) {
      clearInterval(partialInterval);
      partialInterval = null;
    }
    if (vizInterval) {
      clearInterval(vizInterval);
      vizInterval = null;
    }
    if (streamInterval) {
      clearInterval(streamInterval);
      streamInterval = null;
    }
  }

  // Tear down all recording resources (stream, nodes, intervals) and
  // close the mic. Safe to call even if some resources are null.
  async function teardownRecording() {
    clearCaptureTimers();
    clearTimeout(micCloseTimer);
    micCloseTimer = null;
    capturing = false;
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
    streamDeviceId = null;
    analyser = null;
    freqData = null;
    if (audioContext) {
      try {
        await audioContext.suspend();
      } catch {
        // suspend() throws on a closed context — if teardown is running
        // from the error path, the context may already be dead. Never
        // let that mask the original failure or skip sendRecordingError.
      }
    }
  }

  // Stop capturing but keep the mic open for MIC_WARM_MS so the next
  // dictation starts instantly. The close goes through the recording
  // queue so it can never interleave with a start/stop.
  function pauseCapture() {
    clearCaptureTimers();
    capturing = false;
    if (processor) processor.port.postMessage("stop");
    clearTimeout(micCloseTimer);
    micCloseTimer = setTimeout(() => {
      micCloseTimer = null;
      recordingOp = recordingOp
        .then(() => (isRecording ? undefined : teardownRecording()))
        .catch((err) => {
          console.error("[renderer] Mic close failed:", err);
        });
    }, MIC_WARM_MS);
  }

  function micIsWarm(deviceId) {
    return (
      stream !== null &&
      processor !== null &&
      streamDeviceId === deviceId &&
      stream.getAudioTracks().some((t) => t.readyState === "live")
    );
  }

  async function openMic(deviceId) {
    // Echo cancellation and noise suppression stay off: Chromium's
    // call-oriented processing reshapes speech in ways that hurt
    // recognition. Auto gain stays ON: without it, quiet mics (some
    // MacBook built-ins peak around -50 dB) fall below
    // SILENCE_RMS_THRESHOLD and every recording is skipped as silent.
    // The warm mic window and pre-roll buffer limit the gain ramp-up.
    const audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
      channelCount: 1,
    };
    if (deviceId) audio.deviceId = deviceId;

    await ensureAudioContext();
    stream = await navigator.mediaDevices.getUserMedia({ audio });
    streamDeviceId = deviceId;
    source = audioContext.createMediaStreamSource(stream);

    // Analyser for the overlay visualizer
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);

    processor = new AudioWorkletNode(audioContext, "recorder-processor");
    processor.port.onmessage = (e) => {
      if (capturing) audioChunks.push(e.data);
    };
    source.connect(processor);
  }

  // Forward audio captured since the last flush to the live stream.
  function flushAudioStream() {
    if (!streaming || streamSentIdx >= audioChunks.length) return;
    let total = 0;
    for (let i = streamSentIdx; i < audioChunks.length; i++) {
      total += audioChunks[i].length;
    }
    const pcm = new Int16Array(total);
    let off = 0;
    for (let i = streamSentIdx; i < audioChunks.length; i++) {
      const chunk = audioChunks[i];
      for (let j = 0; j < chunk.length; j++) {
        const s = Math.max(-1, Math.min(1, chunk[j]));
        pcm[off++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    }
    streamSentIdx = audioChunks.length;
    window.vapenvibe.sendAudioStreamChunk(pcm.buffer);
  }

  // Send a sliding window of recent audio for live transcription
  // preview (engines without live streaming).  Re-transcribing the
  // *entire* accumulated buffer each tick is quadratic in recording
  // length (a 2-minute recording would decode ~1 hour of audio in
  // total) — whisper.cpp's own stream example uses a fixed ~10s window
  // for exactly this reason. The preview shows only recent speech
  // (live-caption style); the final paste on stop still transcribes the
  // full recording.
  function sendPartialWindow() {
    if (audioChunks.length === 0) return;
    const maxSamples = 16000 * PARTIAL_WINDOW_S;
    // Walk chunks from the tail until we have enough samples.
    let take = 0;
    let firstChunk = audioChunks.length;
    while (firstChunk > 0 && take < maxSamples) {
      firstChunk--;
      take += audioChunks[firstChunk].length;
    }
    const pcm = new Float32Array(Math.min(take, maxSamples));
    let off = pcm.length;
    for (let i = audioChunks.length - 1; i >= firstChunk && off > 0; i--) {
      const chunk = audioChunks[i];
      const copyLen = Math.min(chunk.length, off);
      pcm.set(chunk.subarray(chunk.length - copyLen), off - copyLen);
      off -= copyLen;
    }
    const wavBuf = encodeWav(pcm, 16000);
    window.vapenvibe.sendPartialAudio(wavBuf);
  }

  async function startRecording() {
    if (isRecording) return;
    isRecording = true;
    audioChunks = [];
    streamSentIdx = 0;
    streaming = false;
    hero.recording = true;
    refreshHero();
    clearTimeout(micCloseTimer);
    micCloseTimer = null;

    const deviceId = micSelect.value;
    try {
      if (micIsWarm(deviceId)) {
        await ensureAudioContext();
      } else {
        await teardownRecording();
        await openMic(deviceId);
      }
    } catch (err) {
      isRecording = false;
      hero.recording = false;
      refreshHero();
      throw err;
    }

    // The worklet sends its pre-press buffer first, then live audio.
    capturing = true;
    processor.port.postMessage("start");

    // Stream frequency data to overlay at ~30fps
    vizInterval = setInterval(() => {
      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        window.vapenvibe.sendVizFreq(new Uint8Array(freqData));
        window.vaperHero.setFreq(freqData);
      }
    }, 33);

    // Apple engine: stream audio for live transcription. Other engines:
    // periodic sliding-window previews every 2s.
    let res = null;
    try {
      res = await window.vapenvibe.startAudioStream();
    } catch (err) {
      console.warn("[renderer] Live stream unavailable:", err);
    }
    if (res && res.streaming) {
      streaming = true;
      streamInterval = setInterval(flushAudioStream, STREAM_FLUSH_MS);
    } else {
      partialInterval = setInterval(sendPartialWindow, 2000);
    }
  }

  async function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    hero.recording = false;
    hero.transcribing = true;
    refreshHero();
    window.vaperHero.setFreq(null);

    // Keep listening a moment so the last word isn't clipped.
    await new Promise((resolve) => setTimeout(resolve, STOP_TAIL_MS));
    flushAudioStream();
    streaming = false;
    pauseCapture();

    if (audioChunks.length === 0) {
      // The mic delivered nothing — report it so it shows in the log
      // instead of the dictation silently vanishing.
      hero.transcribing = false;
      refreshHero();
      window.vapenvibe.sendRecordingError("no audio captured from the mic");
      return;
    }

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
    // The pipeline has finished (pasted, skipped as silent, or failed).
    hero.transcribing = false;
    refreshHero();
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

  // Serialize all start/stop operations through a promise chain.
  // Without this, rapid taps fire multiple concurrent async callbacks
  // whose shared state (isRecording, stream, processor…) interleaves
  // unpredictably — e.g. startRecording₂ clobbers stopRecording₁'s
  // cleanup, leaving resources permanently leaked.
  let recordingOp = Promise.resolve();

  // Listen for push-to-talk from main process
  window.vapenvibe.onRecordingToggle((on) => {
    recordingOp = recordingOp
      .then(async () => {
        if (on) {
          await startRecording();
        } else {
          await stopRecording();
        }
      })
      .catch(async (err) => {
        console.error(
          `[renderer] Recording error: ${err.name}: ${err.message}`,
        );
        isRecording = false;
        hero.recording = false;
        hero.transcribing = false;
        refreshHero();
        window.vaperHero.setFreq(null);
        await teardownRecording();
        // Include error details — the renderer console isn't visible in
        // the main process log, so this is the only diagnosable trace.
        window.vapenvibe.sendRecordingError(`${err.name}: ${err.message}`);
      });
  });

  // Transcription status indicator
  window.vapenvibe.onTranscriptionStatus((status) => {
    hero.transcribing = status === "transcribing";
    refreshHero();
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
  refreshHero();

  function stopListening() {
    listening = false;
    heldKeys.clear();
    changeBtn.classList.remove("invisible");
    updateFnButton();
    refreshHero();
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
    shortcutEl.textContent = "\u2026";
    changeBtn.classList.add("invisible");
    resetFnBtn.classList.remove("hidden");
    refreshHero();
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
    shortcutEl.textContent = displayHotkey(formatKeys(heldKeys)) || "\u2026";
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

  // --- Microphone permission (macOS only) ---
  const micPermStatus = document.getElementById("mic-perm-status");
  const grantMicBtn = document.getElementById("grant-mic-btn");
  const micPermMessage = document.getElementById("mic-perm-message");
  const micPermSetting = document.getElementById("mic-perm-setting");

  function updateMicUI(granted) {
    if (granted) {
      micPermStatus.classList.remove("hidden");
      grantMicBtn.classList.add("hidden");
      micPermMessage.classList.add("hidden");
    } else {
      micPermStatus.classList.add("hidden");
      grantMicBtn.classList.remove("hidden");
      micPermMessage.classList.add("hidden");
    }
  }

  if (config.platform !== "darwin") {
    micPermSetting.classList.add("hidden");
  } else {
    updateMicUI(config.microphoneGranted);
  }

  let micPoll = null;

  function stopMicPoll() {
    if (micPoll) {
      clearInterval(micPoll);
      micPoll = null;
    }
  }

  function setMicButtonState(state, message) {
    if (state === "granted") {
      grantMicBtn.classList.add("hidden");
      micPermStatus.classList.remove("hidden");
      micPermMessage.classList.add("hidden");
      grantMicBtn.disabled = false;
      grantMicBtn.textContent = "Grant";
      return;
    }

    grantMicBtn.classList.remove("hidden");
    micPermStatus.classList.add("hidden");
    grantMicBtn.disabled = state === "waiting";
    grantMicBtn.textContent = state === "waiting" ? "Waiting…" : "Grant";

    if (message) {
      micPermMessage.textContent = message;
      micPermMessage.classList.remove("hidden");
    } else {
      micPermMessage.classList.add("hidden");
    }
  }

  async function checkAndUpdateMic() {
    const granted = await window.vapenvibe.checkMicrophone();
    if (granted) {
      stopMicPoll();
      setMicButtonState("granted");
      return true;
    }
    return false;
  }

  grantMicBtn.addEventListener("click", async () => {
    if (grantMicBtn.disabled) return;
    setMicButtonState("waiting");

    try {
      // Use the standard Web API to trigger the macOS permission dialog from
      // a user gesture. askForMediaAccess via IPC is unreliable in dev.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await populateMicDropdown();
      setMicButtonState("granted");
    } catch {
      // Dialog dismissed or access denied.
      const granted = await checkAndUpdateMic();
      if (granted) return;

      setMicButtonState(
        "grant",
        `Access denied. Run: ${config.micResetCommand}`,
      );

      // Poll briefly in case the user grants via System Settings while this
      // window is open.
      stopMicPoll();
      micPoll = setInterval(checkAndUpdateMic, 2000);
      setTimeout(() => {
        stopMicPoll();
        if (micPermStatus.classList.contains("hidden")) {
          setMicButtonState("grant");
        }
      }, 30000);
    }
  });

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
      if (micPoll) {
        clearInterval(micPoll);
        micPoll = null;
      }
      if (accessPoll) {
        clearInterval(accessPoll);
        accessPoll = null;
      }
      if (sePoll) {
        clearInterval(sePoll);
        sePoll = null;
      }
    }
  });

  // --- Microphone dropdown ---
  async function populateMicDropdown() {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      tempStream.getTracks().forEach((t) => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");

      const current = micSelect.value;
      micSelect.innerHTML = "";
      mics.forEach((mic, i) => {
        const option = document.createElement("option");
        option.value = mic.deviceId;
        option.textContent = mic.label || `Microphone ${i + 1}`;
        if (mic.deviceId === current || (i === 0 && !current)) {
          option.selected = true;
        }
        micSelect.appendChild(option);
      });
    } catch {
      micSelect.innerHTML = '<option value="">No mic access</option>';
    }
  }

  await populateMicDropdown();
});
