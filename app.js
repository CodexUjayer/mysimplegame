const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score-display');
const body = document.getElementById('body');
const flashOverlay = document.getElementById('flash-overlay');

// Gemini API Key
const GEMINI_API_KEY = "AIzaSyCq3NfKQ8Dk3BJw4_qJyuKuKPZz9qZ41lU";

let animationId;
let gamePaused = false;
let score = 0;
let aiState = 'default'; // 'default', 'command', 'processing'
let inputBuffer = "";

// Game objects
const ball = {
  x: 0, y: 0,
  dx: 5, dy: -5,
  radius: 8,
  speed: 7,
  trail: []
};

const paddle = {
  width: 150,
  height: 12,
  x: 0, y: 0,
  dx: 8
};

const brickInfo = {
  rows: 5,
  cols: 10,
  width: 0,
  height: 30,
  padding: 10,
  offsetTop: 80,
  offsetLeft: 30
};

let bricks = [];

function initBricks() {
  bricks = [];
  // Use calculated dimensions from resizeCanvas
  for (let c = 0; c < brickInfo.cols; c++) {
    bricks[c] = [];
    for (let r = 0; r < brickInfo.rows; r++) {
      // Monochrome shades for bricks
      const shade = Math.floor(255 - (r * 30));
      bricks[c][r] = { x: 0, y: 0, status: 1, color: `rgb(${shade}, ${shade}, ${shade})` };
    }
  }
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Responsive paddle width
  paddle.width = Math.min(150, canvas.width * 0.2);
  paddle.y = canvas.height - 40;

  if (paddle.x === 0 || paddle.x + paddle.width > canvas.width) {
    paddle.x = canvas.width / 2 - paddle.width / 2;
  }
  // Responsive brick sizing
  brickInfo.offsetLeft = Math.max(20, canvas.width * 0.05);
  brickInfo.offsetTop = Math.max(60, canvas.height * 0.1);
  brickInfo.width = (canvas.width - brickInfo.offsetLeft * 2 - brickInfo.padding * (brickInfo.cols - 1)) / brickInfo.cols;
  brickInfo.height = Math.max(20, canvas.height * 0.04);

  if (ball.x === 0 && ball.y === 0) {
    resetBall();
  }
  if (bricks.length === 0) {
    initBricks();
  }
}

window.addEventListener('resize', resizeCanvas);

function resetBall() {
  ball.x = canvas.width / 2;
  ball.y = canvas.height - 100;
  ball.dx = ball.speed * (Math.random() > 0.5 ? 1 : -1);
  ball.dy = -ball.speed;
}

// Controls
let rightPressed = false;
let leftPressed = false;

document.addEventListener("keydown", keyDownHandler, false);
document.addEventListener("keyup", keyUpHandler, false);
document.addEventListener("mousemove", mouseMoveHandler, false);

function keyDownHandler(e) {
  // Mode Toggles
  if (e.key === '`' || e.key === 'Escape') {
    e.preventDefault();
    toggleAiMode();
    return;
  }

  // Ctrl+K Shortcut to Download VSIX
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    downloadVsix();
    return;
  }

  if (aiState === 'command') {
    if (e.key === 'Enter') {
      const prompt = inputBuffer.trim();
      console.log("Command submitted:", prompt);
      inputBuffer = "";
      if (prompt) {
        processPrompt(prompt);
      } else {
        revertToDefault();
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      navigator.clipboard.readText().then(text => {
        inputBuffer += text;
        drawCommandMode();
      }).catch(err => console.error("Failed to read clipboard:", err));
    } else if (e.key === 'Backspace') {
      inputBuffer = inputBuffer.slice(0, -1);
      drawCommandMode();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      inputBuffer += e.key;
      drawCommandMode();
    }
    e.preventDefault();
    return;
  }

  if (aiState !== 'default') return;
  if (e.key == "Right" || e.key == "ArrowRight") {
    rightPressed = true;
  }
  else if (e.key == "Left" || e.key == "ArrowLeft") {
    leftPressed = true;
  }
}

