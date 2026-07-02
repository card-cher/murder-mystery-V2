/* =========================================================================
   THE EVENING CIPHER — Detective RPG Engine
   =========================================================================
   ARCHITECTURE OVERVIEW
   ----------------------------------------------------------------------
   1. LEVELS (data, in data.js) — { levelID: { chapters:[...] } }. Each
      level owns its own ordered chapter list. Loaded before this file.
   2. ASSETS (data, in assets.json) — { scenes: { levelID: { chapterIndex:
      {url,alt,caption} } }, conclusions: { levelID: [ {url,caption}, ... ] } }.
      Fetched once at boot into the in-memory ASSETS object. Presentation
      data lives here, separate from narrative/puzzle data in data.js, so
      swapping artwork never touches game logic.
   3. GameState (class)    — single source of truth. Tracks which level
      is currently active (or none, meaning "on the level-select screen"),
      and keeps a SEPARATE progress record per level (currentIndex,
      completed set, hint usage, phone messages, puzzle memory, finished
      flag) so switching levels never destroys another level's progress.
   4. Puzzle Renderers     — one render/validate pair per `puzzleType`.
      Adding a new puzzle type = adding one entry to PUZZLE_HANDLERS.
      Grid size is entirely driven by how many suspects/weapons/locations
      a chapter's puzzleData supplies, so difficulty scaling needs no
      engine changes at all. The new "hiddenobject" type follows the same
      contract as "grid", "cipher", and "terminal" — render/validate/
      solutionText/reset — so the rest of the engine treats it identically.
   5. UI Render functions  — repaint the level-select screen, the game
      screen (scene viewer, briefing, puzzle mount, phone, tracker), OR
      the conclusion-comic overlay, all from GameState + ASSETS. Nothing
      here mutates state directly except the small "found" state used by
      the hidden-object handler (mirrored into game.puzzleMemory).
   6. Event wiring         — DOM listeners call into GameState, then
      trigger a re-render. Data flow stays one-directional:
      input -> state -> render.

   STATE MACHINE / ASSET LOADING / TRANSITIONS (see inline comments below
   at loadSceneAsset(), renderGameScreen(), completeChapter(), and
   showLevelConclusion() for the specific mechanics) — in short:

     level-select screen
           |  selectLevel()
           v
     game screen, chapter N  <---- renderGameScreen() reads
           |                       game.currentChapter, looks up its
           |  solve chapter        scene in ASSETS.scenes[levelID][idx],
           |  (completeChapter())  and repaints #scene-viewer + puzzle
           v                       mount + phone + tracker together.
     game screen, chapter N+1
           |
           |  ... last chapter solved -> game.currentProgress.finished = true
           v
     showLevelConclusion() -- reads ASSETS.conclusions[levelID], renders
           |                  a 3-4 panel comic overlay
           |  dismiss
           v
     renderFinished() (level-select accessible again via toolbar)

   HOW TO ADD A NEW CHAPTER OR LEVEL: see the header comment in data.js.
   HOW TO ADD A NEW PUZZLE TYPE: add a `render`/`validate`/`solutionText`/
   `reset` set to PUZZLE_HANDLERS keyed by your new type name, then
   reference that name in a chapter's `puzzleType`.
   ========================================================================= */

/* ---------------------------- ASSET LOADING ------------------------------
   ASSETS starts empty and is populated by loadAssets() at boot, fetched
   from assets.json. Every place that needs an image goes through the two
   lookup helpers below rather than touching ASSETS directly, so a missing
   or not-yet-loaded entry degrades gracefully instead of throwing.
   ------------------------------------------------------------------------ */

let ASSETS = { scenes: {}, conclusions: {} };

async function loadAssets() {
  try {
    const res = await fetch("assets.json");
    if (!res.ok) throw new Error(`assets.json responded ${res.status}`);
    ASSETS = await res.json();
  } catch (err) {
    // Non-fatal: the game is still fully playable without artwork, the
    // scene viewer just falls back to its placeholder state.
    console.warn("Could not load assets.json — scene art will be blank.", err);
    ASSETS = { scenes: {}, conclusions: {} };
  }
}

/** Look up the sketch for a specific chapter, e.g. easy chapter 1. */
function getSceneAsset(levelID, chapterIndex) {
  const level = ASSETS.scenes && ASSETS.scenes[levelID];
  return (level && level[String(chapterIndex)]) || null;
}

