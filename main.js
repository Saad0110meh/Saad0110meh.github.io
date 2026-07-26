// ==========================================
// 1. CONFIGURATION & DATA
// ==========================================
const PROJECTS = [
  {
    title: "Project Alpha",
    desc: "A high-performance C++ implementation of custom data structures and algorithm visualizer.",
    tech: ["C++", "CMake", "GDB"]
  },
  {
    title: "Interactive Web Room",
    desc: "Retro PS2-themed interactive portfolio featuring canvas animations and custom modal systems.",
    tech: ["HTML5 Canvas", "JavaScript", "CSS3"]
  },
  {
    title: "Systems & Architecture",
    desc: "RISC-V assembly experiments and hardware-level cache controller simulations.",
    tech: ["RISC-V", "Assembly", "Verilog"]
  }
];

const BIO_TEXT = "Hi, I'm sleepyhead! Computer Science Engineering student passionate about lower-level systems programming, graphics, and interactive retro experiences.";
const SKILLS = ["C++", "JavaScript", "Git", "CMake", "RISC-V", "HTML5 Canvas"];

const ACHIEVEMENTS = [
  { id: "booted", title: "System Booted", desc: "Successfully booted into the matrix." },
  { id: "table", title: "Tavern Guest", desc: "Checked out the dining table projects." },
  { id: "counter", title: "Innkeeper", desc: "Read through the bio at the counter." },
  { id: "chest", title: "Loot Collector", desc: "Opened the treasure chest." }
];

// Unlocked achievements storage
let unlockedAchievements = JSON.parse(localStorage.getItem('sleepyhead_achievements')) || ["booted"];

// ==========================================
// 2. CANVAS & ASSET SETUP
// ==========================================
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Function to handle full-screen resize
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// Initial size and event listener for window resizing
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Load Room Background Image
const roomBg = new Image();
roomBg.src = 'assets/room-bg.png';

// Load Player Sprite (16x16 Run-Sheet.png)
const playerSprite = new Image();
playerSprite.src = 'assets/16x16 Run-Sheet.png';

const SPRITE_WIDTH = 16;     // 16px frame width
const SPRITE_HEIGHT = 16;    // 16px frame height
const TOTAL_COLUMNS = 6;     // 6 animation frames per row
const SCALE = 4;             // Scaled size: 32x32px on canvas

const player = {
  x: canvas.width / 2 - (SPRITE_WIDTH * SCALE) / 2,
  y: canvas.height / 2 - (SPRITE_HEIGHT * SCALE) / 2,
  speed: 2,
  frameX: 0,
  frameY: 0,      // Row 0: Down, Row 2: Side, Row 4: Up
  facingRight: false,
  isMoving: false
};

// Animation framing
let gameFrame = 0;
const staggerFrames = 6; // Lower = faster running animation, Higher = slower

// Keyboard Input Tracker
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  handleInteractionInput(e);
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// ==========================================
// 3. TAVERN INTERACTIVE ZONES & BOUNDS
// ==========================================
// Coordinates aligned with the tavern room layout
const interactiveObjects = [
  {
    id: "table",
    name: "Dining Table",
    x: 120, y: 170, w: 80, h: 50,
    panel: "projects"
  },
  {
    id: "counter",
    name: "Reception Counter",
    x: 230, y: 180, w: 90, h: 40,
    panel: "bio"
  },
  {
    id: "chest",
    name: "Treasure Chest",
    x: 240, y: 80, w: 40, h: 40,
    panel: "achievements"
  },
  {
    id: "fireplace",
    name: "Warm Fireplace",
    x: 380, y: 180, w: 50, h: 60,
    panel: "bio"
  }
];

let activeObject = null;
let isModalOpen = false;

// Outer playable floor bounds to keep player inside the wooden floor
function isWalkable(nextX, nextY) {
  const pWidth = SPRITE_WIDTH * SCALE;
  const pHeight = SPRITE_HEIGHT * SCALE;

  // Keep player inside screen margins
  if (nextX < 0 || nextX + pWidth > canvas.width) return false;
  if (nextY < 0 || nextY + pHeight > canvas.height) return false;

  return true;
}