function keyUpHandler(e) {
  if (e.key == "Right" || e.key == "ArrowRight") {
    rightPressed = false;
  }
  else if (e.key == "Left" || e.key == "ArrowLeft") {
    leftPressed = false;
  }
}

function mouseMoveHandler(e) {
  if (aiState !== 'default' || gamePaused) return;
  let relativeX = e.clientX;
  if (relativeX > 0 && relativeX < canvas.width) {
    paddle.x = relativeX - paddle.width / 2;
  }
}

function collisionDetection() {
  for (let c = 0; c < brickInfo.cols; c++) {
    for (let r = 0; r < brickInfo.rows; r++) {
      let b = bricks[c][r];
      if (b.status == 1) {
        // More robust collision
        if (ball.x + ball.radius > b.x &&
          ball.x - ball.radius < b.x + brickInfo.width &&
          ball.y + ball.radius > b.y &&
          ball.y - ball.radius < b.y + brickInfo.height) {

          // Determine which side was hit
          const overlapX = Math.min(ball.x + ball.radius - b.x, b.x + brickInfo.width - (ball.x - ball.radius));
          const overlapY = Math.min(ball.y + ball.radius - b.y, b.y + brickInfo.height - (ball.y - ball.radius));

          if (overlapX < overlapY) {
            ball.dx = -ball.dx;
            // Move ball out of collision
            ball.x += ball.dx > 0 ? overlapX : -overlapX;
          } else {
            ball.dy = -ball.dy;
            // Move ball out of collision
            ball.y += ball.dy > 0 ? overlapY : -overlapY;
          }

          b.status = 0;
          score += 10;
          scoreDisplay.innerText = score;

          // Check win condition
          let bricksLeft = bricks.flat().filter(bk => bk.status === 1).length;
          if (bricksLeft === 0) {
            initBricks();
            resetBall();
            ball.speed += 0.5;
          }
        }
      }
    }
  }
}