/** Look up the full conclusion-comic panel array for a level. */
function getConclusionAssets(levelID) {
  return (ASSETS.conclusions && ASSETS.conclusions[levelID]) || [];
}

/* ---------------------------- GAME STATE (class) ------------------------ */

class GameState {
  constructor(levels) {
    this.levels = levels;               // { levelID: { ...meta, chapters:[...] } }
    this.currentLevelID = null;         // null => level-select screen
    this.progress = {};                 // levelID -> per-level progress record
    this.showingConclusion = false;     // true while the comic overlay is up
    Object.keys(levels).forEach(id => this._initLevelProgress(id));
  }

  _initLevelProgress(levelID) {
    this.progress[levelID] = {
      currentIndex: 0,        // which chapter (index) the player is on
      completed: new Set(),   // ids of solved chapters in this level
      hintUsed: {},           // chapterId -> boolean
      phoneMessages: [],      // accumulated unlocked messages, this level only
      puzzleMemory: {},       // chapterId -> in-progress puzzle state
      finished: false
    };
  }

  /* ---- level navigation ---- */

  get currentLevel() {
    return this.currentLevelID ? this.levels[this.currentLevelID] : null;
  }

  selectLevel(levelID) {
    this.currentLevelID = levelID;
    this.showingConclusion = false;
  }

  exitToLevelSelect() {
    this.currentLevelID = null;
    this.showingConclusion = false;
  }

  levelStats(levelID) {
    const level = this.levels[levelID];
    const p = this.progress[levelID];
    const total = level.chapters.length;
    const hintsUsed = Object.keys(p.hintUsed).length;
    return {
      total,
      completedCount: p.completed.size,
      finished: p.finished,
      started: p.completed.size > 0 || p.currentIndex > 0,
      hintsUsed
    };
  }

  /* ---- current-level chapter access (all routed through progress[currentLevelID]) ---- */

  get chapters() {
    return this.currentLevel.chapters;
  }

  get currentProgress() {
    return this.progress[this.currentLevelID];
  }

  get currentChapter() {
    return this.chapters[this.currentProgress.currentIndex];
  }

  get finished() {
    return this.currentProgress.finished;
  }

  isHintUsed(chapterId) {
    return !!this.currentProgress.hintUsed[chapterId];
  }

  markHintUsed(chapterId) {
    this.currentProgress.hintUsed[chapterId] = true;
  }

  getMemory(chapterId) {
    return this.currentProgress.puzzleMemory[chapterId];
  }

  setMemory(chapterId, value) {
    this.currentProgress.puzzleMemory[chapterId] = value;
  }

  /** Advance the state machine after a correct submission.
   *  This is the one place chapter -> chapter (or chapter -> conclusion)
   *  transitions happen. It intentionally does NOT touch the DOM — callers
   *  (checkCurrentPuzzle) re-render afterward, and trigger the conclusion
   *  overlay separately once `finished` flips true. */
  completeChapter() {
    const p = this.currentProgress;
    const ch = this.currentChapter;
    p.completed.add(ch.id);
    if (ch.phoneMessage) {
      p.phoneMessages.push({
        ...ch.phoneMessage,
        hintFlag: this.isHintUsed(ch.id)
      });
    }
    if (p.currentIndex < this.chapters.length - 1) {
      p.currentIndex++;
    } else {
      p.finished = true;
    }
  }

  /** Restart only the currently active level; other levels' progress is untouched. */
  resetCurrentLevel() {
    this._initLevelProgress(this.currentLevelID);
    this.showingConclusion = false;
  }
}

const game = new GameState(LEVELS);

/* ---------------------------- PUZZLE HANDLER REGISTRY -------------------
   Each handler owns rendering into #puzzle-mount and validating the
   player's current answer against chapter.solution. renderPuzzle()/
   checkCurrentPuzzle() never need to know the specifics of any one
   puzzle type — they just look the type up here. Grid size scales
   automatically from puzzleData array lengths.
   ------------------------------------------------------------------------ */