// ==========================================
// 4. BOOT SEQUENCE & SCREEN TRANSITION
// ==========================================
const bootPrompt = document.getElementById('boot-prompt');
const bootVideoWrap = document.getElementById('boot-video-wrap');
const bootVideo = document.getElementById('boot-video');
const gameWrap = document.getElementById('game-wrap');

function startBootSequence() {
  if (!bootPrompt) return;
  bootPrompt.classList.add('hidden');
  bootVideoWrap.classList.remove('hidden');

  bootVideo.play().catch(err => {
    console.warn("Autoplay blocked or video missing, skipping to game:", err);
    transitionToGame();
  });

  bootVideo.addEventListener('ended', transitionToGame);
}

function transitionToGame() {
  bootVideo.pause();
  bootVideoWrap.classList.add('hidden');
  gameWrap.classList.remove('hidden');
  
  unlockAchievement('booted');
  requestAnimationFrame(gameLoop);
}

// Global click/key listeners for boot activation
document.body.addEventListener('click', startBootSequence, { once: true });
document.body.addEventListener('keydown', (e) => {
  if (bootPrompt && !bootPrompt.classList.contains('hidden')) {
    startBootSequence();
  } else if (e.key === 'Escape' && !bootVideoWrap.classList.contains('hidden')) {
    transitionToGame();
  }
});

// ==========================================
// 5. GAME LOOP & MOVEMENT
// ==========================================
function updatePlayer() {
  if (isModalOpen) return; // Freeze movement when menu is active

  player.isMoving = false;
  let nextX = player.x;
  let nextY = player.y;

  if (keys['w'] || keys['arrowup']) {
    nextY -= player.speed;
    player.frameY = 4; // Row 4: Facing Up
    player.isMoving = true;
  }
  if (keys['s'] || keys['arrowdown']) {
    nextY += player.speed;
    player.frameY = 0; // Row 0: Facing Down
    player.isMoving = true;
  }
  if (keys['a'] || keys['arrowleft']) {
    nextX -= player.speed;
    player.frameY = 2; // Row 2: Facing Side (Left)
    player.facingRight = false;
    player.isMoving = true;
  }
  if (keys['d'] || keys['arrowright']) {
    nextX += player.speed;
    player.frameY = 2; // Row 2: Facing Side (Right)
    player.facingRight = true;
    player.isMoving = true;
  }

  // Apply movement if destination is walkable
  if (isWalkable(nextX, nextY)) {
    player.x = nextX;
    player.y = nextY;
  }

  checkProximity();
}

function checkProximity() {
  const interactPrompt = document.getElementById('interact-prompt');
  const pWidth = SPRITE_WIDTH * SCALE;
  const pHeight = SPRITE_HEIGHT * SCALE;

  activeObject = null;

  for (let obj of interactiveObjects) {
    const padding = 15;
    if (
      player.x < obj.x + obj.w + padding &&
      player.x + pWidth > obj.x - padding &&
      player.y < obj.y + obj.h + padding &&
      player.y + pHeight > obj.y - padding
    ) {
      activeObject = obj;
      break;
    }
  }

  if (activeObject && !isModalOpen) {
    interactPrompt.classList.remove('hidden');
    interactPrompt.innerText = `Press E for ${activeObject.name}`;
  } else {
    interactPrompt.classList.add('hidden');
  }
}

