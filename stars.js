const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d");

let stars = [];
let shootingStars = [];
let mouse = { x: -9999, y: -9999 };
const STAR_COUNT = 320;
const INTERACTION_RADIUS = 120;

/* Track mouse for interactive parallax pull */
window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

window.addEventListener("mouseleave", () => {
  mouse.x = -9999;
  mouse.y = -9999;
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
    "123,63,255"
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function createStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const isBright = Math.random() < 0.18;
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      baseX: 0,
      baseY: 0,
      /* Brighter range than before */
      radius: isBright
        ? Math.random() * 2.2 + 1.2
        : Math.random() * 1.4 + 0.4,
      opacity: isBright
        ? Math.random() * 0.4 + 0.6
        : Math.random() * 0.5 + 0.25,
      /* Varied twinkle speeds for organic feel */
      speed: Math.random() * 0.04 + 0.008,
      phase: Math.random() * Math.PI * 2,
      color: getStarColor(),
      isBright,
      /* Each star has a unique pulse amplitude */
      pulseAmp: Math.random() * 0.5 + 0.5,
    });
    stars[i].baseX = stars[i].x;
    stars[i].baseY = stars[i].y;
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

/* Randomly spawn shooting stars */
setInterval(() => {
  if (Math.random() < 0.4) spawnShootingStar();
}, 3000);

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /* Draw regular stars */
  for (const star of stars) {
    star.phase += star.speed;

    /* Smooth sine twinkle with individual amplitude */
    const twinkle = 0.5 + Math.sin(star.phase) * 0.5;
    const alpha = star.opacity * (0.3 + twinkle * star.pulseAmp * 0.7);

    /* Interactive: stars near cursor drift slightly away */
    const dx = mouse.x - star.baseX;
    const dy = mouse.y - star.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < INTERACTION_RADIUS) {
      const force = (1 - dist / INTERACTION_RADIUS) * 6;
      star.x += (-dx / dist) * force * 0.08;
      star.y += (-dy / dist) * force * 0.08;
    } else {
      /* Drift back to base position */
      star.x += (star.baseX - star.x) * 0.04;
      star.y += (star.baseY - star.y) * 0.04;
    }

    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${star.color}, ${alpha})`;

    /* Brighter stars get a stronger glow */
    if (star.isBright) {
      ctx.shadowBlur = star.radius * 7 * twinkle;
      ctx.shadowColor = `rgba(${star.color}, ${alpha * 0.9})`;
    } else {
      ctx.shadowBlur = star.radius * 3;
      ctx.shadowColor = `rgba(${star.color}, ${alpha * 0.5})`;
    }

    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* Draw shooting stars */
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