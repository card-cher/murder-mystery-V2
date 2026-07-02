/* =========================================================================
   THE EVENING CIPHER — Case Data
   =========================================================================
   LEVELS is the top of the hierarchy: { levelID: { ...meta, chapters:[...] } }

   Each chapter object follows a fixed shape so the engine (script.js) can
   stay generic:

     {
       id:               "<levelID>-ch<chapterIndex>"   (unique key)
       levelID:          "easy" | "medium" | "hard"
       chapterIndex:     1, 2, 3, ...                    (1-based sequence)
       puzzleType:       "hiddenobject" | "grid" | "cipher" | "terminal"
       puzzleLabel:      short label shown above the puzzle mount
       narrativeContent: { headline, byline, briefing: [paragraphs] }
       puzzleData:       shape depends on puzzleType (see PUZZLE_HANDLERS
                          in script.js for what each type expects)
       solution:         the answer checked by that puzzleType's validate()
       phoneMessage:      { sender, text } appended to the phone on completion

   The scene illustration for a chapter is NOT stored here — it lives in
   assets.json, keyed by levelID + chapterIndex, and is looked up at
   render time by loadSceneAsset() in script.js. This keeps narrative/
   puzzle data (this file) separate from presentation assets (assets.json),
   so swapping in real artwork never touches game logic.

   HOW TO ADD A NEW LEVEL:
   Add a new top-level key to LEVELS with a unique `id`, a `label`,
   a `gridSize` (informational, shown on the level-select card), a
   `description`, and a `chapters` array built exactly like the ones below.
   Also add a matching `scenes.<id>` block and a `conclusions.<id>` array
   to assets.json. The engine does not care how many levels exist or how
   many chapters each one has.

   HOW TO ADD A NEW CHAPTER TO A LEVEL:
   Push another chapter object onto that level's `chapters` array. Bump
   `chapterIndex`, keep `id` unique within the level, and keep `levelID`
   matching the parent key. The complexity of a "grid" chapter is entirely
   controlled by how many suspects/weapons/locations you supply — the
   renderer builds the table from array lengths, so a 3x3, 4x4, or 6x6
   grid is just a matter of how much puzzleData you provide. Remember to
   add a `scenes.<levelID>.<chapterIndex>` entry to assets.json too, or
   the scene viewer will fall back to a generic placeholder.
   ========================================================================= */

