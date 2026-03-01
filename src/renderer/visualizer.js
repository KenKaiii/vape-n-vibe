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
let smokeTime = 0;
let loopRunning = false;

// --- Smoke particle system ---
const smokeParticles = [];
const MAX_SMOKE = 24;
const MARGIN = 6; // keep particles this far from canvas edge

function createSmokeParticle() {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * 2;
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 0.12,
    vy: -Math.random() * 0.25 - 0.1,
    size: Math.random() * 2 + 2,
    life: 1,
    decay: Math.random() * 0.018 + 0.016,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.02,
    growRate: Math.random() * 0.04 + 0.02,
  };
}

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
    drawSmoke();
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

function drawSmoke() {
  smokeTime += 0.016;

  // Emit new particles
  if (smokeParticles.length < MAX_SMOKE && Math.random() < 0.4) {
    smokeParticles.push(createSmokeParticle());
  }

  // Faint glow at center (warm white ember)
  const emberPulse = 0.25 + Math.sin(smokeTime * 2.5) * 0.1;
  const emberGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 6);
  emberGrad.addColorStop(0, `rgba(255, 255, 255, ${emberPulse})`);
  emberGrad.addColorStop(0.6, `rgba(200, 200, 200, ${emberPulse * 0.3})`);
  emberGrad.addColorStop(1, "transparent");
  ctx.fillStyle = emberGrad;
  ctx.fillRect(cx - 6, cy - 6, 12, 12);

  // Update and draw particles
  ctx.globalCompositeOperation = "lighter";
  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    const p = smokeParticles[i];

    // Turbulence — wispy sine-wave drift
    const turbX = Math.sin(p.y * 0.1 + smokeTime * 1.5) * 0.06;
    const turbY = Math.cos(p.x * 0.1 + smokeTime * 1.2) * 0.03;
    p.vx += turbX;
    p.vy += turbY - 0.003;

    // Damping
    p.vx *= 0.96;
    p.vy *= 0.96;

    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.rotSpeed;
    p.size += p.growRate;
    p.life -= p.decay;

    // Clamp to canvas bounds
    const r = p.size;
    p.x = Math.max(MARGIN + r, Math.min(canvas.width - MARGIN - r, p.x));
    p.y = Math.max(MARGIN + r, Math.min(canvas.height - MARGIN - r, p.y));

    if (p.life <= 0) {
      smokeParticles.splice(i, 1);
      continue;
    }

    // Fade curve: quick fade-in, slow fade-out
    const alpha =
      p.life < 0.3 ? p.life / 0.3 : Math.min(1, (1 - p.life) / 0.15);
    const radius = p.size;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);

    // Smoke gradient (white core → gray edge)
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    grad.addColorStop(0, `rgba(220, 220, 220, ${alpha * 0.4})`);
    grad.addColorStop(0.4, `rgba(160, 160, 160, ${alpha * 0.2})`);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";

  // Small center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(200, 200, 200, ${0.3 + Math.sin(smokeTime * 3) * 0.15})`;
  ctx.fill();
}

// --- IPC listeners via preload bridge ---
window.vizBridge.onVizMode((newMode) => {
  mode = newMode;
  if (newMode === "idle") {
    targetAlpha = 0;
  } else {
    targetAlpha = 1;
    if (newMode === "processing") {
      smoothBars.fill(0);
      smokeParticles.length = 0;
      smokeTime = 0;
    }
  }
  startLoop();
});

window.vizBridge.onVizFreq((data) => {
  freqData = data;
});

// Loop starts on first mode change via startLoop()
