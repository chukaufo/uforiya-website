const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d");

let stars = [];
let shootingStars = [];
let mouse = { x: -9999, y: -9999 };
let clicks = [];
let scrollY = 0;

/* The blackhole is anchored to the final CTA section above the footer.
   Its screen position is recalculated every frame from that element's
   bounding box, so it scrolls with the page while the canvas stays fixed. */
const blackhole = {
  x: 0,
  y: 0,
  radius: 30,
  pullRadius: 260,
  angle: 0,
  visible: false,
};

let bhAnchor = null;

const STAR_COUNT = 340;
const INTERACTION_RADIUS = 180;   // cursor field of influence
const LINK_RADIUS = 110;          // max distance for a constellation line
const SCATTER_RADIUS = 110;       // click scatter radius
const SCATTER_FORCE = 15;         // click impulse strength

/* Musical notes: a fixed slice of the field renders as glyphs instead of
   dots. Kept as a plain constant, no UI control. */
const NOTE_CHANCE = 0.10;
const NOTE_GLYPHS = ["\u266A", "\u266B"]; // ♪ eighth note, ♫ beamed eighth notes

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── Input ── */

window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

window.addEventListener("mouseleave", () => {
  mouse.x = -9999;
  mouse.y = -9999;
});

/* Touch drag moves the interaction point on mobile */
window.addEventListener("touchmove", (e) => {
  if (!e.touches.length) return;
  mouse.x = e.touches[0].clientX;
  mouse.y = e.touches[0].clientY;
}, { passive: true });

window.addEventListener("touchend", () => {
  mouse.x = -9999;
  mouse.y = -9999;
});

window.addEventListener("scroll", () => {
  scrollY = window.scrollY;
}, { passive: true });

/* A click scatters nearby stars and throws a shooting star */
function registerPulse(x, y) {
  clicks.push({ x, y, age: 0 });
  shootingStars.push(makeShootingStar(x, y));
}

window.addEventListener("click", (e) => registerPulse(e.clientX, e.clientY));