const LEVELS = {

  /* ======================================================================
     EASY — hidden-object intro, 3x3 grid, single-shift cipher, short
     terminal password
     ====================================================================== */
  easy: {
    id: "easy",
    label: "Easy",
    gridSize: 3,
    description: "A four-chapter case that opens with a hidden-object scene, then a compact 3x3 deduction grid. Good for a first read of the wire.",
    chapters: [
      {
        id: "easy-ch1",
        levelID: "easy",
        chapterIndex: 1,
        puzzleType: "hiddenobject",
        puzzleLabel: "Examine the Scene Sketch",
        narrativeContent: {
          headline: "ORCHID SOCIETY GALA ENDS IN MURDER",
          byline: "Filed from the Voss Estate — Staff Correspondent",
          briefing: [
            "The annual Orchid Society gala at the Voss Estate turned to tragedy last night when a guest was found dead just after the clock struck eleven. Detectives have released a sketch of the library as it was found — before anything was moved.",
            "Study the sketch below. Three items in the scene do not belong to an ordinary evening and may bear on the case. Tap each one you find."
          ]
        },
        puzzleData: {
          sceneWidth: 900,
          sceneHeight: 560,
          targets: [
            { id: "cufflinks", label: "A pair of dropped cufflinks", x: 0.62, y: 0.71, radius: 0.05 },
            { id: "glass", label: "Shattered display glass", x: 0.30, y: 0.42, radius: 0.07 },
            { id: "papers", label: "Scattered papers on the desk", x: 0.12, y: 0.78, radius: 0.06 }
          ],
          foundMessage: "Marked — carry on.",
          allFoundMessage: "All three items marked. Submit your findings to file this scene."
        },
        solution: ["cufflinks", "glass", "papers"],
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "Good eye on that scene. Cufflinks like that don't belong to a guest — someone on staff dropped them. Grid's next; make it count."
        }
      },
      {
        id: "easy-ch2",
        levelID: "easy",
        chapterIndex: 2,
        puzzleType: "grid",
        puzzleLabel: "Deduction Grid",
        narrativeContent: {
          headline: "THREE GUESTS REMAINED IN THE HOUSE",
          byline: "Filed from the Voss Estate — Staff Correspondent",
          briefing: [
            "Three guests remained in the house at the time of the scream: Eleanor Voss, Jasper Crane, and Mildred Cho.",
            "Detectives recovered three possible weapons from the scene — a Letter Opener, a Candlestick, and a Poison Vial — and have narrowed the murder to one of three rooms: the Library, the Conservatory, or the Study. Study the wire-room clues below and determine, for each guest, which weapon they carried and which room they occupied."
          ]
        },
        puzzleData: {
          suspects: ["Eleanor Voss", "Jasper Crane", "Mildred Cho"],
          weapons: ["Letter Opener", "Candlestick", "Poison Vial"],
          locations: ["Library", "Conservatory", "Study"],
          clues: [
            "The person found in the Library did not wield the Letter Opener.",
            "Eleanor Voss swore she never once set foot in the Library that night.",
            "The Candlestick was not the weapon used in the Conservatory.",
            "Mildred Cho fainted at the mere mention of poison — she could never have used the Vial.",
            "Jasper Crane was overheard pacing near the Library minutes before the scream.",
            "Whatever weapon was used in the Study left no blade marks and no residue — a blunt, heavy object.",
            "Mildred Cho spent the entire evening in the Conservatory, tending to her orchids."
          ]
        },
        solution: {
          "Eleanor Voss": { weapon: "Candlestick", location: "Study" },
          "Jasper Crane": { weapon: "Poison Vial", location: "Library" },
          "Mildred Cho": { weapon: "Letter Opener", location: "Conservatory" }
        },
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "Nice work on the Voss case. But the gala was only the opening act. Check your line again once you've caught your breath. — a friend"
        }
      },
      {
        id: "easy-ch3",
        levelID: "easy",
        chapterIndex: 3,
        puzzleType: "cipher",
        puzzleLabel: "Coded Evidence",
        narrativeContent: {
          headline: "A CODED NOTE FOUND IN THE VICTIM'S POCKET",
          byline: "Filed from Precinct 9 — Staff Correspondent",
          briefing: [
            "Forensics turned up a scrap of paper folded into the victim's coat lining. It's scrawled in a simple substitution cipher — every letter has been shifted forward by three places in the alphabet (A becomes D, B becomes E, and so on).",
            "Decode the message below and type your answer, in plain English, into the terminal to the right. Case is not sensitive."
          ]
        },
        puzzleData: {
          cipherText: "PHHW PH DW WKH ZKDUI DW PLGQLJKW",
          shiftHint: "Each letter has been shifted forward by 3. To decode, shift backward by 3.",
          answer: "MEET ME AT THE WHARF AT MIDNIGHT"
        },
        solution: "MEET ME AT THE WHARF AT MIDNIGHT",
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "So you can read between the lines. Good. The wharf keeps a logbook. Someone left the front door open for you — figuratively speaking."
        }
      },
      {
        id: "easy-ch4",
        levelID: "easy",
        chapterIndex: 4,
        puzzleType: "terminal",
        puzzleLabel: "Dockmaster Terminal",
        narrativeContent: {
          headline: "THE WHARF OFFICE TERMINAL",
          byline: "Filed from the Harbor District — Staff Correspondent",
          briefing: [
            "The dockmaster's office computer is still logged in, guarding a single locked file titled 'MANIFEST'. A sticky note nearby reads: 'password = the ship that left port at midnight, all lowercase, no spaces.'",
            "The evening's departure log lists only one vessel sailing at midnight: the Black Gull. Type the password into the terminal below to unlock the manifest and close the case."
          ]
        },
        puzzleData: {
          promptText: "MANIFEST_TERMINAL v1.2\ntype password and press ENTER\n>",
          answer: "blackgull"
        },
        solution: "blackgull",
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "Manifest's open. That's everything I can give you without showing my face. Print the story, Detective. — a friend"
        }
      }
    ]
  },

  /* ======================================================================
     MEDIUM — hidden-object intro, 4x4 grid, wider-shift cipher, longer
     terminal password
     ====================================================================== */
  medium: {
    id: "medium",
    label: "Medium",
    gridSize: 4,
    description: "A five-chapter case that opens with a hidden-object scene, then a denser 4x4 deduction grid and a tougher cipher shift.",
    chapters: [
      {
        id: "medium-ch1",
        levelID: "medium",
        chapterIndex: 1,
        puzzleType: "hiddenobject",
        puzzleLabel: "Examine the Scene Sketch",
        narrativeContent: {
          headline: "BLACKWOOD VAULT HEIST BAFFLES POLICE",
          byline: "Filed from the Financial District — Staff Correspondent",
          briefing: [
            "Four vaults at the Blackwood Trust were breached in a single night. Investigators have released a sketch of the vault corridor as it was found.",
            "Study the sketch below. Three items in the scene do not belong to an ordinary bank night and may bear on the case. Tap each one you find."
          ]
        },
        puzzleData: {
          sceneWidth: 900,
          sceneHeight: 560,
          targets: [
            { id: "drill", label: "An abandoned drill bit", x: 0.20, y: 0.65, radius: 0.06 },
            { id: "badge", label: "A dropped security badge", x: 0.68, y: 0.50, radius: 0.05 },
            { id: "wire", label: "Cut alarm wire", x: 0.45, y: 0.30, radius: 0.06 }
          ],
          foundMessage: "Marked — carry on.",
          allFoundMessage: "All three items marked. Submit your findings to file this scene."
        },
        solution: ["drill", "badge", "wire"],
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "That badge is the tell. Whoever cut the alarm wire had access already. Grid's next — four names, four vaults."
        }
      },
      {
        id: "medium-ch2",
        levelID: "medium",
        chapterIndex: 2,
        puzzleType: "grid",
        puzzleLabel: "Deduction Grid",
        narrativeContent: {
          headline: "FOUR NAMES, FOUR VAULTS, ONE NIGHT",
          byline: "Filed from the Financial District — Staff Correspondent",
          briefing: [
            "Each of the four vaults was cracked with a different method and by a different member of the crew police believe pulled off the job: Nadia Ruiz, Owen Park, Vivian Cole, and Marcus Reyes.",
            "Match every name to their method and the order in which each vault was hit, using the wire-room clues below."
          ]
        },
        puzzleData: {
          suspects: ["Nadia Ruiz", "Owen Park", "Vivian Cole", "Marcus Reyes"],
          weapons: ["Drill", "Thermal Lance", "Lockpicks", "Stolen Keycard"],
          locations: ["Vault 1", "Vault 2", "Vault 3", "Vault 4"],
          clues: [
            "Nadia Ruiz is a locksmith by trade and touched nothing but tumblers — she used the Lockpicks.",
            "The Drill was used on Vault 2, and Nadia Ruiz was nowhere near Vault 2 that night.",
            "Owen Park's fingerprints turned up on a Stolen Keycard reader outside Vault 1.",
            "Vivian Cole set off thermal alarms in Vault 3 — the Thermal Lance was hers.",
            "Marcus Reyes was caught on camera wheeling a drill rig toward Vault 2.",
            "Owen Park was the first through a vault door that night, before any of the others.",
            "Nadia Ruiz picked her way into Vault 4, the last one breached.",
            "Vivian Cole's vault was hit directly after Owen Park's."
          ]
        },
        solution: {
          "Nadia Ruiz": { weapon: "Lockpicks", location: "Vault 4" },
          "Owen Park": { weapon: "Stolen Keycard", location: "Vault 1" },
          "Vivian Cole": { weapon: "Thermal Lance", location: "Vault 3" },
          "Marcus Reyes": { weapon: "Drill", location: "Vault 2" }
        },
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "Four for four. But there's a wrinkle — check the note that came with the case file."
        }
      },
      {
        id: "medium-ch3",
        levelID: "medium",
        chapterIndex: 3,
        puzzleType: "cipher",
        puzzleLabel: "Coded Evidence",
        narrativeContent: {
          headline: "A SECOND NOTE, HARDER TO CRACK",
          byline: "Filed from Precinct 9 — Staff Correspondent",
          briefing: [
            "A second cipher turned up, this one shifted five places forward instead of three (A becomes F, B becomes G, and so on).",
            "Decode the message and type your plain-English answer into the terminal to the right."
          ]
        },
        puzzleData: {
          cipherText: "YMJ KTZWYM ANFZQY BFX F IJHTB",
          shiftHint: "Each letter has been shifted forward by 5. To decode, shift backward by 5.",
          answer: "THE FOURTH VAULT WAS A DECOY"
        },
        solution: "THE FOURTH VAULT WAS A DECOY",
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "A decoy — so the real prize is still out there. There's a terminal at the old freight office. The password isn't short this time."
        }
      },
      {
        id: "medium-ch4",
        levelID: "medium",
        chapterIndex: 4,
        puzzleType: "terminal",
        puzzleLabel: "Freight Office Terminal",
        narrativeContent: {
          headline: "THE FREIGHT OFFICE TERMINAL",
          byline: "Filed from the Rail Yard — Staff Correspondent",
          briefing: [
            "An old freight-office computer guards a file named 'REALPRIZE'. A note taped to the monitor reads: 'password = the crew's four first names, in the order they hit the vaults, all lowercase, no spaces.'",
            "You already worked out the order from the deduction grid: Owen, Marcus, Vivian, Nadia. Type it into the terminal below."
          ]
        },
        puzzleData: {
          promptText: "REALPRIZE_TERMINAL v2.0\ntype password and press ENTER\n>",
          answer: "owenmarcusviviannadia"
        },
        solution: "owenmarcusviviannadia",
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "That's the real prize located. Nicely stitched together, Detective. Print it."
        }
      }
    ]
  },

  /* ======================================================================
     HARD — hidden-object intro, 5x5 grid, wide-shift cipher, long
     compound terminal password
     ====================================================================== */
  hard: {
    id: "hard",
    label: "Hard",
    gridSize: 5,
    description: "A six-chapter case that opens with a hidden-object scene, then a full 5x5 deduction grid, a wide cipher shift, and a demanding final password.",
    chapters: [
      {
        id: "hard-ch1",
        levelID: "hard",
        chapterIndex: 1,
        puzzleType: "hiddenobject",
        puzzleLabel: "Examine the Scene Sketch",
        narrativeContent: {
          headline: "FIVE GUESTS, FIVE ALIBIS, ONE MANOR",
          byline: "Filed from Ashcombe Manor — Staff Correspondent",
          briefing: [
            "Ashcombe Manor's reading of the will ended before it began: the host was found dead in the east wing. Investigators have released a sketch of the manor's east hall.",
            "Study the sketch below. Three items in the scene do not belong to an ordinary reading of the will and may bear on the case. Tap each one you find."
          ]
        },
        puzzleData: {
          sceneWidth: 900,
          sceneHeight: 560,
          targets: [
            { id: "key", label: "An unfamiliar brass key", x: 0.55, y: 0.60, radius: 0.05 },
            { id: "letter", label: "A torn, unsigned letter", x: 0.22, y: 0.35, radius: 0.06 },
            { id: "footprint", label: "A muddy footprint on the rug", x: 0.75, y: 0.78, radius: 0.06 }
          ],
          foundMessage: "Marked — carry on.",
          allFoundMessage: "All three items marked. Submit your findings to file this scene."
        },
        solution: ["key", "letter", "footprint"],
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "That footprint didn't come from a guest's evening shoe. Five names, five rooms — the grid will narrow it down."
        }
      },
      {
        id: "hard-ch2",
        levelID: "hard",
        chapterIndex: 2,
        puzzleType: "grid",
        puzzleLabel: "Deduction Grid",
        narrativeContent: {
          headline: "NONE OF THE FIVE WILL ADMIT WHERE THEY STOOD",
          byline: "Filed from Ashcombe Manor — Staff Correspondent",
          briefing: [
            "None of the five remaining guests — Dr. Elias Whitmore, Sister Agnes Doyle, Captain Rourke, Lila Fenwick, and Tobias Kane — will admit to where they were standing.",
            "Detectives have recovered five possible weapons (Revolver, Rope, Wrench, Arsenic Vial, Bronze Statuette) and narrowed the scene to five rooms (Observatory, Boiler Room, Chapel, Greenhouse, Billiard Room). Match every guest to their weapon and their room."
          ]
        },
        puzzleData: {
          suspects: ["Dr. Elias Whitmore", "Sister Agnes Doyle", "Captain Rourke", "Lila Fenwick", "Tobias Kane"],
          weapons: ["Revolver", "Rope", "Wrench", "Arsenic Vial", "Bronze Statuette"],
          locations: ["Observatory", "Boiler Room", "Chapel", "Greenhouse", "Billiard Room"],
          clues: [
            "Dr. Whitmore keeps a Revolver in his coat at all times — it never left his hand that night.",
            "Whitmore was seen climbing the stairs to the Observatory just before the scream.",
            "Sister Agnes Doyle was praying in the Chapel the entire evening, a length of Rope coiled at her feet for the bell tower repair.",
            "Captain Rourke's hands were stained with grease from the Wrench he'd been using on the Boiler Room valves.",
            "Rourke never once left the Boiler Room, by his own account and three witnesses.",
            "Lila Fenwick, the manor's botanist, was tending the Greenhouse with an Arsenic Vial meant for the aphids.",
            "Tobias Kane was found gripping a Bronze Statuette he'd lifted from the Billiard Room mantel.",
            "Kane spent the night racking up a losing streak at the billiard table.",
            "The Chapel's only occupant that night was Sister Agnes Doyle.",
            "The Greenhouse belonged to Lila Fenwick alone for the whole evening."
          ]
        },
        solution: {
          "Dr. Elias Whitmore": { weapon: "Revolver", location: "Observatory" },
          "Sister Agnes Doyle": { weapon: "Rope", location: "Chapel" },
          "Captain Rourke": { weapon: "Wrench", location: "Boiler Room" },
          "Lila Fenwick": { weapon: "Arsenic Vial", location: "Greenhouse" },
          "Tobias Kane": { weapon: "Bronze Statuette", location: "Billiard Room" }
        },
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "Five for five. Ashcombe Manor never stood a chance against you. There's a longer cipher waiting — don't rush it."
        }
      },
      {
        id: "hard-ch3",
        levelID: "hard",
        chapterIndex: 3,
        puzzleType: "cipher",
        puzzleLabel: "Coded Evidence",
        narrativeContent: {
          headline: "A THIRD NOTE, SHIFTED FARTHER STILL",
          byline: "Filed from Precinct 9 — Staff Correspondent",
          briefing: [
            "This note is shifted seven places forward (A becomes H, B becomes I, and so on) — the widest shift yet.",
            "Decode the message and type your plain-English answer into the terminal to the right."
          ]
        },
        puzzleData: {
          cipherText: "AOL ZBUYPZL DHZ HSDHFZ AOL DPSS",
          shiftHint: "Each letter has been shifted forward by 7. To decode, shift backward by 7.",
          answer: "THE SUNRISE WAS ALWAYS THE WILL"
        },
        solution: "THE SUNRISE WAS ALWAYS THE WILL",
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "The sunrise. Ashcombe's east-facing study, then — the real will is hiding in plain sight. One terminal left, and it won't be forgiving."
        }
      },
      {
        id: "hard-ch4",
        levelID: "hard",
        chapterIndex: 4,
        puzzleType: "terminal",
        puzzleLabel: "Study Terminal",
        narrativeContent: {
          headline: "THE EAST STUDY TERMINAL",
          byline: "Filed from Ashcombe Manor — Staff Correspondent",
          briefing: [
            "A terminal in the east-facing study guards a file named 'TRUEWILL'. A note reads: 'password = the five rooms, in the order the guests occupied them by the clock — Observatory first — all lowercase, no spaces.'",
            "You already have that order from the deduction grid: Observatory, Chapel, Boiler Room, Greenhouse, Billiard Room. Type it in below."
          ]
        },
        puzzleData: {
          promptText: "TRUEWILL_TERMINAL v3.1\ntype password and press ENTER\n>",
          answer: "observatorychapelboilerroomgreenhousebilliardroom"
        },
        solution: "observatorychapelboilerroomgreenhousebilliardroom",
        phoneMessage: {
          sender: "UNKNOWN NUMBER",
          text: "True will's open. Every vault, every cipher, every room — you never missed a step. This is the last front page you'll need from me. — a friend"
        }
      }
    ]
  }

};
