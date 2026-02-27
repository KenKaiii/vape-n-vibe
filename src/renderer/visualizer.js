const { ipcRenderer } = require("electron");

const canvas = document.getElementById("viz");
const ctx = canvas.getContext("2d");
const cx = canvas.width / 2;
const cy = canvas.height / 2;
const baseRadius = 16;
const barCount = 28;

let mode = "idle"; // "recording" | "processing" | "idle"
let freqData = null;
let smoothBars = new Float32Array(barCount);
let spinAngle = 0;
let frame = null;
let fadeAlpha = 0;
let targetAlpha = 0;

function draw() {
  // Smooth fade
  fadeAlpha += (targetAlpha - fadeAlpha) * 0.15;
  if (fadeAlpha < 0.01 && targetAlpha === 0) {
    fadeAlpha = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame = requestAnimationFrame(draw);
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = fadeAlpha;

  if (mode === "recording") {
    drawWaveform();
  } else if (mode === "processing") {
    drawSpinner();
  }

  ctx.globalAlpha = 1;
  frame = requestAnimationFrame(draw);
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

function drawSpinner() {
  spinAngle += 0.05;
  const arcLen = Math.PI * 1.3;

  // Faint full circle
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Main spinning arc
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius, spinAngle, spinAngle + arcLen);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();

  // Second arc (opposite side, shorter)
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    baseRadius,
    spinAngle + Math.PI,
    spinAngle + Math.PI + arcLen * 0.5,
  );
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fill();
}

// --- IPC listeners ---
ipcRenderer.on("viz-mode", (_e, newMode) => {
  mode = newMode;
  if (newMode === "idle") {
    targetAlpha = 0;
  } else {
    targetAlpha = 1;
    if (newMode === "processing") {
      smoothBars.fill(0);
    }
  }
});

ipcRenderer.on("viz-freq", (_e, data) => {
  freqData = data;
});

// Start render loop
frame = requestAnimationFrame(draw);