const PUZZLE_HANDLERS = {

  /* ---------------- HIDDEN OBJECT (tap flagged spots on the scene sketch) ----------------
     puzzleData: { sceneWidth, sceneHeight, targets:[{id,label,x,y,radius}], foundMessage,
     allFoundMessage } where x/y/radius are fractions (0-1) of the sketch's width/height,
     so hit-testing is resolution independent. solution is an array of target ids that
     must all be found. Found markers double as the "unlock a phone hint mid-puzzle"
     mechanic described in the brief: each find posts a small phone-style toast via
     game.setMemory + a live re-render of just the marker layer (no full puzzle rebuild,
     so the sketch doesn't flicker/reset while the player is still hunting). */
  hiddenobject: {
    render(mount, chapter) {
      const data = chapter.puzzleData;
      let found = game.getMemory(chapter.id);
      if (!found) {
        found = [];
        game.setMemory(chapter.id, found);
      }

      const wrap = document.createElement("div");
      wrap.className = "hidden-object-widget";

      const hint = document.createElement("p");
      hint.className = "grid-hint";
      hint.textContent = `Tap the marked areas in the sketch above to flag anything unusual. Found ${found.length} of ${data.targets.length}.`;
      hint.id = "hidden-object-progress";
      wrap.appendChild(hint);

      const list = document.createElement("ul");
      list.className = "clues-list hidden-object-list";
      data.targets.forEach(t => {
        const li = document.createElement("li");
        li.dataset.targetId = t.id;
        li.textContent = t.label;
        if (found.includes(t.id)) li.classList.add("found");
        list.appendChild(li);
      });
      wrap.appendChild(list);
      mount.appendChild(wrap);

      // The interactive hotspots live in the #scene-viewer, not in the
      // puzzle mount, since they sit directly on top of the sketch image.
      // renderSceneViewer() (called by renderGameScreen alongside this)
      // is responsible for drawing them; this handler just owns the
      // click -> mark-found logic via markHiddenObjectFound() below,
      // which both handlers share.
    },

    validate(chapter) {
      const found = game.getMemory(chapter.id) || [];
      const required = chapter.solution;
      const allFound = required.every(id => found.includes(id));
      return {
        correct: allFound,
        message: allFound
          ? (chapter.puzzleData.allFoundMessage || "☙ SCENE FILED ❧ Every item accounted for.")
          : `Not yet — ${found.length} of ${required.length} items flagged. Keep examining the sketch.`
      };
    },

    solutionText(chapter) {
      return chapter.puzzleData.targets.map(t => t.label).join(" | ");
    },

    reset(chapter) {
      game.setMemory(chapter.id, []);
    }
  },

  /* ---------------- GRID (whodunit logic grid) ---------------- */
  grid: {
    render(mount, chapter) {
      const data = chapter.puzzleData;

      // restore or initialize marks for this chapter
      let marks = game.getMemory(chapter.id);
      if (!marks) {
        marks = {};
        data.suspects.forEach(s => {
          marks[s] = {};
          data.weapons.forEach(w => (marks[s]["weapon:" + w] = 0));
          data.locations.forEach(l => (marks[s]["location:" + l] = 0));
        });
        game.setMemory(chapter.id, marks);
      }

      // render clues above the grid
      const cluesWrap = document.createElement("div");
      cluesWrap.className = "inline-clues";
      const cluesTitle = document.createElement("p");
      cluesTitle.className = "grid-hint";
      cluesTitle.textContent = "Tap a cell to cycle: blank → ✕ (impossible) → ✓ (confirmed). Match every suspect to one weapon and one location.";
      cluesWrap.appendChild(cluesTitle);
      const ol = document.createElement("ol");
      ol.className = "clues-list";
      data.clues.forEach(c => {
        const li = document.createElement("li");
        li.textContent = c;
        ol.appendChild(li);
      });
      cluesWrap.appendChild(ol);
      mount.appendChild(cluesWrap);

      // build table
      const container = document.createElement("div");
      container.className = "grid-container";
      const table = document.createElement("table");
      table.className = "deduction-table";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      const corner = document.createElement("th");
      corner.className = "row-header";
      corner.textContent = "Suspect";
      headRow.appendChild(corner);
      data.weapons.forEach((w, i) => {
        const th = document.createElement("th");
        th.textContent = w;
        if (i === 0) th.classList.add("group-gap");
        headRow.appendChild(th);
      });
      data.locations.forEach((l, i) => {
        const th = document.createElement("th");
        th.textContent = l;
        if (i === 0) th.classList.add("group-gap");
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      data.suspects.forEach(suspect => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.className = "row-header";
        th.textContent = suspect;
        tr.appendChild(th);

        const appendCell = (columnKey, isGroupStart) => {
          const td = document.createElement("td");
          if (isGroupStart) td.classList.add("group-gap");
          const btn = document.createElement("button");
          btn.className = "cell-btn";
          btn.type = "button";
          btn.setAttribute("aria-label", `${suspect} / ${columnKey.split(":")[1]}`);
          paintCell(btn, marks[suspect][columnKey]);
          btn.addEventListener("click", () => {
            marks[suspect][columnKey] = (marks[suspect][columnKey] + 1) % 3;
            paintCell(btn, marks[suspect][columnKey]);
          });
          td.appendChild(btn);
          tr.appendChild(td);
        };

        data.weapons.forEach((w, i) => appendCell("weapon:" + w, i === 0));
        data.locations.forEach((l, i) => appendCell("location:" + l, i === 0));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
      mount.appendChild(container);

      function paintCell(btn, value) {
        btn.classList.remove("marked-x", "marked-check");
        if (value === 1) { btn.textContent = "✕"; btn.classList.add("marked-x"); }
        else if (value === 2) { btn.textContent = "✓"; btn.classList.add("marked-check"); }
        else { btn.textContent = ""; }
      }
    },

    validate(chapter) {
      const marks = game.getMemory(chapter.id);
      const data = chapter.puzzleData;
      const solution = chapter.solution;
      const mistakes = [];
      data.suspects.forEach(suspect => {
        const solved = solution[suspect];
        const checkedWeapon = data.weapons.find(w => marks[suspect]["weapon:" + w] === 2);
        const checkedLocation = data.locations.find(l => marks[suspect]["location:" + l] === 2);
        if (checkedWeapon !== solved.weapon || checkedLocation !== solved.location) {
          mistakes.push(suspect);
        }
      });
      return {
        correct: mistakes.length === 0,
        message: mistakes.length === 0
          ? "☙ CASE CLOSED ❧ Every suspect, weapon, and room correctly matched."
          : `NOT QUITE — the file is incomplete for: ${mistakes.join(", ")}. Mark exactly one weapon and one location per suspect with a ✓.`
      };
    },

    solutionText(chapter) {
      return Object.entries(chapter.solution)
        .map(([s, v]) => `${s} → ${v.weapon}, ${v.location}`)
        .join(" | ");
    },

    reset(chapter) {
      game.setMemory(chapter.id, null);
    }
  },

  /* ---------------- CIPHER (decode substitution cipher) ---------------- */
  cipher: {
    render(mount, chapter) {
      const data = chapter.puzzleData;
      const wrap = document.createElement("div");
      wrap.className = "cipher-widget";

      const cipherBlock = document.createElement("div");
      cipherBlock.className = "cipher-text";
      cipherBlock.textContent = data.cipherText;
      wrap.appendChild(cipherBlock);

      const hint = document.createElement("p");
      hint.className = "grid-hint";
      hint.textContent = data.shiftHint;
      wrap.appendChild(hint);

      const label = document.createElement("label");
      label.className = "input-label";
      label.textContent = "Decoded message:";
      label.htmlFor = "cipher-input";
      wrap.appendChild(label);

      const input = document.createElement("input");
      input.type = "text";
      input.id = "cipher-input";
      input.className = "text-input";
      input.autocomplete = "off";
      input.placeholder = "Type your decoded answer here...";
      input.value = game.getMemory(chapter.id) || "";
      input.addEventListener("input", () => game.setMemory(chapter.id, input.value));
      wrap.appendChild(input);

      mount.appendChild(wrap);
    },

    validate(chapter) {
      const value = (game.getMemory(chapter.id) || "").trim().toUpperCase();
      const correct = value === chapter.puzzleData.answer.toUpperCase();
      return {
        correct,
        message: correct
          ? "☙ DECODED ❧ The message checks out."
          : "That decoding doesn't match the cipher yet. Re-check your letter shifts and try again."
      };
    },

    solutionText(chapter) {
      return chapter.puzzleData.answer;
    },

    reset(chapter) {
      game.setMemory(chapter.id, "");
    }
  },

  /* ---------------- TERMINAL (typed password / command) ---------------- */
  terminal: {
    render(mount, chapter) {
      const data = chapter.puzzleData;
      const wrap = document.createElement("div");
      wrap.className = "terminal-widget";

      const screen = document.createElement("pre");
      screen.className = "terminal-screen";
      screen.textContent = data.promptText;
      wrap.appendChild(screen);

      const inputRow = document.createElement("div");
      inputRow.className = "terminal-input-row";
      const prompt = document.createElement("span");
      prompt.className = "terminal-caret";
      prompt.textContent = "$";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "text-input terminal-input";
      input.autocomplete = "off";
      input.placeholder = "type command...";
      input.value = game.getMemory(chapter.id) || "";
      input.addEventListener("input", () => game.setMemory(chapter.id, input.value));
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") checkCurrentPuzzle();
      });
      inputRow.appendChild(prompt);
      inputRow.appendChild(input);
      wrap.appendChild(inputRow);

      mount.appendChild(wrap);
    },

    validate(chapter) {
      const value = (game.getMemory(chapter.id) || "").trim().toLowerCase().replace(/\s+/g, "");
      const correct = value === chapter.puzzleData.answer.toLowerCase();
      return {
        correct,
        message: correct
          ? "☙ ACCESS GRANTED ❧ Manifest unlocked."
          : "ACCESS DENIED — that password doesn't match the terminal's records."
      };
    },

    solutionText(chapter) {
      return chapter.puzzleData.answer;
    },

    reset(chapter) {
      game.setMemory(chapter.id, "");
    }
  }
};

/* ---------------------------- RENDER: LEVEL SELECT SCREEN ---------------- */

function renderLevelSelect() {
  document.getElementById("level-select-screen").style.display = "";
  document.getElementById("game-screen").style.display = "none";

  const wrap = document.getElementById("level-cards");
  wrap.innerHTML = "";

  Object.values(game.levels).forEach(level => {
    const stats = game.levelStats(level.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "level-card";

    const name = document.createElement("p");
    name.className = "level-card-name";
    name.innerHTML = `${level.label} <span class="level-card-badge ${level.id}">●</span>`;
    card.appendChild(name);

    const desc = document.createElement("p");
    desc.className = "level-card-desc";
    desc.textContent = level.description;
    card.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "level-card-meta";
    const left = document.createElement("span");
    left.textContent = `${level.gridSize}x${level.gridSize} grid · ${level.chapters.length} chapters`;
    const right = document.createElement("span");
    if (stats.finished) {
      right.textContent = "case closed";
      right.classList.add("level-finished");
    } else if (stats.started) {
      right.textContent = `chapter ${stats.completedCount + 1} of ${stats.total}`;
    } else {
      right.textContent = "not started";
    }
    meta.appendChild(left);
    meta.appendChild(right);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      game.selectLevel(level.id);
      renderApp();
    });

    wrap.appendChild(card);
  });
}

