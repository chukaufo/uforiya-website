const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d");

let stars = [];
let starCount = 260;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    createStars();
}

function createStars() {
    stars = [];
    for (let i = 0; i < starCount; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: Math.random() * 1.8 + 0.3,
            opacity: Math.random() * 0.8 + 0.2,
            speed: Math.random() * 0.02 + 0.005,
            phase: Math.random() * Math.PI * 2,
            color: getStarColor()
        });
    }
}

function getStarColor() {
    const colors = [
        "255,255,255",
        "0,240,255",
        "123,63,255"
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const star of stars) {
        star.phase += star.speed;

        const twinkle = 0.5 + Math.sin(star.phase) * 0.5;
        const alpha = star.opacity * (0.4 + twinkle * 0.6);

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);

        ctx.fillStyle = `rgba(${star.color}, ${alpha})`;
        ctx.shadowBlur = star.radius * 4;
        ctx.shadowColor = `rgba(${star.color}, ${alpha})`;

        ctx.fill();
    }

    requestAnimationFrame(animate);
}

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
animate();
