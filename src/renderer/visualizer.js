const canvas = document.getElementById("viz");
const ctx = canvas.getContext("2d");
const partialTextEl = document.getElementById("partial-text");
const viewportWidth = canvas.width;
const viewportHeight = canvas.height;
const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const barCount = 9;

canvas.style.width = `${viewportWidth}px`;
canvas.style.height = `${viewportHeight}px`;
canvas.width = Math.round(viewportWidth * pixelRatio);
canvas.height = Math.round(viewportHeight * pixelRatio);
ctx.scale(pixelRatio, pixelRatio);

let mode = "idle";
let renderedMode = "recording";
let freqData = null;
let smoothBars = new Float32Array(barCount);
let fadeAlpha = 0;
let targetAlpha = 0;
let processingPhase = 0;
let previousFrameTime = 0;
let loopRunning = false;

function startLoop() {
  if (!loopRunning) {
    loopRunning = true;
    previousFrameTime = 0;
    requestAnimationFrame(draw);
  }
}

function draw(timestamp) {
  const deltaTime = previousFrameTime
    ? Math.min(timestamp - previousFrameTime, 32)
    : 16.67;
  previousFrameTime = timestamp;

  const fadeEase = reducedMotion ? 1 : 1 - Math.pow(0.84, deltaTime / 16.67);
  fadeAlpha += (targetAlpha - fadeAlpha) * fadeEase;

  if (fadeAlpha < 0.01 && targetAlpha === 0) {
    fadeAlpha = 0;
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    loopRunning = false;
    return;
  }

  ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  ctx.globalAlpha = fadeAlpha;

  if (renderedMode === "recording") {
    drawRecordingSignal();
  } else if (renderedMode === "processing") {
    drawProcessingSignal(deltaTime, timestamp);
  }

  ctx.globalAlpha = 1;

  if (reducedMotion && targetAlpha === 1) {
    loopRunning = false;
    return;
  }
  requestAnimationFrame(draw);
}

function drawStatusDot(color, alpha = 1) {
  ctx.beginPath();
  ctx.arc(16, viewportHeight / 2, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = fadeAlpha * alpha;
  ctx.fill();
  ctx.globalAlpha = fadeAlpha;
}

function readBarLevel(index) {
  if (!freqData || freqData.length === 0) return 0.08;

  const usableBins = Math.max(1, Math.floor(freqData.length * 0.45));
  const start = Math.floor((index / barCount) * usableBins);
  const end = Math.max(
    start + 1,
    Math.floor(((index + 1) / barCount) * usableBins),
  );
  let total = 0;
  for (let bin = start; bin < end; bin++) total += freqData[bin];
  const average = total / (end - start) / 255;

  return Math.min(1, Math.max(0, (average - 0.06) / 0.64));
}

function drawRecordingSignal() {
  const centerY = viewportHeight / 2;
  const barStartX = 38;
  let averageLevel = 0;

  for (let index = 0; index < barCount; index++) {
    const rawLevel = reducedMotion ? 0.2 : readBarLevel(index);
    const smoothing = rawLevel > smoothBars[index] ? 0.38 : 0.14;
    smoothBars[index] += (rawLevel - smoothBars[index]) * smoothing;
    averageLevel += smoothBars[index];

    const barHeight = 3 + smoothBars[index] * 15;
    const x = barStartX + index * 8;
    ctx.beginPath();
    ctx.moveTo(x, centerY - barHeight / 2);
    ctx.lineTo(x, centerY + barHeight / 2);
    ctx.strokeStyle = `rgba(255, 113, 107, ${0.58 + smoothBars[index] * 0.42})`;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  averageLevel /= barCount;
  drawStatusDot("#ff716b", 0.72 + averageLevel * 0.28);
}

function drawProcessingSignal(deltaTime, timestamp) {
  const centerY = viewportHeight / 2;
  const railStart = 34;
  const railEnd = 108;
  const railLength = railEnd - railStart;

  const pulseAlpha = reducedMotion
    ? 0.82
    : 0.76 + Math.sin(timestamp / 360) * 0.16;
  drawStatusDot("#b7f774", pulseAlpha);

  ctx.beginPath();
  ctx.moveTo(railStart, centerY);
  ctx.lineTo(railEnd, centerY);
  ctx.strokeStyle = "rgba(183, 247, 116, 0.18)";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.stroke();

  if (reducedMotion) {
    [0.34, 0.5, 0.66].forEach((position, index) => {
      const x = railStart + railLength * position;
      ctx.beginPath();
      ctx.moveTo(x - 3, centerY);
      ctx.lineTo(x + 3, centerY);
      ctx.strokeStyle = `rgba(183, 247, 116, ${0.38 + index * 0.2})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    return;
  }

  processingPhase = (processingPhase + deltaTime / 1050) % 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(railStart - 1, centerY - 6, railLength + 2, 12);
  ctx.clip();

  [0, 0.12, 0.24].forEach((trailOffset, index) => {
    const phase = (processingPhase - trailOffset + 1) % 1;
    const x = railStart + phase * railLength;
    ctx.beginPath();
    ctx.moveTo(x - 9, centerY);
    ctx.lineTo(x, centerY);
    ctx.strokeStyle = `rgba(183, 247, 116, ${[0.92, 0.44, 0.18][index]})`;
    ctx.lineWidth = index === 0 ? 2.5 : 2;
    ctx.lineCap = "round";
    ctx.stroke();
  });
  ctx.restore();
}

// --- IPC listeners via preload bridge ---
window.vizBridge.onVizMode((newMode) => {
  mode = newMode;
  if (mode === "idle") {
    targetAlpha = 0;
    canvas.classList.remove("visible");
    partialTextEl.textContent = "";
  } else {
    renderedMode = mode;
    targetAlpha = 1;
    canvas.classList.add("visible");
    if (mode === "processing") {
      processingPhase = 0;
      smoothBars.fill(0);
    }
  }
  startLoop();
});

window.vizBridge.onVizFreq((data) => {
  freqData = data;
});

window.vizBridge.onPartialText((text) => {
  partialTextEl.textContent = "";
  if (text) {
    // Isolate text direction without injecting transcription content as HTML.
    const isolatedText = document.createElement("bdi");
    isolatedText.textContent = text;
    partialTextEl.appendChild(isolatedText);
  }
});