window.addEventListener("touchstart", (e) => {
  if (!e.touches.length) return;
  registerPulse(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

/* ── Setup ── */

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Scale the blackhole down on narrow screens so it stays in proportion
  const narrow = canvas.width < 700;
  blackhole.radius = narrow ? 20 : 30;
  blackhole.pullRadius = narrow ? 165 : 260;

  createStars();
  createNebulae();
}

function getStarColor() {
  const colors = [
    "255,255,255",
    "255,255,255",
    "255,255,255",
    "180,150,255",
    "0,240,255",
    "123,95,245",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function createStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const isBright = Math.random() < 0.18;
    const isNote = Math.random() < NOTE_CHANCE;
    const depth = Math.random() * 0.85 + 0.15;

    // Depth contrast is exaggerated versus a flat scatter: near stars (high
    // depth) run bigger and move more on scroll, far stars stay small and
    // nearly static, so the field reads with real perspective.
    const depthRadiusMul = 0.55 + depth * 1.1;
    const depthParallaxMul = 0.04 + depth * 0.32;

    const star = {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      baseX: 0,
      baseY: 0,
      vx: 0,
      vy: 0,
      depth,
      parallaxFactor: depthParallaxMul,
      radius: (isBright
        ? Math.random() * 2.2 + 1.2
        : Math.random() * 1.4 + 0.4) * depthRadiusMul,
      opacity: isBright
        ? Math.random() * 0.4 + 0.6
        : Math.random() * 0.5 + 0.25,
      speed: Math.random() * 0.04 + 0.008,
      phase: Math.random() * Math.PI * 2,
      color: isNote ? "242,242,247" : getStarColor(),
      isBright,
      pulseAmp: Math.random() * 0.5 + 0.5,
      isNote,
      glyph: isNote ? NOTE_GLYPHS[Math.floor(Math.random() * NOTE_GLYPHS.length)] : null,
      fontSize: isNote ? (Math.random() * 6 + 10) * depthRadiusMul : 0,
      rotation: isNote ? (Math.random() - 0.5) * 0.35 : 0,
    };
    star.baseX = star.x;
    star.baseY = star.y;
    stars.push(star);
  }
}

function makeShootingStar(x, y) {
  // Most shooting stars stay white; a minority pick up a brand tint so the
  // effect ties back to the palette instead of always reading as generic.
  const tintRoll = Math.random();
  const color = tintRoll < 0.22 ? "155,127,247" : tintRoll < 0.34 ? "0,240,255" : "255,255,255";

  return {
    x: x !== undefined ? x : Math.random() * canvas.width * 0.7,
    y: y !== undefined ? y : Math.random() * canvas.height * 0.4,
    len: Math.random() * 100 + 60,
    speed: Math.random() * 8 + 7,
    opacity: 1,
    angle: Math.PI / 5 + (Math.random() - 0.5) * 0.5,
    color,
  };
}

function spawnShootingStar() {
  shootingStars.push(makeShootingStar());
}

if (!reducedMotion) {
  setInterval(() => {
    if (Math.random() < 0.4) spawnShootingStar();
  }, 3000);
}

/* Wrap a value into the 0..max range so parallax loops seamlessly */
function wrap(value, max) {
  return ((value % max) + max) % max;
}

/* ═══════════════════════════════════════════
   NEBULA CLOUDS
   Large, blurred, slow-drifting color blobs behind the stars. Positions are
   stored as fractions of the viewport so they hold their layout on resize,
   then a small sine drift is added per frame for a slow, living feel.
═══════════════════════════════════════════ */

let nebulae = [];

function createNebulae() {
  nebulae = [
    { fx: 0.18, fy: 0.22, r: 0.55, color: "123,95,245", baseAlpha: 0.10, phase: 0,    speed: 0.00018 },
    { fx: 0.82, fy: 0.14, r: 0.42, color: "0,240,255",  baseAlpha: 0.06, phase: 2.1,  speed: 0.00014 },
    { fx: 0.30, fy: 0.85, r: 0.50, color: "0,240,255",  baseAlpha: 0.05, phase: 4.2,  speed: 0.00021 },
    { fx: 0.88, fy: 0.78, r: 0.60, color: "123,95,245", baseAlpha: 0.09, phase: 1.3,  speed: 0.00016 },
  ];
}

function drawNebulae(time) {
  for (const n of nebulae) {
    n.phase += n.speed * 16.6; // roughly frame-rate independent drift

    const driftX = Math.sin(n.phase) * canvas.width * 0.03;
    const driftY = Math.cos(n.phase * 0.8) * canvas.height * 0.025;

    const cx = n.fx * canvas.width + driftX;
    const cy = n.fy * canvas.height + driftY;
    const radius = n.r * Math.max(canvas.width, canvas.height);

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(${n.color},${n.baseAlpha})`);
    grad.addColorStop(0.6, `rgba(${n.color},${n.baseAlpha * 0.35})`);
    grad.addColorStop(1, `rgba(${n.color},0)`);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

/* ═══════════════════════════════════════════
   WARP STREAK
   A brief hyperspace-style stretch triggered once when the page crosses
   into the pricing section or the final CTA. warpIntensity decays every
   frame; while it is above zero, stars draw a short trailing streak
   radiating from the screen centre in addition to their normal dot/glyph.
═══════════════════════════════════════════ */

let warpIntensity = 0;

function triggerWarp() {
  warpIntensity = 1;
}

function initWarpTriggers() {
  const targets = [
    document.getElementById("pricing"),
    document.querySelector("[data-blackhole-anchor]"),
  ].filter(Boolean);

  if (!targets.length || reducedMotion) return;

  const seen = new WeakSet();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !seen.has(entry.target)) {
        seen.add(entry.target);
        triggerWarp();
      }
    });
  }, { threshold: 0.35 });

  targets.forEach((t) => observer.observe(t));
}

/* Recompute the blackhole's on screen position from its anchor element */
function updateBlackholePosition() {
  if (!bhAnchor) {
    blackhole.visible = false;
    return;
  }

  const rect = bhAnchor.getBoundingClientRect();

  // Sits slightly above and right of the CTA centre so it does not
  // sit directly behind the heading text
  blackhole.x = rect.left + rect.width * 0.5 + rect.width * 0.22;
  blackhole.y = rect.top + rect.height * 0.42;

  // Only run the gravity and draw passes when it is actually on screen
  blackhole.visible =
    rect.bottom > -blackhole.pullRadius &&
    rect.top < canvas.height + blackhole.pullRadius;
}

/* ── Draw the blackhole ── */

function drawBlackhole() {
  blackhole.angle += 0.004;

  // Outer haze
  const glow = ctx.createRadialGradient(
    blackhole.x, blackhole.y, blackhole.radius,
    blackhole.x, blackhole.y, blackhole.pullRadius * 0.75
  );
  glow.addColorStop(0, "rgba(123,95,245,0.10)");
  glow.addColorStop(0.55, "rgba(123,95,245,0.04)");
  glow.addColorStop(1, "rgba(123,95,245,0)");
  ctx.beginPath();
  ctx.arc(blackhole.x, blackhole.y, blackhole.pullRadius * 0.75, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Accretion disk, flattened and slowly rotating
  ctx.save();
  ctx.translate(blackhole.x, blackhole.y);
  ctx.rotate(blackhole.angle);
  ctx.scale(1, 0.26);

  const diskOuter = blackhole.radius + 30;
  const disk = ctx.createRadialGradient(0, 0, blackhole.radius * 0.9, 0, 0, diskOuter);
  disk.addColorStop(0, "rgba(190,170,255,0.62)");
  disk.addColorStop(0.35, "rgba(123,95,245,0.30)");
  disk.addColorStop(0.7, "rgba(0,240,255,0.10)");
  disk.addColorStop(1, "rgba(123,95,245,0)");
  ctx.beginPath();
  ctx.arc(0, 0, diskOuter, 0, Math.PI * 2);
  ctx.fillStyle = disk;
  ctx.fill();
  ctx.restore();

  // Second disk counter rotating at a different tilt, adds depth
  ctx.save();
  ctx.translate(blackhole.x, blackhole.y);
  ctx.rotate(-blackhole.angle * 0.6);
  ctx.scale(1, 0.14);
  const disk2 = ctx.createRadialGradient(0, 0, blackhole.radius, 0, 0, blackhole.radius + 46);
  disk2.addColorStop(0, "rgba(155,127,247,0.32)");
  disk2.addColorStop(1, "rgba(123,95,245,0)");
  ctx.beginPath();
  ctx.arc(0, 0, blackhole.radius + 46, 0, Math.PI * 2);
  ctx.fillStyle = disk2;
  ctx.fill();
  ctx.restore();

  // The void itself, painted in the page background colour
  ctx.beginPath();
  ctx.arc(blackhole.x, blackhole.y, blackhole.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#050507";
  ctx.fill();

  // Event horizon rim
  ctx.beginPath();
  ctx.arc(blackhole.x, blackhole.y, blackhole.radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(175,150,255,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/* ── Main loop ── */

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawNebulae();
  updateBlackholePosition();

  // Age out click pulses
  for (let i = clicks.length - 1; i >= 0; i--) {
    clicks[i].age++;
    if (clicks[i].age > 40) clicks.splice(i, 1);
  }

  // Stars close to the cursor, collected for constellation lines
  const nearCursor = [];

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  for (const star of stars) {
    star.phase += star.speed;
    const twinkle = 0.5 + Math.sin(star.phase) * 0.5;

    // Parallax: displayed position shifts with scroll depth, then wraps.
    // parallaxFactor exaggerates the near/far contrast versus a flat rate.
    const px = star.x;
    const py = wrap(star.y - scrollY * star.parallaxFactor, canvas.height);

    /* Cursor proximity: stars drift away and brighten */
    const mdx = mouse.x - px;
    const mdy = mouse.y - py;
    const mdist = Math.hypot(mdx, mdy);
    let proximityBoost = 0;

    if (mdist < INTERACTION_RADIUS && mdist > 0) {
      const force = (1 - mdist / INTERACTION_RADIUS) * 7;
      star.vx += (-mdx / mdist) * force * 0.12;
      star.vy += (-mdy / mdist) * force * 0.12;
      proximityBoost = (1 - mdist / INTERACTION_RADIUS) * 0.55;
      nearCursor.push({ x: px, y: py, boost: proximityBoost });
    }

    /* Click scatter */
    for (const click of clicks) {
      if (click.age > 15) continue;
      const cdx = px - click.x;
      const cdy = py - click.y;
      const cdist = Math.hypot(cdx, cdy);
      if (cdist < SCATTER_RADIUS && cdist > 0) {
        const impulse = (1 - cdist / SCATTER_RADIUS) * SCATTER_FORCE;
        star.vx += (cdx / cdist) * impulse;
        star.vy += (cdy / cdist) * impulse;
      }
    }

    /* Blackhole gravity and absorption */
    let inPull = false;

    if (blackhole.visible) {
      const bdx = blackhole.x - px;
      const bdy = blackhole.y - py;
      const bdist = Math.hypot(bdx, bdy);

      if (bdist < blackhole.pullRadius && bdist > 0) {
        inPull = true;

        // Pull ramps up sharply as the star closes in
        const falloff = 1 - bdist / blackhole.pullRadius;
        const pull = falloff * falloff * 1.1;

        star.vx += (bdx / bdist) * pull;
        star.vy += (bdy / bdist) * pull;

        // Tangential component so stars spiral in rather than fall straight
        const swirl = falloff * 0.55;
        star.vx += (-bdy / bdist) * swirl;
        star.vy += (bdx / bdist) * swirl;
      }

      // Swallowed: respawn somewhere else on the field
      if (bdist < blackhole.radius + 5) {
        star.x = Math.random() * canvas.width;
        star.y = Math.random() * canvas.height;
        star.baseX = star.x;
        star.baseY = star.y;
        star.vx = 0;
        star.vy = 0;
        continue;
      }
    }

    /* Physics: friction, then spring back toward the rest position */
    star.vx *= 0.9;
    star.vy *= 0.9;
    star.x += star.vx;
    star.y += star.vy;

    // The spring is suspended while the blackhole has hold of the star
    if (!inPull) {
      star.x += (star.baseX - star.x) * 0.04;
      star.y += (star.baseY - star.y) * 0.04;
    }

    /* Warp streak: a short trail radiating from screen centre, layered
       underneath the normal draw so the star itself still reads on top */
    if (warpIntensity > 0.02) {
      const wdx = px - cx;
      const wdy = py - cy;
      const wdist = Math.hypot(wdx, wdy) || 1;
      const stretch = warpIntensity * (20 + star.depth * 70);
      const tx = px - (wdx / wdist) * stretch;
      const ty = py - (wdy / wdist) * stretch;

      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(px, py);
      ctx.strokeStyle = `rgba(${star.color},${warpIntensity * star.opacity * 0.5})`;
      ctx.lineWidth = star.isNote ? 1 : Math.max(0.6, star.radius * 0.6);
      ctx.stroke();
    }

    /* Draw */
    const alpha = Math.min(
      1,
      star.opacity * (0.3 + twinkle * star.pulseAmp * 0.7) + proximityBoost
    );

    if (star.isNote) {
      const noteAlpha = alpha * 0.8;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(star.rotation);
      ctx.font = `${star.fontSize + proximityBoost * 4}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(${star.color},${noteAlpha})`;
      if (star.isBright || proximityBoost > 0.1) {
        ctx.shadowBlur = 8 * twinkle + proximityBoost * 10;
        ctx.shadowColor = `rgba(${star.color},${noteAlpha * 0.9})`;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillText(star.glyph, 0, 0);
      ctx.restore();
      continue;
    }

    const drawRadius = star.radius + proximityBoost * 1.3;

    ctx.beginPath();
    ctx.arc(px, py, drawRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${star.color}, ${alpha})`;

    if (star.isBright || proximityBoost > 0.1) {
      ctx.shadowBlur = drawRadius * 7 * twinkle + proximityBoost * 14;
      ctx.shadowColor = `rgba(${star.color}, ${alpha * 0.9})`;
    } else {
      ctx.shadowBlur = star.radius * 3;
      ctx.shadowColor = `rgba(${star.color}, ${alpha * 0.5})`;
    }

    ctx.fill();
    ctx.shadowBlur = 0;
  }

  warpIntensity *= 0.9;
  if (warpIntensity < 0.02) warpIntensity = 0;

  /* Constellation lines between stars caught in the cursor field */
  for (let i = 0; i < nearCursor.length; i++) {
    for (let j = i + 1; j < nearCursor.length; j++) {
      const a = nearCursor[i];
      const b = nearCursor[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > LINK_RADIUS) continue;

      const strength = (1 - d / LINK_RADIUS) * Math.min(a.boost, b.boost);
      if (strength < 0.03) continue;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(155,127,247,${strength * 0.85})`;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }

  if (blackhole.visible) drawBlackhole();

  /* Shooting stars */
  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i];
    s.x += Math.cos(s.angle) * s.speed;
    s.y += Math.sin(s.angle) * s.speed;
    s.opacity -= 0.018;

    if (s.opacity <= 0) {
      shootingStars.splice(i, 1);
      continue;
    }

    const tailX = s.x - Math.cos(s.angle) * s.len;
    const tailY = s.y - Math.sin(s.angle) * s.len;

    const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
    grad.addColorStop(0, `rgba(${s.color},0)`);
    grad.addColorStop(1, `rgba(${s.color},${s.opacity})`);

    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(s.x, s.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  requestAnimationFrame(animate);
}

/* ── Boot ── */

function init() {
  bhAnchor = document.querySelector("[data-blackhole-anchor]");
  scrollY = window.scrollY;
  resizeCanvas();
  initWarpTriggers();

  if (reducedMotion) {
    // Draw a single static frame and stop
    updateBlackholePosition();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawNebulae();
    for (const star of stars) {
      if (star.isNote) {
        ctx.save();
        ctx.translate(star.x, star.y);
        ctx.rotate(star.rotation);
        ctx.font = `${star.fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(${star.color},${star.opacity * 0.8})`;
        ctx.fillText(star.glyph, 0, 0);
        ctx.restore();
        continue;
      }
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${star.color}, ${star.opacity})`;
      ctx.fill();
    }
    if (blackhole.visible) drawBlackhole();
    return;
  }

  animate();
}

window.addEventListener("resize", resizeCanvas);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}