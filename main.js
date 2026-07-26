/* ================================================================
   sleepyhead — retro portfolio engine
   ----------------------------------------------------------------
   File map:
     1. CONTENT DATA        — edit this to change projects/bio/text
     2. BOOT SEQUENCE        — click-to-start -> video -> crossfade
     3. ASSET LOADER         — swap in your own image paths here
     4. GAME STATE           — player, room, interactive zones
     5. INPUT                — keyboard handling
     6. UPDATE / DRAW LOOP   — requestAnimationFrame game loop
     7. MODAL / MEMORY CARD  — PS2-style UI overlay system
     8. ACHIEVEMENTS         — localStorage-backed unlock tracker
   ================================================================ */


/* ================================================================
   1. CONTENT DATA
   Replace these arrays/strings with your own portfolio content.
   ================================================================ */
const PROJECTS = [
  { id: "proj1", title: "Project One", desc: "Describe project one here — stack, role, link." },
  { id: "proj2", title: "Project Two", desc: "Describe project two here — stack, role, link." },
  { id: "proj3", title: "Project Three", desc: "Describe project three here — stack, role, link." },
];

const BIO_TEXT =
  "Replace this with your own bio copy. Talk about who you are, " +
  "what you build, and what you're looking for.";

const SKILLS = ["JavaScript", "HTML/CSS", "Canvas API", "Game Design", "Pixel Art"];

// Every achievement the game can unlock. `id` is the localStorage key suffix.
const ACHIEVEMENT_DEFS = [
  { id: "booted",      label: "System Booted",        desc: "Watched the boot sequence." },
  { id: "explored",    label: "Explored the Room",     desc: "Moved the player for the first time." },
  { id: "sawProjects", label: "Checked the Desk",       desc: "Opened the Projects panel." },
  { id: "sawBio",      label: "Read the Bookshelf",     desc: "Opened the Bio panel." },
  { id: "sawTrophies", label: "Opened the Trophy Case", desc: "Opened the Achievements panel." },
];


/* ================================================================
   2. BOOT SEQUENCE
   Flow: black screen -> (user gesture) -> play video -> on 'ended'
   -> white flash -> reveal game canvas.
   ================================================================ */
const bootPrompt   = document.getElementById("boot-prompt");
const bootVideoWrap = document.getElementById("boot-video-wrap");
const bootVideo     = document.getElementById("boot-video");
const gameWrap       = document.getElementById("game-wrap");

let bootStarted = false;

function startBoot() {
  if (bootStarted) return;
  bootStarted = true;

  bootPrompt.classList.add("hidden");
  bootVideoWrap.classList.remove("hidden");

  // Play now that we're inside a user-gesture-triggered call stack,
  // so audio is allowed by the browser's autoplay policy.
  bootVideo.currentTime = 0;
  bootVideo.play().catch(() => {
    // If the mp4 asset is missing/unsupported during testing, don't
    // get stuck on a black screen — just proceed to the game.
    finishBoot();
  });

  bootVideo.addEventListener("ended", finishBoot, { once: true });

  // Allow skipping the intro with ESC for faster iteration/testing.
  window.addEventListener("keydown", skipIntroOnEsc);
}

function skipIntroOnEsc(e) {
  if (e.key === "Escape") finishBoot();
}

function finishBoot() {
  window.removeEventListener("keydown", skipIntroOnEsc);
  bootVideo.pause();

  // White flash crossfade
  const flash = document.createElement("div");
  flash.className = "flash-white active";
  document.body.appendChild(flash);

  bootVideoWrap.classList.add("hidden");
  gameWrap.classList.remove("hidden");

  unlockAchievement("booted");

  // Clean up the flash element after its animation completes.
  setTimeout(() => flash.remove(), 750);

  // Kick off the game loop once, on first reveal.
  requestAnimationFrame(gameLoop);
}

// Any click or keypress on the initial black screen starts the boot.
window.addEventListener("click", startBoot, { once: true });
window.addEventListener("keydown", startBoot, { once: true });


/* ================================================================
   3. ASSET LOADER
   Point these paths at your own art. Until an image finishes
   loading (or if the path 404s), `loaded` stays false and the draw
   functions fall back to colored placeholder boxes/grid lines, so
   the game stays playable while you're still producing art.
   ================================================================ */
