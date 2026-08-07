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
  shootingStars.push({
    x, y,
    len: Math.random() * 100 + 60,
    speed: Math.random() * 8 + 7,
    opacity: 1,
    angle: Math.PI / 5 + (Math.random() - 0.5) * 0.5,
  });
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
    const star = {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      baseX: 0,
      baseY: 0,
      vx: 0,
      vy: 0,
      // depth drives parallax: nearer stars are larger and move more on scroll
      depth: Math.random() * 0.85 + 0.15,
      radius: isBright
        ? Math.random() * 2.2 + 1.2
        : Math.random() * 1.4 + 0.4,
      opacity: isBright
        ? Math.random() * 0.4 + 0.6
        : Math.random() * 0.5 + 0.25,
      speed: Math.random() * 0.04 + 0.008,
      phase: Math.random() * Math.PI * 2,
      color: getStarColor(),
      isBright,
      pulseAmp: Math.random() * 0.5 + 0.5,
    };
    star.baseX = star.x;
    star.baseY = star.y;
    stars.push(star);
  }
}

function spawnShootingStar() {
  shootingStars.push({
    x: Math.random() * canvas.width * 0.7,
    y: Math.random() * canvas.height * 0.4,
    len: Math.random() * 120 + 60,
    speed: Math.random() * 10 + 8,
    opacity: 1,
    angle: Math.PI / 5,
  });
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

  updateBlackholePosition();

  // Age out click pulses
  for (let i = clicks.length - 1; i >= 0; i--) {
    clicks[i].age++;
    if (clicks[i].age > 40) clicks.splice(i, 1);
  }

  // Stars close to the cursor, collected for constellation lines
  const nearCursor = [];

  for (const star of stars) {
    star.phase += star.speed;
    const twinkle = 0.5 + Math.sin(star.phase) * 0.5;

    // Parallax: displayed position shifts with scroll depth, then wraps
    const px = star.x;
    const py = wrap(star.y - scrollY * star.depth * 0.12, canvas.height);

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

    /* Draw */
    const alpha = Math.min(
      1,
      star.opacity * (0.3 + twinkle * star.pulseAmp * 0.7) + proximityBoost
    );
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
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, `rgba(255,255,255,${s.opacity})`);

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

  if (reducedMotion) {
    // Draw a single static frame and stop
    updateBlackholePosition();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const star of stars) {
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