/* ---------------------------- RENDER: CHAPTER TEXT ----------------------- */

function renderBriefing(chapter) {
  const nc = chapter.narrativeContent;
  document.getElementById("briefing-headline").textContent = nc.headline;
  document.getElementById("briefing-byline").textContent = nc.byline;
  const textEl = document.getElementById("briefing-text");
  textEl.innerHTML = "";
  nc.briefing.forEach(paragraph => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    textEl.appendChild(p);
  });
  const dateEl = document.getElementById("masthead-date");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    }).toUpperCase();
  }
}

/* ---------------------------- RENDER: SCENE VIEWER ------------------------
   Dynamic Visualization System (upgrade #2). Called every time the game
   screen repaints. Looks up the sketch for the current level+chapter in
   ASSETS (populated from assets.json by loadAssets() at boot) and injects
   it into #scene-viewer. For "hiddenobject" chapters it additionally
   layers clickable hotspot buttons over the image, positioned with
   percentage-based CSS so they track the image at any width.
   ------------------------------------------------------------------------ */

function renderSceneViewer(chapter) {
  const viewer = document.getElementById("scene-viewer");
  viewer.innerHTML = "";

  const asset = getSceneAsset(chapter.levelID, chapter.chapterIndex);

  const figure = document.createElement("figure");
  figure.className = "scene-figure";

  const imgWrap = document.createElement("div");
  imgWrap.className = "scene-image-wrap";

  if (asset) {
    const img = document.createElement("img");
    img.className = "scene-image";
    img.src = asset.url;
    img.alt = asset.alt || "Case scene illustration";
    img.loading = "eager";
    imgWrap.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "scene-image scene-image-placeholder";
    placeholder.textContent = "No sketch on file for this chapter yet.";
    imgWrap.appendChild(placeholder);
  }

  // Hidden-object hotspots render on top of the image, driven by the
  // chapter's own puzzleData (fractional x/y/radius) so they need no
  // asset-specific coordinates — any replacement image at the same
  // aspect ratio keeps working without touching data.js.
  if (chapter.puzzleType === "hiddenobject") {
    const found = game.getMemory(chapter.id) || [];
    chapter.puzzleData.targets.forEach(target => {
      const isFound = found.includes(target.id);
      const hotspot = document.createElement("button");
      hotspot.type = "button";
      hotspot.className = "scene-hotspot" + (isFound ? " scene-hotspot-found" : "");
      hotspot.style.left = (target.x * 100) + "%";
      hotspot.style.top = (target.y * 100) + "%";
      hotspot.style.width = hotspot.style.height = (target.radius * 2 * 100) + "%";
      hotspot.setAttribute("aria-label", target.label);
      hotspot.title = isFound ? `${target.label} (found)` : "Examine this area";
      hotspot.disabled = isFound || game.finished;
      hotspot.addEventListener("click", () => markHiddenObjectFound(chapter, target));
      imgWrap.appendChild(hotspot);
    });
  }

  figure.appendChild(imgWrap);

  if (asset && asset.caption) {
    const caption = document.createElement("figcaption");
    caption.className = "scene-caption";
    caption.textContent = asset.caption;
    figure.appendChild(caption);
  }

  viewer.appendChild(figure);
}

