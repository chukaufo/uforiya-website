/* ═══════════════════════════════════════════════
   DEEPSPACE
   Dense starfield for the /outerspace page. Same interactions as the
   landing page starfield (cursor repel, constellation lines, click scatter,
   shooting stars) with far more stars and a set of blinkers.
   Draws onto the same #starfield canvas that style.css positions.
═══════════════════════════════════════════════ */
(() => {
  "use strict";

  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");
  const TAU = Math.PI * 2;

  /* ── Tuning ── */
  const DENSITY = 520;            // px² of screen per star. Lower = more stars
  const MIN_STARS = 500;
  const MAX_STARS = 3200;
  const BRIGHT_CHANCE = 0.07;     // bigger stars with a soft glow
  const BLINK_CHANCE = 0.10;      // stars that flash on and off with a sparkle
  const NOTE_CHANCE = 0.008;      // tiny musical notes mixed in. 0 for none
  const BAND_SHARE = 0.3;         // share of dust packed into the diagonal band. 0 for even

  const INTERACTION_RADIUS = 180;
  const LINK_RADIUS = 110;
  const SCATTER_RADIUS = 110;
  const SCATTER_FORCE = 15;
  const MAX_LINK_STARS = 70;      // caps constellation line work near the cursor

  const SHOOTING_EVERY_MS = 2400;
  const SHOOTING_CHANCE = 0.5;

  const DOT = 0, BRIGHT = 1, BLINK = 2;
  const NOTE_GLYPHS = ["\u266A", "\u266B"];

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Colour ── */
  const COLORS = ["255,255,255", "180,150,255", "0,240,255", "123,95,245"];
  const COLOR_CSS = COLORS.map((c) => `rgb(${c})`);

  function pickColor() {
    const r = Math.random();
    return r < 0.5 ? 0 : r < 0.67 ? 1 : r < 0.83 ? 2 : 3;
  }

  /* Pre-rendered soft glow per colour. One drawImage per bright star is far
     cheaper than a shadowBlur per star. */
  function makeGlowSprite(rgb) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb},0.9)`);
    grad.addColorStop(0.25, `rgba(${rgb},0.32)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  const glowSprites = COLORS.map(makeGlowSprite);

  /* ── State ── */
  let W = 0, H = 0, dpr = 1;
  let stars = [];
  let notes = [];
  let shootingStars = [];
  let clicks = [];
  let pulses = [];
  const mouse = { x: -9999, y: -9999 };
  let lastTouch = 0;

  /* ── Nebulae ──
     Drawn on a quarter-size offscreen canvas and scaled up. They are soft
     blurs anyway, and this keeps five screen-wide gradients cheap. */
  const NEB_SCALE = 0.25;
  const neb = document.createElement("canvas");
  const nctx = neb.getContext("2d");

  const NEBULAE = [
    { fx: 0.18, fy: 0.22, r: 0.55, color: "123,95,245", a: 0.10, phase: 0,   speed: 0.00018 },
    { fx: 0.82, fy: 0.14, r: 0.42, color: "0,240,255",  a: 0.06, phase: 2.1, speed: 0.00014 },
    { fx: 0.30, fy: 0.85, r: 0.50, color: "0,240,255",  a: 0.05, phase: 4.2, speed: 0.00021 },
    { fx: 0.88, fy: 0.78, r: 0.60, color: "123,95,245", a: 0.09, phase: 1.3, speed: 0.00016 },
    { fx: 0.50, fy: 0.46, r: 0.38, color: "123,95,245", a: 0.07, phase: 3.3, speed: 0.00012 },
  ];

  function drawNebulae(now) {
    const w = neb.width, h = neb.height;
    nctx.clearRect(0, 0, w, h);

    for (const n of NEBULAE) {
      const p = n.phase + now * n.speed;
      const cx = n.fx * w + Math.sin(p) * w * 0.03;
      const cy = n.fy * h + Math.cos(p * 0.8) * h * 0.025;
      const radius = n.r * Math.max(w, h);

      const grad = nctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `rgba(${n.color},${n.a})`);
      grad.addColorStop(0.6, `rgba(${n.color},${n.a * 0.35})`);
      grad.addColorStop(1, `rgba(${n.color},0)`);
      nctx.fillStyle = grad;
      nctx.fillRect(0, 0, w, h);
    }

    ctx.globalAlpha = 1;
    ctx.drawImage(neb, 0, 0, W, H);
  }

  /* ── Star field ── */

  function gaussish() {
    return Math.random() + Math.random() + Math.random() - 1.5;
  }

  /* A point scattered around a diagonal line, for the dense dust band */
  function bandPoint() {
    const ax = -0.05 * W, ay = 0.85 * H;
    const bx = 1.05 * W,  by = 0.15 * H;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const t = Math.random();
    const off = gaussish() * 0.2 * H;
    return {
      x: ax + dx * t + (-dy / len) * off,
      y: ay + dy * t + (dx / len) * off,
    };
  }

  function makeBody(x, y) {
    return { x, y, bx: x, by: y, vx: 0, vy: 0 };
  }

  function createStars() {
    const count = Math.max(MIN_STARS, Math.min(MAX_STARS, Math.round((W * H) / DENSITY)));
    stars = [];
    notes = [];

    for (let i = 0; i < count; i++) {
      const depth = Math.random() * 0.85 + 0.15;
      const depthMul = 0.6 + depth * 0.9;

      let x = Math.random() * W;
      let y = Math.random() * H;

      if (Math.random() < NOTE_CHANCE) {
        const n = makeBody(x, y);
        n.a = Math.random() * 0.4 + 0.45;
        n.size = (Math.random() * 5 + 10) * depthMul;
        n.rotation = (Math.random() - 0.5) * 0.35;
        n.glyph = NOTE_GLYPHS[Math.floor(Math.random() * NOTE_GLYPHS.length)];
        n.speed = Math.random() * 0.0024 + 0.0005;
        n.phase = Math.random() * TAU;
        notes.push(n);
        continue;
      }

      const roll = Math.random();
      let kind, r, a;

      if (roll < BLINK_CHANCE) {
        kind = BLINK;
        r = (Math.random() * 0.9 + 0.9) * depthMul;
        a = Math.random() * 0.2 + 0.8;
      } else if (roll < BLINK_CHANCE + BRIGHT_CHANCE) {
        kind = BRIGHT;
        r = (Math.random() * 1.4 + 1.1) * depthMul;
        a = Math.random() * 0.35 + 0.6;
      } else {
        kind = DOT;
        if (Math.random() < 0.75) {
          r = (Math.random() * 0.5 + 0.35) * depthMul;   // dust
          a = Math.random() * 0.45 + 0.2;
        } else {
          r = (Math.random() * 0.7 + 0.7) * depthMul;
          a = Math.random() * 0.4 + 0.4;
        }

        if (Math.random() < BAND_SHARE) {
          const p = bandPoint();
          if (p.x > 0 && p.x < W && p.y > 0 && p.y < H) { x = p.x; y = p.y; }
        }
      }

      const s = makeBody(x, y);
      s.kind = kind;
      s.r = r;
      s.a = a;
      s.color = pickColor();
      s.phase = Math.random() * TAU;
      s.amp = Math.random() * 0.5 + 0.5;
      // Blinkers run a 2.5 to 9 second cycle, the rest twinkle a little faster
      s.speed = kind === BLINK
        ? Math.random() * 0.0018 + 0.0007
        : Math.random() * 0.0024 + 0.0005;
      s.flare = Math.random() * 10 + 8;
      stars.push(s);
    }

    // Same colour next to same colour, so fillStyle is only set a few times a frame
    stars.sort((p, q) => p.color - q.color);
  }

  function setup() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    neb.width = Math.max(2, Math.round(W * NEB_SCALE));
    neb.height = Math.max(2, Math.round(H * NEB_SCALE));

    createStars();

    if (reducedMotion) render(performance.now(), 0);
  }

  /* ── Shooting stars ── */

  function makeShootingStar(x, y) {
    const tint = Math.random();
    const color = tint < 0.22 ? "155,127,247" : tint < 0.34 ? "0,240,255" : "255,255,255";
    return {
      x: x !== undefined ? x : Math.random() * W * 0.7,
      y: y !== undefined ? y : Math.random() * H * 0.4,
      len: Math.random() * 100 + 60,
      speed: Math.random() * 8 + 7,
      opacity: 1,
      angle: Math.PI / 5 + (Math.random() - 0.5) * 0.5,
      color,
    };
  }

  /* ── Input ── */

  function registerPulse(x, y) {
    clicks.push({ x, y, t: performance.now() });
    shootingStars.push(makeShootingStar(x, y));
  }

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  document.addEventListener("mouseleave", () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  window.addEventListener("touchmove", (e) => {
    if (!e.touches.length) return;
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener("touchend", () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  window.addEventListener("touchstart", (e) => {
    if (!e.touches.length) return;
    lastTouch = performance.now();
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
    registerPulse(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  window.addEventListener("click", (e) => {
    // A tap fires touchstart and then click, so skip the second one
    if (performance.now() - lastTouch < 600) return;
    registerPulse(e.clientX, e.clientY);
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setup, 120);
  });

  /* ── Physics ── */

  const IR2 = INTERACTION_RADIUS * INTERACTION_RADIUS;
  const SR2 = SCATTER_RADIUS * SCATTER_RADIUS;
  const LR2 = LINK_RADIUS * LINK_RADIUS;

  /* Moves one star or note and returns how much the cursor is lighting it.
     k is the frame time as a multiple of 16.7ms, so 60Hz and 120Hz screens
     behave the same. */
  function step(s, k, friction, spring) {
    let boost = 0;

    if (mouse.x > -1000) {
      const dx = mouse.x - s.x;
      const dy = mouse.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < IR2 && d2 > 0) {
        const d = Math.sqrt(d2);
        const near = 1 - d / INTERACTION_RADIUS;
        const f = near * 7 * 0.12 * k;
        s.vx -= (dx / d) * f;
        s.vy -= (dy / d) * f;
        boost = near * 0.55;
      }
    }

    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < SR2 && d2 > 0) {
        const d = Math.sqrt(d2);
        const imp = (1 - d / SCATTER_RADIUS) * SCATTER_FORCE * k;
        s.vx += (dx / d) * imp;
        s.vy += (dy / d) * imp;
      }
    }

    s.vx *= friction;
    s.vy *= friction;
    s.x += s.vx * k;
    s.y += s.vy * k;
    s.x += (s.bx - s.x) * spring;
    s.y += (s.by - s.y) * spring;

    return boost;
  }

  /* ── Render ── */

  function render(now, k) {
    const friction = Math.pow(0.9, k);
    const spring = 1 - Math.pow(0.96, k);

    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    drawNebulae(now);

    // Click pulses scatter for a quarter second, then are dropped
    pulses.length = 0;
    while (clicks.length && now - clicks[0].t > 700) clicks.shift();
    for (const c of clicks) if (now - c.t < 250) pulses.push(c);

    const near = [];
    let fillColor = -1;

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const boost = step(s, k, friction, spring);

      if (boost > 0.1) near.push({ x: s.x, y: s.y, boost });

      let alpha, b = 0, tw = 0;

      if (s.kind === BLINK) {
        // Raised to the sixth power so it sits nearly dark, then flashes
        const w = 0.5 + 0.5 * Math.sin(now * s.speed + s.phase);
        const w2 = w * w;
        b = w2 * w2 * w2;
        alpha = s.a * (0.08 + 0.92 * b) + boost;
      } else {
        tw = 0.5 + 0.5 * Math.sin(now * s.speed + s.phase);
        alpha = s.a * (0.3 + tw * s.amp * 0.7) + boost;
      }

      if (alpha > 1) alpha = 1;
      if (alpha < 0.02) continue;

      if (fillColor !== s.color) {
        ctx.fillStyle = COLOR_CSS[s.color];
        fillColor = s.color;
      }

      const rad = s.r + boost * 1.3;

      if (s.kind === BLINK) {
        if (b > 0.06) {
          const gs = rad * 5 + b * 22;
          ctx.globalAlpha = Math.min(1, b * 0.6 + boost * 0.4);
          ctx.drawImage(glowSprites[s.color], s.x - gs, s.y - gs, gs * 2, gs * 2);
        }

        // Four-point sparkle at the peak of the blink
        if (b > 0.3) {
          const L = rad * 2 + b * s.flare;
          const w = L * 0.1;
          ctx.globalAlpha = Math.min(1, b * 0.85);
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - L);
          ctx.lineTo(s.x + w, s.y - w);
          ctx.lineTo(s.x + L, s.y);
          ctx.lineTo(s.x + w, s.y + w);
          ctx.lineTo(s.x, s.y + L);
          ctx.lineTo(s.x - w, s.y + w);
          ctx.lineTo(s.x - L, s.y);
          ctx.lineTo(s.x - w, s.y - w);
          ctx.closePath();
          ctx.fill();
        }
      } else if (s.kind === BRIGHT) {
        const gs = rad * (3.2 + tw * 1.6) + boost * 10;
        ctx.globalAlpha = alpha * 0.6;
        ctx.drawImage(glowSprites[s.color], s.x - gs, s.y - gs, gs * 2, gs * 2);
      }

      ctx.globalAlpha = alpha;
      if (rad < 0.9) {
        ctx.fillRect(s.x - rad, s.y - rad, rad * 2, rad * 2);
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, rad, 0, TAU);
        ctx.fill();
      }
    }

    /* Notes */
    for (const n of notes) {
      const boost = step(n, k, friction, spring);
      const tw = 0.5 + 0.5 * Math.sin(now * n.speed + n.phase);
      const alpha = Math.min(1, (n.a * (0.3 + tw * 0.7) + boost) * 0.8);

      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(n.rotation);
      ctx.font = `${n.size + boost * 4}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgb(242,242,247)";
      ctx.fillText(n.glyph, 0, 0);
      ctx.restore();
    }

    /* Constellation lines between the stars nearest the cursor */
    if (near.length > 1) {
      if (near.length > MAX_LINK_STARS) {
        near.sort((p, q) => q.boost - p.boost);
        near.length = MAX_LINK_STARS;
      }

      ctx.strokeStyle = "rgb(155,127,247)";
      ctx.lineWidth = 0.7;

      for (let i = 0; i < near.length; i++) {
        for (let j = i + 1; j < near.length; j++) {
          const a = near[i];
          const c = near[j];
          const dx = a.x - c.x;
          const dy = a.y - c.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LR2) continue;

          const strength = (1 - Math.sqrt(d2) / LINK_RADIUS) * Math.min(a.boost, c.boost);
          if (strength < 0.03) continue;

          ctx.globalAlpha = Math.min(1, strength * 0.85);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
        }
      }
    }

    /* Shooting stars */
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const s = shootingStars[i];
      s.x += Math.cos(s.angle) * s.speed * k;
      s.y += Math.sin(s.angle) * s.speed * k;
      s.opacity -= 0.018 * k;

      if (s.opacity <= 0) {
        shootingStars.splice(i, 1);
        continue;
      }

      const tailX = s.x - Math.cos(s.angle) * s.len;
      const tailY = s.y - Math.sin(s.angle) * s.len;

      const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
      grad.addColorStop(0, `rgba(${s.color},0)`);
      grad.addColorStop(1, `rgba(${s.color},${s.opacity})`);

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.globalAlpha = s.opacity;
      ctx.fillStyle = `rgb(${s.color})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.6, 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  /* ── Boot ── */

  let last = performance.now();

  function loop(now) {
    const dt = Math.min(now - last, 50);
    last = now;
    render(now, dt / 16.667);
    requestAnimationFrame(loop);
  }

  function init() {
    setup();

    if (reducedMotion) return;   // setup() already drew the single static frame

    setInterval(() => {
      if (Math.random() < SHOOTING_CHANCE) shootingStars.push(makeShootingStar());
    }, SHOOTING_EVERY_MS);

    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