function render() {
  // Clear Canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 1. Draw 512x384 Tavern Background
  if (roomBg.complete && roomBg.naturalWidth !== 0) {
    ctx.drawImage(roomBg, 0, 0, canvas.width, canvas.height);
  } else {
    // Fallback background while image loads
    ctx.fillStyle = '#181825';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. Cycle Animation Frames (0 to 5)
  if (player.isMoving) {
    if (gameFrame % staggerFrames === 0) {
      player.frameX = (player.frameX + 1) % TOTAL_COLUMNS;
    }
    gameFrame++;
  } else {
    player.frameX = 0; // Standing idle frame
  }

  // 3. Render Player Character
  if (playerSprite.complete && playerSprite.naturalWidth !== 0) {
    ctx.save();

    if (player.facingRight && player.frameY === 2) {
      // Flip character horizontally when walking right
      ctx.translate(Math.floor(player.x) + (SPRITE_WIDTH * SCALE), Math.floor(player.y));
      ctx.scale(-1, 1);
      
      ctx.drawImage(
        playerSprite,
        player.frameX * SPRITE_WIDTH,
        player.frameY * SPRITE_HEIGHT,
        SPRITE_WIDTH,
        SPRITE_HEIGHT,
        0,
        0,
        SPRITE_WIDTH * SCALE,
        SPRITE_HEIGHT * SCALE
      );
    } else {
      // Normal non-flipped render (Down, Up, Left)
      ctx.drawImage(
        playerSprite,
        player.frameX * SPRITE_WIDTH,
        player.frameY * SPRITE_HEIGHT,
        SPRITE_WIDTH,
        SPRITE_HEIGHT,
        Math.floor(player.x),
        Math.floor(player.y),
        SPRITE_WIDTH * SCALE,
        SPRITE_HEIGHT * SCALE
      );
    }

    ctx.restore();
  } else {
    // Fallback block if image fails to load
    ctx.fillStyle = '#f38ba8';
    ctx.fillRect(player.x, player.y, SPRITE_WIDTH * SCALE, SPRITE_HEIGHT * SCALE);
  }
}

function gameLoop() {
  updatePlayer();
  render();
  requestAnimationFrame(gameLoop);
}

// ==========================================
// 6. PS2 MEMORY CARD MODAL SYSTEM
// ==========================================
const modalOverlay = document.getElementById('modal-overlay');

function handleInteractionInput(e) {
  const key = e.key.toLowerCase();

  if (key === 'e' && activeObject && !isModalOpen) {
    openModal(activeObject.panel);
    if (activeObject.id === 'table') unlockAchievement('table');
    if (activeObject.id === 'counter') unlockAchievement('counter');
    if (activeObject.id === 'chest') unlockAchievement('chest');
  }

  if ((key === 'escape' || key === 'o') && isModalOpen) {
    closeModal();
  }
}

function openModal(panelType) {
  isModalOpen = true;
  modalOverlay.classList.remove('hidden');

  document.getElementById('interact-prompt').classList.add('hidden');

  document.querySelectorAll('.memcard-panel').forEach(panel => {
    if (panel.dataset.panel === panelType) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  if (panelType === 'projects') renderProjects();
  if (panelType === 'bio') renderBio();
  if (panelType === 'achievements') renderAchievements();
}

function closeModal() {
  isModalOpen = false;
  modalOverlay.classList.add('hidden');
}

// Dynamic Panel Content Renderers
function renderProjects() {
  const listEl = document.getElementById('projects-list');
  const detailEl = document.getElementById('projects-detail');
  
  listEl.innerHTML = '';
  PROJECTS.forEach((proj) => {
    const li = document.createElement('li');
    li.innerText = proj.title;
    li.onclick = () => {
      detailEl.innerHTML = `
        <h4>${proj.title}</h4>
        <p>${proj.desc}</p>
        <p><strong>Tech:</strong> ${proj.tech.join(', ')}</p>
      `;
    };
    listEl.appendChild(li);
  });
}

function renderBio() {
  document.getElementById('bio-copy').innerText = BIO_TEXT;
  const skillsEl = document.getElementById('skills-list');
  skillsEl.innerHTML = SKILLS.map(skill => `<li>${skill}</li>`).join('');
}

function renderAchievements() {
  const listEl = document.getElementById('achievements-list');
  listEl.innerHTML = '';
  
  ACHIEVEMENTS.forEach(ach => {
    const isUnlocked = unlockedAchievements.includes(ach.id);
    const li = document.createElement('li');
    li.style.color = isUnlocked ? '#a6e3a1' : '#6c7086';
    li.innerHTML = `${isUnlocked ? '★' : '☆'} <strong>${ach.title}</strong>: ${ach.desc}`;
    listEl.appendChild(li);
  });
}

function unlockAchievement(id) {
  if (!unlockedAchievements.includes(id)) {
    unlockedAchievements.push(id);
    localStorage.setItem('sleepyhead_achievements', JSON.stringify(unlockedAchievements));
  }
}