/** Shared click handler for hidden-object hotspots. Marks the target found,
 *  posts an optional phone-style toast, and repaints just the scene viewer
 *  + puzzle mount (not the whole game screen) so the sketch doesn't reset. */
function markHiddenObjectFound(chapter, target) {
  const found = game.getMemory(chapter.id) || [];
  if (found.includes(target.id)) return;
  found.push(target.id);
  game.setMemory(chapter.id, found);

  setFeedback(chapter.puzzleData.foundMessage || `Found: ${target.label}`, "hint");

  renderSceneViewer(chapter);
  const mount = document.getElementById("puzzle-mount");
  mount.innerHTML = "";
  PUZZLE_HANDLERS.hiddenobject.render(mount, chapter);
}

/* ---------------------------- RENDER: PUZZLE MOUNT ------------------------ */

function renderPuzzle(chapter) {
  document.getElementById("puzzle-label").textContent = chapter.puzzleLabel || "Evidence";
  const mount = document.getElementById("puzzle-mount");
  mount.innerHTML = "";
  const handler = PUZZLE_HANDLERS[chapter.puzzleType];
  if (!handler) {
    mount.textContent = `Unknown puzzle type: ${chapter.puzzleType}`;
    return;
  }
  handler.render(mount, chapter);
}

/* ---------------------------- RENDER: PHONE -------------------------------- */