function loadImage(src) {
  const img = new Image();
  const handle = { img, loaded: false };
  img.onload = () => { handle.loaded = true; };
  img.onerror = () => { handle.loaded = false; };
  img.src = src;
  return handle;
}

// PLUG IN YOUR ASSETS HERE:
//   playerSpriteSheet — expected layout: 4 rows (down/left/right/up)
//                       x N columns of 32x32 frames, walk-cycle.
//   roomMapImage      — full background/tilemap for the room, drawn
//                       at canvas resolution (512x384 by default).
//   interactivesImage — optional spritesheet for desk/bookshelf/etc,
//                       drawn on top of the room map.
const assets = {
  playerSpriteSheet: loadImage("assets/player-spritesheet.png"),
  roomMapImage:       loadImage("assets/room-map.png"),
  interactivesImage:  loadImage("assets/interactives.png"),
};

// Frame dimensions for the player spritesheet — adjust to match your art.
const PLAYER_FRAME_W = 32;
const PLAYER_FRAME_H = 32;
const PLAYER_FRAMES_PER_ROW = 4; // e.g. 4-frame walk cycle per direction
// Row index per facing direction within playerSpriteSheet:
const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };


/* ================================================================
   4. GAME STATE
   ================================================================ */
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const CANVAS_W = canvas.width;   // 512
const CANVAS_H = canvas.height;  // 384

const player = {
  x: CANVAS_W / 2 - 16,
  y: CANVAS_H / 2 - 16,
  w: 28,
  h: 28,
  speed: 120,          // pixels per second
  dir: "down",
  moving: false,
  animFrame: 0,
  animTimer: 0,
};

// Interactive zones. Each has a rectangle (x, y, w, h), a label,
// and a `panel` key matching a .memcard-panel[data-panel] in the HTML.
// Adjust positions/sizes to match your own room-map artwork.
const INTERACTIVE_ZONES = [
  { id: "desk",   x: 40,  y: 40,  w: 80, h: 56, label: "Computer Desk", panel: "projects" },
  { id: "shelf",  x: 392, y: 40,  w: 80, h: 56, label: "Bookshelf",      panel: "bio" },
  { id: "trophy", x: 392, y: 280, w: 80, h: 56, label: "Trophy Case",    panel: "achievements" },
];

const INTERACT_RANGE = 26; // extra px around a zone that counts as "in range"

let nearestZone = null;    // zone the player is currently close enough to use
let hasMovedOnce = false;  // for the "Explored the Room" achievement
let gameActive = false;    // false while a modal is open (pauses movement)


/* ================================================================
   5. INPUT
   ================================================================ */
const keys = { up: false, down: false, left: false, right: false };

const KEY_MAP = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};

window.addEventListener("keydown", (e) => {
  if (KEY_MAP[e.key] !== undefined) keys[KEY_MAP[e.key]] = true;

  if (e.key === "e" || e.key === "E") {
    if (!isModalOpen() && nearestZone) openModal(nearestZone.panel);
  }

  if (e.key === "Escape" || e.key === "o" || e.key === "O") {
    if (isModalOpen()) closeModal();
  }
});

window.addEventListener("keyup", (e) => {
  if (KEY_MAP[e.key] !== undefined) keys[KEY_MAP[e.key]] = false;
});

// Clicking directly on a rendered interactive object also opens its panel.
// We translate the click's canvas-space coordinates and hit-test zones.
canvas.addEventListener("click", (e) => {
  if (isModalOpen()) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  for (const zone of INTERACTIVE_ZONES) {
    if (cx >= zone.x && cx <= zone.x + zone.w && cy >= zone.y && cy <= zone.y + zone.h) {
      openModal(zone.panel);
      break;
    }
  }
});


/* ================================================================
   6. UPDATE / DRAW LOOP
   ================================================================ */
