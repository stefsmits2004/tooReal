/* wordle.js — standalone Wordle game + solver
   ============================================================ */

(function () {
  "use strict";

  const MAX_ROWS = 6;
  const WORD_LEN = 5;

  /* =========================================================
     STATE
     ========================================================= */
  let mode = "play";
  let currentAnswer = "";
  let currentRow = 0;
  let currentCol = 0;
  let gameOver = false;
  let currentGuess = [];
  let board = [];
  let solverGuesses = [];
  let solverCurrentInput = "";
  let WORDS = []; // Will be loaded from file
  let wordsLoaded = false; // Track if words have been loaded
  let firstGuess = (localStorage.getItem("wdl_first_guess") || "least").toLowerCase();
  
  // Validate stored first guess, reset to default if invalid
  if (!firstGuess || !/^[a-z]{5}$/.test(firstGuess)) {
    firstGuess = "least";
  }

  const settings = JSON.parse(localStorage.getItem("wdl_settings") || "{}");
  if (settings.hardMode === undefined) settings.hardMode = false;
  if (settings.darkMode === undefined) settings.darkMode = "system";
  if (settings.colorBlind === undefined) settings.colorBlind = false;
  if (settings.useFirstGuess === undefined) settings.useFirstGuess = true;

  let stats = JSON.parse(localStorage.getItem("wdl_stats") || JSON.stringify({
    played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0,0,0,0,0,0]
  }));

  /* =========================================================
     WORD LIST LOADER
     ========================================================= */
  async function loadWordsFromFile() {
    try {
      const response = await fetch("assets/wordle/5words.txt");
      if (!response.ok) {
        throw new Error(`Failed to load word list: ${response.status}`);
      }
      const text = await response.text();
      // Parse words: split by newline, trim whitespace, filter empty lines, convert to lowercase
      WORDS = text
        .split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length === WORD_LEN && /^[a-z]+$/.test(word));
      
      if (WORDS.length === 0) {
        throw new Error("No valid words found in word list");
      }
      
      wordsLoaded = true;
      console.log(`Loaded ${WORDS.length} words from 5words.txt`);
      return true;
    } catch (error) {
      console.error("Error loading word list:", error);
      // Fallback: show error to user
      showToast("Error loading word list. Please refresh the page.");
      return false;
    }
  }

  /* =========================================================
     BOOT
     ========================================================= */
  document.addEventListener("DOMContentLoaded", async () => {
    // Load words first before initializing game
    const wordsReady = await loadWordsFromFile();
    if (!wordsReady) {
      console.error("Failed to load words, aborting initialization");
      return;
    }

    applySettings();
    buildBoard();
    buildKeyboard();
    startNewGame();
    attachEvents();
    updateFirstGuessBar();
  });

  /* =========================================================
     SETTINGS
     ========================================================= */
  function applySettings() {
    const dm = settings.darkMode;
    if (dm === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else if (dm === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    }
    document.documentElement.setAttribute("data-colorblind", settings.colorBlind ? "true" : "false");
  }

  function saveSettings() {
    localStorage.setItem("wdl_settings", JSON.stringify(settings));
  }

  /* =========================================================
     BOARD
     ========================================================= */
  function buildBoard() {
    const boardEl = document.getElementById("board");
    boardEl.innerHTML = "";
    board = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      const row = [];
      const rowEl = document.createElement("div");
      rowEl.className = "wordle-row";
      rowEl.id = `row-${r}`;
      for (let c = 0; c < WORD_LEN; c++) {
        const tile = document.createElement("div");
        tile.className = "wordle-tile";
        tile.id = `tile-${r}-${c}`;
        const capturedR = r;
        const capturedC = c;
        tile.addEventListener("click", () => {
          if (mode === "solve" && capturedR < currentRow) {
            cyclesolverTile(capturedR, capturedC);
          }
        });
        rowEl.appendChild(tile);
        row.push({ letter: "", state: -1 });
      }
      boardEl.appendChild(rowEl);
      board.push(row);
    }
  }

  /* =========================================================
     KEYBOARD
     ========================================================= */
  const KB_ROWS = [
    ["Q","W","E","R","T","Y","U","I","O","P"],
    ["A","S","D","F","G","H","J","K","L"],
    ["ENTER","Z","X","C","V","B","N","M","BACK"]
  ];

  function buildKeyboard() {
    const kb = document.getElementById("keyboard");
    kb.innerHTML = "";
    KB_ROWS.forEach(letters => {
      const row = document.createElement("div");
      row.className = "keyboard-row";
      letters.forEach(l => {
        const btn = document.createElement("button");
        btn.type = "button";
        const isWide = l === "ENTER" || l === "BACK";
        btn.className = "key" + (isWide ? " wide" : "");
        btn.textContent = l === "BACK" ? "\u232B" : l;
        btn.setAttribute("aria-label", l === "BACK" ? "Backspace" : l);
        btn.id = l === "BACK" ? "key-BACKSPACE" : l === "ENTER" ? "key-ENTER" : `key-${l}`;
        const keyVal = l === "BACK" ? "BACKSPACE" : l;
        // pointerdown + preventDefault stops the physical keyboard from also firing
        btn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          handleKey(keyVal);
        });
        row.appendChild(btn);
      });
      kb.appendChild(row);
    });
  }

  const keyColors = {};

  function updateKeyColor(letter, patternChar) {
    const priority = { g: 2, y: 1, b: 0 };
    const cur = keyColors[letter] !== undefined ? keyColors[letter] : -1;
    const next = priority[patternChar];
    if (next > cur) {
      keyColors[letter] = next;
      const el = document.getElementById(`key-${letter}`);
      if (!el) return;
      el.className = el.className.replace(/ is-(gray|yellow|green)/g, "");
      if (next === 2) el.classList.add("is-green");
      else if (next === 1) el.classList.add("is-yellow");
      else el.classList.add("is-gray");
    }
  }

  function resetKeyboardColors() {
    Object.keys(keyColors).forEach(k => delete keyColors[k]);
    document.querySelectorAll(".key").forEach(k => {
      k.className = k.className.replace(/ is-(gray|yellow|green)/g, "");
    });
  }

  /* =========================================================
     NEW GAME
     ========================================================= */
  function startNewGame() {
    const wordList = WORDS.map(w => w.toUpperCase()).filter(w => /^[A-Z]{5}$/.test(w));
    currentAnswer = wordList[Math.floor(Math.random() * wordList.length)];
    currentRow = 0;
    currentCol = 0;
    gameOver = false;
    currentGuess = [];
    solverGuesses = [];
    buildBoard();
    resetKeyboardColors();
    hideSolverPanel();
    removeSolverResetButton();
    document.getElementById("word-reveal").style.display = "none";
    document.getElementById("play-again-btn").classList.remove("visible");

    if (settings.useFirstGuess && firstGuess && /^[a-z]{5}$/.test(firstGuess) && WORDS.includes(firstGuess)) {
      const fg = firstGuess.toUpperCase();
      for (let i = 0; i < 5; i++) {
        board[0][i].letter = fg[i];
        const tile = getTile(0, i);
        tile.textContent = fg[i];
        tile.classList.add("has-letter");
      }
      currentGuess = fg.split("");
      currentCol = 5;
    }
  }

  /* =========================================================
     KEY ROUTING
     ========================================================= */
  function handleKey(key) {
    if (document.querySelector(".slide-panel.open")) return;
    key = key.toUpperCase();
    if (mode === "play") handlePlayKey(key);
    else handleSolveKey(key);
  }

  /* ---- PLAY ---- */
  function handlePlayKey(key) {
    if (gameOver) return;
    if (key === "ENTER") submitGuess();
    else if (key === "BACKSPACE") deleteLetter();
    else if (/^[A-Z]$/.test(key)) addLetter(key);
  }

  function addLetter(letter) {
    if (currentCol >= WORD_LEN) return;
    board[currentRow][currentCol].letter = letter;
    currentGuess.push(letter);
    const tile = getTile(currentRow, currentCol);
    tile.textContent = letter;
    tile.className = "wordle-tile has-letter";
    currentCol++;
  }

  function deleteLetter() {
    if (currentCol <= 0) return;
    currentCol--;
    board[currentRow][currentCol].letter = "";
    currentGuess.pop();
    const tile = getTile(currentRow, currentCol);
    tile.textContent = "";
    tile.className = "wordle-tile";
  }

  function submitGuess() {
    if (currentCol < WORD_LEN) { shakeRow(currentRow); showToast("Not enough letters"); return; }
    const word = currentGuess.join("");
    const wordListUpper = WORDS.map(w => w.toUpperCase());
    if (!wordListUpper.includes(word)) { shakeRow(currentRow); showToast("Not in word list"); return; }
    if (settings.hardMode) {
      const err = validateHardMode(word);
      if (err) { shakeRow(currentRow); showToast(err); return; }
    }
    revealRow(word, currentRow, () => {
      const won = word === currentAnswer;
      if (won) {
        setTimeout(() => {
          bounceRow(currentRow);
          recordResult(currentRow + 1);
          gameOver = true;
          fireConfetti();
          document.getElementById("play-again-btn").classList.add("visible");
        }, 300);
      } else if (currentRow === MAX_ROWS - 1) {
        recordResult(null);
        gameOver = true;
        showWordReveal(currentAnswer);
        document.getElementById("play-again-btn").classList.add("visible");
      } else {
        currentRow++;
        currentCol = 0;
        currentGuess = [];
      }
    });
  }

  function revealRow(word, rowIdx, cb) {
    const pattern = buildPattern(word.toLowerCase(), currentAnswer.toLowerCase());
    const DELAY = 300;
    pattern.split("").forEach((p, i) => {
      const tile = getTile(rowIdx, i);
      setTimeout(() => {
        tile.style.transition = "transform 0.25s ease";
        tile.style.transform = "rotateX(90deg)";
        setTimeout(() => {
          tile.classList.remove("has-letter");
          if (p === "g") tile.className = "wordle-tile is-green";
          else if (p === "y") tile.className = "wordle-tile is-yellow";
          else tile.className = "wordle-tile is-gray";
          tile.textContent = word[i];
          board[rowIdx][i].state = p === "g" ? 2 : p === "y" ? 1 : 0;
          tile.style.transform = "rotateX(0deg)";
          updateKeyColor(word[i], p);
        }, 250);
      }, i * DELAY);
    });
    setTimeout(() => {
      // Store guess and pattern for solver in play mode
      if (mode === "play") {
        solverGuesses[rowIdx] = { word: word.toLowerCase(), pattern: pattern };
        solveCalc();
      }
      cb();
    }, 4 * DELAY + 350);
  }

  function validateHardMode(word) {
    for (let r = 0; r < currentRow; r++) {
      for (let c = 0; c < WORD_LEN; c++) {
        const s = board[r][c].state;
        const l = board[r][c].letter;
        if (s === 2 && word[c] !== l) return `Position ${c+1} must be ${l}`;
        if (s === 1 && !word.includes(l)) return `Guess must contain ${l}`;
      }
    }
    return null;
  }

  /* ---- SOLVE ---- */
  function handleSolveKey(key) {
    if (currentRow >= MAX_ROWS) return;
    if (key === "ENTER") {
      if (solverCurrentInput.length === 5) {
        commitSolverGuess(solverCurrentInput.toLowerCase());
        solverCurrentInput = "";
        refreshSolverInputRow();
      } else {
        shakeRow(currentRow);
        showToast("Not enough letters");
      }
    } else if (key === "BACKSPACE") {
      solverCurrentInput = solverCurrentInput.slice(0, -1);
      refreshSolverInputRow();
    } else if (/^[A-Z]$/.test(key) && solverCurrentInput.length < 5) {
      solverCurrentInput += key;
      refreshSolverInputRow();
    }
  }

  function refreshSolverInputRow() {
    if (currentRow >= MAX_ROWS) return;
    for (let c = 0; c < WORD_LEN; c++) {
      const tile = getTile(currentRow, c);
      const letter = solverCurrentInput[c] || "";
      tile.textContent = letter;
      tile.className = "wordle-tile" + (letter ? " has-letter" : "");
    }
  }

  function commitSolverGuess(word) {
    const wordListUpper = WORDS.map(w => w.toUpperCase());
    if (!wordListUpper.includes(word.toUpperCase())) { 
      shakeRow(currentRow); 
      showToast("Not in word list"); 
      return; 
    }
    for (let c = 0; c < WORD_LEN; c++) {
      board[currentRow][c].letter = word[c].toUpperCase();
      board[currentRow][c].state = 0;
      const tile = getTile(currentRow, c);
      tile.textContent = word[c].toUpperCase();
      tile.className = "wordle-tile is-gray";
    }
    solverGuesses[currentRow] = { word, pattern: "bbbbb" };
    currentRow++;
    solveCalc();
  }

  function cyclesolverTile(r, c) {
    const tile = getTile(r, c);
    const cur = board[r][c].state;
    const next = (cur + 1) % 3;
    board[r][c].state = next;
    tile.className = "wordle-tile " + ["is-gray","is-yellow","is-green"][next];
    let pat = "";
    for (let col = 0; col < WORD_LEN; col++) {
      const s = board[r][col].state;
      pat += s === 2 ? "g" : s === 1 ? "y" : "b";
    }
    if (!solverGuesses[r]) solverGuesses[r] = { word: "", pattern: "bbbbb" };
    solverGuesses[r].pattern = pat;
    solveCalc();
  }

  /* =========================================================
     SOLVER CALC
     ========================================================= */
  function buildPattern(guess, target) {
    let pattern = Array(5).fill("");
    let counts = {};
    for (let c of target) counts[c] = (counts[c] || 0) + 1;
    for (let i = 0; i < 5; i++) {
      if (guess[i] === target[i]) { pattern[i] = "g"; counts[guess[i]]--; }
    }
    for (let i = 0; i < 5; i++) {
      if (!pattern[i]) {
        if (counts[guess[i]] > 0) { pattern[i] = "y"; counts[guess[i]]--; }
        else pattern[i] = "b";
      }
    }
    return pattern.join("");
  }

  function entropy(guess, words) {
    let pc = {};
    for (let t of words) { let p = buildPattern(guess, t); pc[p] = (pc[p] || 0) + 1; }
    let total = words.length, e = 0;
    for (let c of Object.values(pc)) { let p = c / total; e += p * Math.log2(1 / p); }
    return e;
  }

  function minimax(guess, words) {
    let pc = {};
    for (let t of words) { let p = buildPattern(guess, t); pc[p] = (pc[p] || 0) + 1; }
    return Math.max(...Object.values(pc));
  }

  function scoredBestGuesses(words) {
    if (!words.length) return [];
    let scored = words.map(w => {
      const mm = minimax(w, words);
      const ent = entropy(w, words);
      return { word: w, mm, ent, score: mm * 1000 - ent };
    });
    scored.sort((a, b) => a.score - b.score);
    const bestScore = scored[0].score;
    return scored.filter(s => s.score === bestScore).slice(0, 8);
  }

  function solveCalc() {
    let filtered = WORDS.map(w => w.toLowerCase());
    const activeGuesses = (solverGuesses || []).filter(Boolean).filter(g => g.word);
    for (const g of activeGuesses) {
      filtered = filtered.filter(w => buildPattern(g.word, w) === g.pattern);
    }

    const possEl = document.getElementById("possible-words-list");
    possEl.innerHTML = "";
    filtered.forEach(w => {
      const span = document.createElement("span");
      span.className = "possible-word";
      span.textContent = w.toUpperCase();
      span.addEventListener("click", () => applyWordToInput(w));
      possEl.appendChild(span);
    });
    document.getElementById("possible-count").textContent = `(${filtered.length})`;

    const bestEl = document.getElementById("best-guess-area");
    bestEl.innerHTML = "";
    const bests = scoredBestGuesses(filtered);
    bests.forEach(b => {
      const item = document.createElement("div");
      item.className = "best-guess-item";
      item.innerHTML = `
        <span class="best-guess-word">${b.word.toUpperCase()}</span>
        <span class="best-guess-score">${b.mm}</span>`;
      item.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        applyWordToInput(b.word);
      });
      bestEl.appendChild(item);
    });

    if (mode === "solve" || mode === "play") {
      showSolverPanel();
    }
  }

  function applyWordToInput(word) {
    const upper = word.toUpperCase();
    if (mode === "solve") {
      solverCurrentInput = upper;
      refreshSolverInputRow();
    } else {
      if (gameOver || currentRow >= MAX_ROWS) return;
      currentGuess = upper.split("");
      currentCol = 5;
      for (let c = 0; c < WORD_LEN; c++) {
        board[currentRow][c].letter = upper[c];
        const tile = getTile(currentRow, c);
        tile.textContent = upper[c];
        tile.className = "wordle-tile has-letter";
      }
    }
  }

  function showSolverPanel() { document.getElementById("solver-panel").classList.add("visible"); }
  function hideSolverPanel() { document.getElementById("solver-panel").classList.remove("visible"); }

  function ensureSolverResetButton() {
    if (mode !== "solve") return;
    const panel = document.getElementById("solver-panel");
    if (!panel || document.getElementById("solver-reset-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "solver-reset-btn";
    btn.id = "solver-reset-btn";
    btn.title = "Clear all and restart";
    btn.innerHTML = `<i class="fa-solid fa-rotate-left"></i> Reset`;
    btn.addEventListener("click", resetSolverState);
    panel.appendChild(btn);
  }

  function removeSolverResetButton() {
    const btn = document.getElementById("solver-reset-btn");
    if (btn) btn.remove();
  }

  function resetSolverState() {
    currentRow = 0;
    currentCol = 0;
    gameOver = false;
    solverGuesses = [];
    solverCurrentInput = "";
    buildBoard();
    resetKeyboardColors();
    hideSolverPanel();
    // Prefill first guess into solver input if set
    if (firstGuess && /^[a-z]{5}$/.test(firstGuess) && WORDS.includes(firstGuess)) {
      solverCurrentInput = firstGuess.toUpperCase();
      refreshSolverInputRow();
    }
    showToast("Solver reset");
  }

  /* =========================================================
     TILE HELPERS
     ========================================================= */
  function getTile(r, c) { return document.getElementById(`tile-${r}-${c}`); }

  /* =========================================================
     ANIMATIONS
     ========================================================= */
  function shakeRow(r) {
    const rowEl = document.getElementById(`row-${r}`);
    rowEl.classList.add("shake");
    rowEl.addEventListener("animationend", () => rowEl.classList.remove("shake"), { once: true });
  }

  function bounceRow(r) {
    for (let c = 0; c < WORD_LEN; c++) {
      const tile = getTile(r, c);
      setTimeout(() => {
        tile.classList.add("bounce");
        tile.addEventListener("animationend", () => tile.classList.remove("bounce"), { once: true });
      }, c * 100);
    }
  }

  /* =========================================================
     TOAST
     ========================================================= */
  function showToast(msg, duration = 2000) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  function showWordReveal(word) {
    const el = document.getElementById("word-reveal");
    el.textContent = word;
    el.style.display = "block";
    showToast(word, 3500);
    setTimeout(() => { el.style.display = "none"; }, 6000);
  }

  /* =========================================================
     CONFETTI — rectangles
     ========================================================= */
  function fireConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const COLORS = ["#6aaa64","#c9b458","#e74c3c","#3498db","#f39c12","#9b59b6","#1abc9c","#e91e63","#ff6b35","#00b4d8"];
    const pieces = Array.from({ length: 130 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      w: 7 + Math.random() * 9,
      h: 3 + Math.random() * 5,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.14,
      vx: (Math.random() - 0.5) * 3.5,
      vy: 1.8 + Math.random() * 3.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity: 1,
      life: 0
    }));
    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.angle += p.spin; p.life++;
        if (p.life > 100) p.opacity = Math.max(0, p.opacity - 0.012);
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < 200) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
  }

  /* =========================================================
     STATS
     ========================================================= */
  function recordResult(guessNum) {
    stats.played++;
    if (guessNum !== null) {
      stats.won++;
      stats.streak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      stats.dist[guessNum - 1]++;
    } else {
      stats.streak = 0;
    }
    localStorage.setItem("wdl_stats", JSON.stringify(stats));
  }

  function openStats() {
    const maxDist = Math.max(...stats.dist, 1);
    document.getElementById("stat-played").textContent = stats.played;
    document.getElementById("stat-winpct").textContent = stats.played ? Math.round(stats.won / stats.played * 100) : 0;
    document.getElementById("stat-streak").textContent = stats.streak;
    document.getElementById("stat-maxstreak").textContent = stats.maxStreak;
    const distEl = document.getElementById("guess-dist");
    distEl.innerHTML = "";
    stats.dist.forEach((count, i) => {
      const pct = Math.round((count / maxDist) * 100);
      distEl.innerHTML += `
        <div class="dist-row">
          <span class="dist-row-num">${i + 1}</span>
          <div class="dist-bar-wrap">
            <div class="dist-bar" style="width:${Math.max(pct, 8)}%">${count}</div>
          </div>
        </div>`;
    });
    openPanel("stats-panel");
  }

  /* =========================================================
     SHARE
     ========================================================= */
  function shareStats() {
    const pct = stats.played ? Math.round(stats.won / stats.played * 100) : 0;
    const distStr = stats.dist.map((n,i) => `${i+1}: ${n}`).join("  ");
    const text = `Wordle Stats\nPlayed: ${stats.played} | Win: ${pct}% | Streak: ${stats.streak} | Best: ${stats.maxStreak}\n${distStr}`;
    if (navigator.share) {
      navigator.share({ title: "Wordle Stats", text });
    } else {
      navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
    }
  }

  /* =========================================================
     PANELS
     ========================================================= */
  function openPanel(id) {
    closeAllPanels();
    document.getElementById(id).classList.add("open");
    document.getElementById("panel-backdrop").classList.add("visible");
  }

  function closeAllPanels() {
    document.querySelectorAll(".slide-panel").forEach(p => p.classList.remove("open"));
    document.getElementById("panel-backdrop").classList.remove("visible");
  }

  /* =========================================================
     MODE SWITCH
     ========================================================= */
  function setMode(newMode) {
    mode = newMode;
    const btn = document.getElementById("mode-toggle-btn");
    if (mode === "play") {
      btn.className = "mode-toggle active-play";
      btn.innerHTML = `<i class="fa-solid fa-gamepad"></i> Play`;
      hideSolverPanel();
      removeSolverResetButton();
      solverGuesses = [];
      solverCurrentInput = "";
      startNewGame();
    } else {
      btn.className = "mode-toggle active-solve";
      btn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Solve`;
      document.getElementById("word-reveal").style.display = "none";
      document.getElementById("play-again-btn").classList.remove("visible");
      buildBoard();
      resetKeyboardColors();
      currentRow = 0;
      currentCol = 0;
      gameOver = false;
      currentGuess = [];
      solverGuesses = [];
      solverCurrentInput = "";
      hideSolverPanel();
      ensureSolverResetButton();
      // Prefill first guess into solver input if set
      if (settings.useFirstGuess && firstGuess && /^[a-z]{5}$/.test(firstGuess) && WORDS.includes(firstGuess)) {
        solverCurrentInput = firstGuess.toUpperCase();
        refreshSolverInputRow();
      }
    }
  }

  /* =========================================================
     FIRST GUESS
     ========================================================= */
  function updateFirstGuessBar() {
    const bar = document.getElementById("first-guess-bar");
    if (!bar) return;
    if (settings.useFirstGuess) {
      document.documentElement.removeAttribute("data-first-guess-enabled");
      bar.style.display = "";
    } else {
      document.documentElement.setAttribute("data-first-guess-enabled", "false");
      bar.style.display = "none";
    }
    const display = document.getElementById("first-guess-display");
    if (display) display.textContent = firstGuess.toUpperCase();
  }

  function setFirstGuess(word) {
    word = (word || "").toLowerCase().trim();
    if (!/^[a-z]{5}$/.test(word)) { showToast("Must be a 5-letter word"); return; }
    if (!WORDS.includes(word)) { showToast("Not in word list"); return; }
    firstGuess = word;
    localStorage.setItem("wdl_first_guess", firstGuess);
    updateFirstGuessBar();
    document.getElementById("first-guess-input").value = "";
    showToast(`First guess: ${firstGuess.toUpperCase()}`);
  }

  /* =========================================================
     EVENTS
     ========================================================= */
  function attachEvents() {
    // Physical keyboard
    document.addEventListener("keydown", e => {
      if (document.querySelector(".slide-panel.open")) return;
      if (document.activeElement === document.getElementById("first-guess-input")) return;
      const k = e.key;
      if (k === "Enter")     { e.preventDefault(); handleKey("ENTER"); }
      else if (k === "Backspace") { e.preventDefault(); handleKey("BACKSPACE"); }
      else if (/^[a-zA-Z]$/.test(k)) { e.preventDefault(); handleKey(k.toUpperCase()); }
    });

    document.getElementById("mode-toggle-btn").addEventListener("click", () => {
      setMode(mode === "play" ? "solve" : "play");
    });

    document.getElementById("btn-stats").addEventListener("click", openStats);
    document.getElementById("btn-settings").addEventListener("click", () => openPanel("settings-panel"));
    document.getElementById("btn-info").addEventListener("click", () => openPanel("info-panel"));

    document.querySelectorAll(".panel-close").forEach(btn => btn.addEventListener("click", closeAllPanels));
    document.getElementById("panel-backdrop").addEventListener("click", closeAllPanels);

    document.getElementById("play-again-btn").addEventListener("click", () => {
      if (mode === "play") startNewGame();
      else setMode("solve");
      document.getElementById("play-again-btn").classList.remove("visible");
    });

    const fgInput = document.getElementById("first-guess-input");
    fgInput.addEventListener("keydown", e => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); setFirstGuess(fgInput.value); }
    });
    document.getElementById("fg-set-btn").addEventListener("pointerdown", e => { e.preventDefault(); setFirstGuess(fgInput.value); });
    document.getElementById("fg-least-btn").addEventListener("pointerdown", e => { e.preventDefault(); setFirstGuess("least"); });
    document.getElementById("fg-blind-btn").addEventListener("pointerdown", e => { e.preventDefault(); setFirstGuess("blind"); });


    // Sync settings toggles
    document.getElementById("toggle-hard").checked = settings.hardMode;
    document.getElementById("toggle-dark").checked = settings.darkMode === "dark";
    document.getElementById("toggle-colorblind").checked = settings.colorBlind;
    document.getElementById("toggle-first-guess").checked = settings.useFirstGuess;

    document.getElementById("toggle-hard").addEventListener("change", e => { settings.hardMode = e.target.checked; saveSettings(); });
    document.getElementById("toggle-dark").addEventListener("change", e => { settings.darkMode = e.target.checked ? "dark" : "light"; saveSettings(); applySettings(); });
    document.getElementById("toggle-colorblind").addEventListener("change", e => { settings.colorBlind = e.target.checked; saveSettings(); applySettings(); });
    document.getElementById("toggle-first-guess").addEventListener("change", e => { settings.useFirstGuess = e.target.checked; saveSettings(); updateFirstGuessBar(); });

    document.getElementById("btn-share-stats").addEventListener("click", shareStats);
    document.getElementById("btn-reset-stats").addEventListener("click", () => {
      if (confirm("Reset all stats? This cannot be undone.")) {
        stats = { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0,0,0,0,0,0] };
        localStorage.setItem("wdl_stats", JSON.stringify(stats));
        openStats();
        showToast("Stats reset");
      }
    });
  }

})();