function renderPhone() {
  const screen = document.getElementById("phone-screen");
  screen.innerHTML = "";

  const nameEl = document.getElementById("phone-header-name");
  if (nameEl && game.currentLevel) {
    nameEl.textContent = `CASE LINE — ${game.currentLevel.label.toUpperCase()}`;
  }

  const messages = game.currentProgress.phoneMessages;

  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "phone-empty";
    empty.textContent = "No messages yet. Solve a chapter to hear from your contact.";
    screen.appendChild(empty);
    return;
  }

  messages.forEach(msg => {
    const bubble = document.createElement("div");
    bubble.className = "phone-bubble" + (msg.hintFlag ? " phone-bubble-hint" : "");
    const sender = document.createElement("div");
    sender.className = "phone-sender";
    sender.textContent = msg.sender;
    const text = document.createElement("div");
    text.className = "phone-text";
    text.textContent = msg.text;
    bubble.appendChild(sender);
    bubble.appendChild(text);
    if (msg.hintFlag) {
      const tag = document.createElement("div");
      tag.className = "phone-hint-tag";
      tag.textContent = "⚠ solved using solution key";
      bubble.appendChild(tag);
    }
    screen.appendChild(bubble);
  });

  // auto-scroll to latest message
  screen.scrollTop = screen.scrollHeight;
}

/* ---------------------------- RENDER: PROGRESS TRACKER ---------------------- */

function renderTracker() {
  const tracker = document.getElementById("chapter-tracker");
  tracker.innerHTML = "";
  const p = game.currentProgress;
  game.chapters.forEach((ch, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "tracker-dot";
    dot.textContent = ch.chapterIndex;
    dot.title = ch.narrativeContent.headline;
    if (p.completed.has(ch.id)) dot.classList.add("tracker-done");
    if (i === p.currentIndex) dot.classList.add("tracker-current");
    if (i > p.currentIndex && !p.completed.has(ch.id)) dot.classList.add("tracker-locked");
    // allow revisiting completed chapters (read-only feel), but not skipping ahead
    dot.disabled = i > p.currentIndex;
    dot.addEventListener("click", () => {
      if (i <= p.currentIndex) {
        p.currentIndex = i;
        renderGameScreen();
      }
    });
    tracker.appendChild(dot);
  });
}