let lastTime = 0;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // clamp big pauses
  lastTime = timestamp;

  if (gameActive) update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  let dx = 0, dy = 0;
  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;

  player.moving = dx !== 0 || dy !== 0;

  if (player.moving) {
    // Normalize diagonal movement so it isn't faster than cardinal movement.
    const len = Math.hypot(dx, dy) || 1;
    dx = (dx / len) * player.speed * dt;
    dy = (dy / len) * player.speed * dt;

    // Facing direction — prioritize the dominant axis.
    if (Math.abs(dx) > Math.abs(dy)) {
      player.dir = dx > 0 ? "right" : "left";
    } else if (dy !== 0) {
      player.dir = dy > 0 ? "down" : "up";
    }

    player.x += dx;
    player.y += dy;

    // Boundary collision: keep the player inside the room.
    player.x = Math.max(0, Math.min(CANVAS_W - player.w, player.x));
    player.y = Math.max(0, Math.min(CANVAS_H - player.h, player.y));

    if (!hasMovedOnce) {
      hasMovedOnce = true;
      unlockAchievement("explored");
    }

    // Walk-cycle animation timer.
    player.animTimer += dt;
    if (player.animTimer > 0.12) {
      player.animTimer = 0;
      player.animFrame = (player.animFrame + 1) % PLAYER_FRAMES_PER_ROW;
    }
  } else {
    player.animFrame = 0; // idle frame
  }

  updateNearestZone();
}

function updateNearestZone() {
  nearestZone = null;
  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;

  for (const zone of INTERACTIVE_ZONES) {
    const closestX = Math.max(zone.x, Math.min(px, zone.x + zone.w));
    const closestY = Math.max(zone.y, Math.min(py, zone.y + zone.h));
    const dist = Math.hypot(px - closestX, py - closestY);
    if (dist <= INTERACT_RANGE) {
      nearestZone = zone;
      break;
    }
  }

  const promptEl = document.getElementById("interact-prompt");
  if (nearestZone) {
    promptEl.classList.remove("hidden");
    // Position the prompt above the player in *screen* space.
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / CANVAS_W;
    const scaleY = rect.height / CANVAS_H;
    const screenX = rect.left + (player.x + player.w / 2) * scaleX;
    const screenY = rect.top + player.y * scaleY;
    promptEl.style.left = `${screenX}px`;
    promptEl.style.top = `${screenY - 10}px`;
  } else {
    promptEl.classList.add("hidden");
  }
}

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawRoom();
  drawInteractiveZones();
  drawPlayer();
}

function drawRoom() {
  if (assets.roomMapImage.loaded) {
    ctx.drawImage(assets.roomMapImage.img, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    // Placeholder floor: warm wood tone + grid so tile alignment
    // is easy to reason about before the real tilemap is dropped in.
    ctx.fillStyle = "#3b2a20";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const grid = 32;
    for (let x = 0; x <= CANVAS_W; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_H; y += grid) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }
  }
}

function drawInteractiveZones() {
  for (const zone of INTERACTIVE_ZONES) {
    if (assets.interactivesImage.loaded) {
      // NOTE: once you have a real spritesheet, replace this with a
      // drawImage() call using per-zone source-rect coordinates.
      ctx.drawImage(assets.interactivesImage.img, zone.x, zone.y, zone.w, zone.h);
    } else {
      // Placeholder colored box + label so zones are easy to spot/test.
      const isNear = nearestZone === zone;
      ctx.fillStyle = isNear ? "rgba(255, 215, 107, 0.85)" : "rgba(111, 232, 255, 0.55)";
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      ctx.strokeStyle = "#0b0f2a";
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

      ctx.fillStyle = "#0b0f2a";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(zone.label, zone.x + zone.w / 2, zone.y + zone.h / 2 + 3);
    }
  }
}

function drawPlayer() {
  if (assets.playerSpriteSheet.loaded) {
    const row = DIR_ROW[player.dir];
    const sx = player.animFrame * PLAYER_FRAME_W;
    const sy = row * PLAYER_FRAME_H;
    ctx.drawImage(
      assets.playerSpriteSheet.img,
      sx, sy, PLAYER_FRAME_W, PLAYER_FRAME_H,
      player.x, player.y, player.w, player.h
    );
  } else {
    // Placeholder: a colored rectangle with a small triangle indicating
    // facing direction, so movement/direction logic is testable without art.
    ctx.fillStyle = "#e0895c";
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.strokeStyle = "#3b2a20";
    ctx.strokeRect(player.x, player.y, player.w, player.h);

    ctx.fillStyle = "#3b2a20";
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    ctx.beginPath();
    const arrows = {
      down:  [[cx, cy + 8], [cx - 5, cy + 2], [cx + 5, cy + 2]],
      up:    [[cx, cy - 8], [cx - 5, cy - 2], [cx + 5, cy - 2]],
      left:  [[cx - 8, cy], [cx - 2, cy - 5], [cx - 2, cy + 5]],
      right: [[cx + 8, cy], [cx + 2, cy - 5], [cx + 2, cy + 5]],
    }[player.dir];
    ctx.moveTo(arrows[0][0], arrows[0][1]);
    ctx.lineTo(arrows[1][0], arrows[1][1]);
    ctx.lineTo(arrows[2][0], arrows[2][1]);
    ctx.closePath();
    ctx.fill();
  }
}


