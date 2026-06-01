const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d");

let stars = [];
let shootingStars = [];
let mouse = { x: -9999, y: -9999 };
let clicks = []; // click ripple events

const STAR_COUNT = 320;
const INTERACTION_RADIUS = 160;  // wider field of influence
const SCATTER_RADIUS = 90;       // click scatter radius
const SCATTER_FORCE = 14;        // how hard stars scatter on click

window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

window.addEventListener("mouseleave", () => {
  mouse.x = -9999;
  mouse.y = -9999;
});

/* Click spawns a scatter pulse */
window.addEventListener("click", (e) => {
  clicks.push({ x: e.clientX, y: e.clientY, age: 0 });
  /* Also spawn a shooting star from the click point */
  shootingStars.push({
    x: e.clientX,
    y: e.clientY,
    len: Math.random() * 100 + 60,
    speed: Math.random() * 8 + 7,
    opacity: 1,
    angle: Math.PI / 5 + (Math.random() - 0.5) * 0.4,
  });
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  createStars();
}

function getStarColor() {
  const colors = [
    "255,255,255",
    "255,255,255",
    "255,255,255",
    "180,150,255",
    "0,240,255",
    "123,63,255",
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
      vx: 0,  // velocity x — used for scatter physics
      vy: 0,  // velocity y
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
  const startX = Math.random() * canvas.width * 0.7;
  const startY = Math.random() * canvas.height * 0.4;
  shootingStars.push({
    x: startX,
    y: startY,
    len: Math.random() * 120 + 60,
    speed: Math.random() * 10 + 8,
    opacity: 1,
    angle: Math.PI / 5,
  });
}

setInterval(() => {
  if (Math.random() < 0.4) spawnShootingStar();
}, 3000);

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /* Age out old click events */
  for (let i = clicks.length - 1; i >= 0; i--) {
    clicks[i].age++;
    if (clicks[i].age > 40) clicks.splice(i, 1);
  }

  for (const star of stars) {
    star.phase += star.speed;
    const twinkle = 0.5 + Math.sin(star.phase) * 0.5;

    /* ── Mouse proximity: stars drift away + brighten ── */
    const mdx = mouse.x - star.x;
    const mdy = mouse.y - star.y;
    const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

    let proximityBoost = 0; // extra brightness for nearby stars

    if (mdist < INTERACTION_RADIUS) {
      const force = (1 - mdist / INTERACTION_RADIUS) * 7;
      /* Push away from cursor */
      star.vx += (-mdx / mdist) * force * 0.12;
      star.vy += (-mdy / mdist) * force * 0.12;
      /* Stars near cursor glow brighter */
      proximityBoost = (1 - mdist / INTERACTION_RADIUS) * 0.5;
    }

    /* ── Click scatter: impulse away from click point ── */
    for (const click of clicks) {
      if (click.age > 15) continue; // only affect in first 15 frames
      const cdx = star.x - click.x;
      const cdy = star.y - click.y;
      const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
      if (cdist < SCATTER_RADIUS && cdist > 0) {
        const impulse = (1 - cdist / SCATTER_RADIUS) * SCATTER_FORCE;
        star.vx += (cdx / cdist) * impulse;
        star.vy += (cdy / cdist) * impulse;
      }
    }

    /* ── Physics: apply velocity, friction, spring back to base ── */
    star.vx *= 0.88;           // friction — dampens velocity each frame
    star.vy *= 0.88;
    star.x += star.vx;
    star.y += star.vy;

    /* Spring force pulls star back toward its base position */
    const springStrength = 0.04;
    star.x += (star.baseX - star.x) * springStrength;
    star.y += (star.baseY - star.y) * springStrength;

    /* ── Draw ── */
    const alpha = Math.min(1, star.opacity * (0.3 + twinkle * star.pulseAmp * 0.7) + proximityBoost);

    /* Stars near cursor also grow slightly */
    const drawRadius = star.radius + proximityBoost * 1.2;

    ctx.beginPath();
    ctx.arc(star.x, star.y, drawRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${star.color}, ${alpha})`;

    if (star.isBright || proximityBoost > 0.1) {
      /* Brighter glow when near cursor */
      ctx.shadowBlur = drawRadius * 7 * twinkle + proximityBoost * 12;
      ctx.shadowColor = `rgba(${star.color}, ${alpha * 0.9})`;
    } else {
      ctx.shadowBlur = star.radius * 3;
      ctx.shadowColor = `rgba(${star.color}, ${alpha * 0.5})`;
    }

    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ── Shooting stars ── */
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
    grad.addColorStop(0, `rgba(255,255,255,0)`);
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

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
animate();