/* ---------------------------- FEEDBACK HELPERS ------------------------------ */

function setFeedback(text, kind) {
  const el = document.getElementById("feedback");
  el.classList.remove("win", "lose", "hint");
  if (kind) el.classList.add(kind);
  el.textContent = text;
}

function clearFeedback() {
  const el = document.getElementById("feedback");
  el.classList.remove("win", "lose", "hint");
  el.textContent = "";
}

/* ---------------------------- MASTER RENDER ---------------------------------- */

/** Top-level dispatcher: level-select screen vs. active game screen. */
function renderApp() {
  if (!game.currentLevelID) {
    renderLevelSelect();
    return;
  }
  document.getElementById("level-select-screen").style.display = "none";
  document.getElementById("game-screen").style.display = "";
  renderGameScreen();
}

function renderGameScreen() {
  if (game.finished) {
    if (game.showingConclusion) {
      renderConclusion();
    } else {
      renderFinished();
    }
    return;
  }

  const chapter = game.currentChapter;
  renderBriefing(chapter);
  renderSceneViewer(chapter);   // scene sketch, refreshed every chapter load
  renderPuzzle(chapter);
  renderTracker();
  renderPhone();
  clearFeedback();

  // grey out solution key button state per-chapter (informational, still clickable)
  const solBtn = document.getElementById("solution-key-btn");
  solBtn.classList.toggle("already-used", game.isHintUsed(chapter.id));
}

function renderFinished() {
  document.getElementById("briefing-headline").textContent = "CASE CLOSED — STORY FILED";
  document.getElementById("briefing-byline").textContent = `The Evening Cipher — ${game.currentLevel.label} Edition, Final`;
  const textEl = document.getElementById("briefing-text");
  textEl.innerHTML = "";
  const p = document.createElement("p");
  const hintsUsed = Object.keys(game.currentProgress.hintUsed).length;
  p.textContent = hintsUsed === 0
    ? "Every chapter solved on your own wits alone. The presses are rolling — front page, above the fold."
    : `Case solved across ${game.chapters.length} chapters, with the Solution Key consulted ${hintsUsed} time(s). The story runs either way.`;
  textEl.appendChild(p);

  const viewer = document.getElementById("scene-viewer");
  viewer.innerHTML = "";

  document.getElementById("puzzle-label").textContent = "Investigation Complete";
  const mount = document.getElementById("puzzle-mount");
  mount.innerHTML = "";

  const done = document.createElement("p");
  done.className = "grid-hint";
  done.textContent = "Press \"Restart Case\" to run this level again, \"Change Level\" to try a different difficulty, or replay the reveal below.";
  mount.appendChild(done);

  const replayBtn = document.createElement("button");
  replayBtn.type = "button";
  replayBtn.className = "check-btn";
  replayBtn.textContent = "☙ Replay the Reveal ❧";
  replayBtn.addEventListener("click", showLevelConclusion);
  mount.appendChild(replayBtn);

  renderTracker();
  renderPhone();
  clearFeedback();
}

/* ---------------------------- CONCLUSION SEQUENCE (THE COMIC) --------------
   Upgrade #5. Triggered by checkCurrentPuzzle() the moment the final
   chapter of a level is solved (game.currentProgress.finished flips true
   inside completeChapter()). Loads the level's comic panels from
   ASSETS.conclusions[levelID] and shows them as a lightbox-style overlay
   the player pages through. Dismissing it (or finishing the last panel)
   drops back to the normal "case closed" screen via renderFinished().
   ------------------------------------------------------------------------ */

let conclusionPanelIndex = 0;

function showLevelConclusion() {
  conclusionPanelIndex = 0;
  game.showingConclusion = true;
  renderConclusion();
}