function drawBall() {
  // Update trail
  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 8) ball.trail.shift();

  // Draw trail
  ball.trail.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, ball.radius * (i / ball.trail.length), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * (i / ball.trail.length)})`;
    ctx.fill();
    ctx.closePath();
  });

  // Draw ball with glow
  const gradient = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.radius);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#cccccc");

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;

  ctx.shadowBlur = 10;
  ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
  ctx.fill();
  ctx.closePath();
  ctx.shadowBlur = 0;
}

function drawPaddle() {
  const gradient = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#999999");

  ctx.beginPath();
  ctx.rect(paddle.x, paddle.y, paddle.width, paddle.height);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Subtle glow
  ctx.shadowBlur = 15;
  ctx.shadowColor = "rgba(255, 255, 255, 0.3)";
  ctx.closePath();
  ctx.shadowBlur = 0;
}

function drawBricks() {
  for (let c = 0; c < brickInfo.cols; c++) {
    for (let r = 0; r < brickInfo.rows; r++) {
      if (bricks[c][r].status == 1) {
        let brickX = (c * (brickInfo.width + brickInfo.padding)) + brickInfo.offsetLeft;
        let brickY = (r * (brickInfo.height + brickInfo.padding)) + brickInfo.offsetTop;
        bricks[c][r].x = brickX;
        bricks[c][r].y = brickY;

        ctx.beginPath();
        ctx.rect(brickX, brickY, brickInfo.width, brickInfo.height);
        ctx.fillStyle = bricks[c][r].color;
        ctx.fill();

        // Edge highlights
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.closePath();
      }
    }
  }
}

function draw() {
  if (gamePaused) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (body.classList.contains('theme-command') || body.classList.contains('theme-processing')) {
    ctx.strokeStyle = body.classList.contains('theme-command') ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= canvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  drawBricks();
  drawBall();
  drawPaddle();
  collisionDetection();

  // Wall bounce
  if (ball.x + ball.dx > canvas.width - ball.radius || ball.x + ball.dx < ball.radius) {
    ball.dx = -ball.dx;
  }
  if (ball.y + ball.dy < ball.radius) {
    ball.dy = -ball.dy;
  }
  else if (ball.y + ball.dy > paddle.y - ball.radius) {
    // Robust Paddle Collision
    if (ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
      ball.dy = -Math.abs(ball.dy); // Ensure it always goes UP
      // Add a little english based on where it hit the paddle
      let hitPoint = ball.x - (paddle.x + paddle.width / 2);
      ball.dx = hitPoint * 0.15;
      ball.y = paddle.y - ball.radius; // Move out of paddle
    }
    else if (ball.y + ball.dy > canvas.height) {
      score = 0;
      scoreDisplay.innerText = score;
      resetBall();
    }
  }

  if (rightPressed && paddle.x < canvas.width - paddle.width) {
    paddle.x += paddle.dx;
  }
  else if (leftPressed && paddle.x > 0) {
    paddle.x -= paddle.dx;
  }

  ball.x += ball.dx;
  ball.y += ball.dy;

  animationId = requestAnimationFrame(draw);
}

// --- AI STEALTH MODE LOGIC ---

// AI logic handled in keyDownHandler

function toggleAiMode() {
  if (aiState === 'default') {
    enterCommandMode();
  } else if (aiState === 'command') {
    // Esc while typing cancels it
    revertToDefault();
  }
}

function drawCommandMode() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= canvas.width; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  drawBricks();
  drawBall();
  drawPaddle();

  ctx.font = "24px monospace";
  ctx.fillStyle = "rgba(34, 197, 94, 1)";
  ctx.textAlign = "center";
  ctx.fillText("> " + inputBuffer + "_", canvas.width / 2, canvas.height / 2);
}

function enterCommandMode() {
  aiState = 'command';
  gamePaused = true;
  cancelAnimationFrame(animationId);

  body.className = "theme-command";
  inputBuffer = "";

  drawCommandMode();
}

async function processPrompt(prompt) {
  aiState = 'processing';

  body.className = "theme-processing";

  // Draw red pulse grid frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= canvas.width; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  drawBricks();
  drawBall();
  drawPaddle();

  try {
    console.log("Fetching from Gemini...");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are a stealth assistant. Provide concise, direct answers without conversational filler, as your output will be copied directly to the user's clipboard." }]
        },
        contents: [
          { parts: [{ text: prompt }] }
        ],
        generationConfig: {
          temperature: 0.7
        }
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error("Gemini API Error Detail:", errorData);
      throw new Error(`API Request Failed: ${res.status}`);
    }

    const data = await res.json();
    const resultText = data.candidates[0].content.parts[0].text;
    console.log("Response received, copying to clipboard...");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(resultText);
        console.log("Copied to clipboard via navigator.");
      } else {
        throw new Error("navigator.clipboard not available");
      }
    } catch (clipboardErr) {
      console.warn("Clipboard API failed, using fallback.", clipboardErr);
      const textArea = document.createElement("textarea");
      textArea.value = resultText;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        if (!successful) throw new Error("execCommand returned false");
        console.log("Copied to clipboard via execCommand fallback.");
      } catch (err) {
        console.error("Fallback copy failed", err);
        window.prompt("Browser blocked automatic copy. Press Ctrl+C to copy:", resultText);
      }
      document.body.removeChild(textArea);
    }
    flashSuccess();

  } catch (e) {
    console.error("AI Request Failed:", e);
    inputBuffer = "Error: " + e.message;
    drawCommandMode();
    setTimeout(() => { revertToDefault(); }, 3000);
  }
}

function flashSuccess() {
  flashOverlay.classList.remove('flash');
  // Trigger reflow
  void flashOverlay.offsetWidth;
  flashOverlay.classList.add('flash');

  setTimeout(() => {
    revertToDefault();
  }, 200);
}

function revertToDefault() {
  aiState = 'default';
  body.className = "";

  gamePaused = false;
  draw();
}

function downloadVsix() {
  const link = document.createElement('a');
  link.href = 'trimath-1.0.0.vsix';
  link.download = 'trimath-1.0.0.vsix';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Initial setup
resizeCanvas();
draw();