/* ================================================================
   7. MODAL / MEMORY CARD SYSTEM
   ================================================================ */
const modalOverlay = document.getElementById("modal-overlay");
const memcardTitle = document.getElementById("memcard-title");
const panels = document.querySelectorAll(".memcard-panel");

const PANEL_TITLES = {
  projects: "PROJECTS",
  bio: "BIO & SKILLS",
  achievements: "ACHIEVEMENTS",
};

// Fires once per panel the first time it's opened, to unlock its achievement.
const PANEL_ACHIEVEMENT = {
  projects: "sawProjects",
  bio: "sawBio",
  achievements: "sawTrophies",
};

function isModalOpen() {
  return !modalOverlay.classList.contains("hidden");
}

function openModal(panelKey) {
  gameActive = false; // pause player input/movement while browsing the UI
  document.getElementById("interact-prompt").classList.add("hidden");

  memcardTitle.textContent = PANEL_TITLES[panelKey] || "MEMORY CARD";

  panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === panelKey));

  if (panelKey === "achievements") renderAchievements();

  modalOverlay.classList.remove("hidden");

  if (PANEL_ACHIEVEMENT[panelKey]) unlockAchievement(PANEL_ACHIEVEMENT[panelKey]);
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  gameActive = true;
}

// Clicking the dark backdrop (outside the window) also closes the modal.
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

/* ---- Projects panel wiring ---- */
function buildProjectsList() {
  const list = document.getElementById("projects-list");
  const detail = document.getElementById("projects-detail");
  list.innerHTML = "";

  PROJECTS.forEach((proj, i) => {
    const li = document.createElement("li");
    li.textContent = proj.title;
    li.tabIndex = 0;
    li.addEventListener("click", () => {
      list.querySelectorAll("li").forEach((el) => el.classList.remove("selected"));
      li.classList.add("selected");
      detail.innerHTML = `<strong>${proj.title}</strong><br>${proj.desc}`;
    });
    list.appendChild(li);
  });
}
buildProjectsList();

/* ---- Bio panel wiring ---- */
document.getElementById("bio-copy").textContent = BIO_TEXT;
(function buildSkills() {
  const list = document.getElementById("skills-list");
  SKILLS.forEach((skill) => {
    const li = document.createElement("li");
    li.textContent = skill;
    list.appendChild(li);
  });
})();


/* ================================================================
   8. ACHIEVEMENTS (localStorage)
   ================================================================ */
const STORAGE_KEY = "sleepyhead_achievements";

function getUnlockedAchievements() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function unlockAchievement(id) {
  const unlocked = getUnlockedAchievements();
  if (unlocked[id]) return; // already unlocked, no-op
  unlocked[id] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(unlocked));

  // If the achievements panel happens to be open, refresh it live.
  if (isModalOpen() && document.querySelector('[data-panel="achievements"]').classList.contains("active")) {
    renderAchievements();
  }
}

function renderAchievements() {
  const unlocked = getUnlockedAchievements();
  const list = document.getElementById("achievements-list");
  list.innerHTML = "";

  ACHIEVEMENT_DEFS.forEach((def) => {
    const isUnlocked = !!unlocked[def.id];
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${def.label}${isUnlocked ? "" : " (locked)"}</span>
      <span class="lock-icon">${isUnlocked ? "&#9733;" : "&#128274;"}</span>
    `;
    li.title = def.desc;
    if (!isUnlocked) li.style.opacity = "0.55";
    list.appendChild(li);
  });
}