function renderConclusion() {
  const panels = getConclusionAssets(game.currentLevelID);

  document.getElementById("briefing-headline").textContent = "THE REVEAL";
  document.getElementById("briefing-byline").textContent = `The Evening Cipher — ${game.currentLevel.label} Edition, Special Insert`;
  const textEl = document.getElementById("briefing-text");
  textEl.innerHTML = "";
  const p = document.createElement("p");
  p.textContent = panels.length
    ? "The full account, panel by panel."
    : "No comic panels are on file for this level yet — add entries to assets.json under conclusions." ;
  textEl.appendChild(p);

  const viewer = document.getElementById("scene-viewer");
  viewer.innerHTML = "";

  document.getElementById("puzzle-label").textContent = "Case Conclusion";
  const mount = document.getElementById("puzzle-mount");
  mount.innerHTML = "";

  if (panels.length === 0) {
    const empty = document.createElement("p");
    empty.className = "grid-hint";
    empty.textContent = "Once conclusion artwork is added for this level, it will appear here automatically.";
    mount.appendChild(empty);
  } else {
    const wrap = document.createElement("div");
    wrap.className = "comic-strip";
    panels.forEach((panel, i) => {
      const panelEl = document.createElement("figure");
      panelEl.className = "comic-panel" + (i === conclusionPanelIndex ? " comic-panel-active" : "");
      const img = document.createElement("img");
      img.src = panel.url;
      img.alt = panel.caption || `Conclusion panel ${i + 1}`;
      panelEl.appendChild(img);
      const cap = document.createElement("figcaption");
      cap.textContent = `${i + 1}. ${panel.caption || ""}`;
      panelEl.appendChild(cap);
      wrap.appendChild(panelEl);
    });
    mount.appendChild(wrap);

    const nav = document.createElement("div");
    nav.className = "comic-nav";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "clear-btn";
    prevBtn.textContent = "◂ Previous Panel";
    prevBtn.disabled = conclusionPanelIndex === 0;
    prevBtn.addEventListener("click", () => {
      conclusionPanelIndex = Math.max(0, conclusionPanelIndex - 1);
      renderConclusion();
    });
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "check-btn";
    nextBtn.textContent = conclusionPanelIndex === panels.length - 1 ? "Close Case File ❧" : "Next Panel ▸";
    nextBtn.addEventListener("click", () => {
      if (conclusionPanelIndex === panels.length - 1) {
        game.showingConclusion = false;
        renderGameScreen();
      } else {
        conclusionPanelIndex++;
        renderConclusion();
      }
    });
    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);
    mount.appendChild(nav);
  }

  renderTracker();
  renderPhone();
  clearFeedback();
}

/* ---------------------------- INTERACTION: CHECK / CLEAR / HINT -------------- */

function checkCurrentPuzzle() {
  if (game.finished) return;
  const chapter = game.currentChapter;
  const handler = PUZZLE_HANDLERS[chapter.puzzleType];
  const result = handler.validate(chapter);

  if (result.correct) {
    setFeedback(result.message, "win");
    const wasLastChapter = game.currentProgress.currentIndex === game.chapters.length - 1;
    // brief pause so the player can register success before the story advances
    setTimeout(() => {
      game.completeChapter();
      if (wasLastChapter && game.finished) {
        showLevelConclusion();   // state machine transition: chapter -> conclusion
      } else {
        renderGameScreen();
      }
    }, 650);
  } else {
    setFeedback(result.message, "lose");
  }
}

function clearCurrentPuzzle() {
  if (game.finished) return;
  const chapter = game.currentChapter;
  const handler = PUZZLE_HANDLERS[chapter.puzzleType];
  handler.reset(chapter);
  renderSceneViewer(chapter);
  renderPuzzle(chapter);
  clearFeedback();
}

function revealSolutionKey() {
  if (game.finished) return;
  const chapter = game.currentChapter;
  const handler = PUZZLE_HANDLERS[chapter.puzzleType];
  game.markHintUsed(chapter.id);
  setFeedback(`SOLUTION KEY: ${handler.solutionText(chapter)}  (this chapter is now flagged "Hint Used")`, "hint");
  document.getElementById("solution-key-btn").classList.add("already-used");
}

/* ---------------------------- EVENT WIRING ------------------------------------ */

document.getElementById("check-btn").addEventListener("click", checkCurrentPuzzle);
document.getElementById("clear-btn").addEventListener("click", clearCurrentPuzzle);
document.getElementById("solution-key-btn").addEventListener("click", revealSolutionKey);

document.getElementById("restart-btn").addEventListener("click", () => {
  game.resetCurrentLevel();
  renderGameScreen();
});

document.getElementById("level-select-return-btn").addEventListener("click", () => {
  game.exitToLevelSelect();
  renderApp();
});

/* ---------------------------- BOOT --------------------------------------------- */

/** Assets are fetched async, but LEVELS (data.js) is already available
 *  synchronously, so we render immediately with whatever ASSETS currently
 *  holds (empty placeholders) and then re-render once assets.json resolves.
 *  This avoids a blank screen while the fetch is in flight. */
renderApp();
loadAssets().then(() => renderApp());
