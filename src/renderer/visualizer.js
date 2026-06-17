const canvas = document.getElementById("viz");
const ctx = canvas.getContext("2d");
const cx = canvas.width / 2;
const cy = canvas.height - 30;
const baseRadius = 16;
const barCount = 28;

let mode = "idle"; // "recording" | "processing" | "idle"
let freqData = null;
let smoothBars = new Float32Array(barCount);
let fadeAlpha = 0;
let targetAlpha = 0;
let loaderAngle = 0;
let loopRunning = false;

function startLoop() {
  if (!loopRunning) {
    loopRunning = true;
    requestAnimationFrame(draw);
  }
}

function draw() {
  // Smooth fade
  fadeAlpha += (targetAlpha - fadeAlpha) * 0.15;
  if (fadeAlpha < 0.01 && targetAlpha === 0) {
    fadeAlpha = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    loopRunning = false;
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = fadeAlpha;

  if (mode === "recording") {
    drawWaveform();
  } else if (mode === "processing") {
    drawLoader();
  }

  ctx.globalAlpha = 1;
  requestAnimationFrame(draw);
}

function drawWaveform() {
  const step = (Math.PI * 2) / barCount;
  const maxBarLen = 18;

  for (let i = 0; i < barCount; i++) {
    const binIndex = freqData
      ? Math.floor((i / barCount) * freqData.length * 0.6)
      : 0;
    const raw = freqData ? freqData[binIndex] / 255 : 0;

    smoothBars[i] += (raw - smoothBars[i]) * 0.3;
    const val = smoothBars[i];

    const angle = step * i - Math.PI / 2;
    const barLen = Math.max(3, val * maxBarLen);
    const x1 = cx + Math.cos(angle) * baseRadius;
    const y1 = cy + Math.sin(angle) * baseRadius;
    const x2 = cx + Math.cos(angle) * (baseRadius + barLen);
    const y2 = cy + Math.sin(angle) * (baseRadius + barLen);

    const alpha = 0.4 + val * 0.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(255, 68, 68, ${alpha})`;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Inner circle glow
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius - 2, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 68, 68, 0.25)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 68, 68, 0.6)";
  ctx.fill();
}

function drawLoader() {
  loaderAngle += 0.12;
  const radius = baseRadius + 4;
  const lineWidth = 3;

  // Outer rotating arc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, loaderAngle, loaderAngle + Math.PI * 1.3);
  ctx.strokeStyle = "rgba(255, 68, 68, 0.9)";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // Inner counter-rotating arc
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 6, -loaderAngle * 1.4, -loaderAngle * 1.4 + Math.PI);
  ctx.strokeStyle = "rgba(255, 68, 68, 0.45)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 68, 68, 0.7)";
  ctx.fill();
}

// --- Partial transcription text ---
const partialTextEl = document.getElementById("partial-text");

// --- IPC listeners via preload bridge ---
window.vizBridge.onVizMode((newMode) => {
  mode = newMode;
  if (newMode === "idle") {
    targetAlpha = 0;
    partialTextEl.textContent = "";
  } else {
    targetAlpha = 1;
    if (newMode === "processing") {
      smoothBars.fill(0);
      loaderAngle = 0;
    }
  }
  startLoop();
});

window.vizBridge.onVizFreq((data) => {
  freqData = data;
});

window.vizBridge.onPartialText((text) => {
  if (text) {
    // Wrap in <bdi> so RTL container direction doesn't reverse the text
    partialTextEl.innerHTML = `<bdi>${text}</bdi>`;
  } else {
    partialTextEl.textContent = "";
  }
});

// Loop starts on first mode change via startLoop()
