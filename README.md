# Chord Coach

A piano chord helper for a Casio CT-S300 (61 keys), made for a complete beginner.
Runs in the browser on Mac and iPhone (add it to the home screen to use it like an app, offline too).

- **Playing style**: a switch under the header picks how the hands share a chord: *Bass + chord* (left hand root → 5th → octave, right hand chord), *Chord + broken notes* (left hand chord, right hand notes one at a time) *Easy bass* (left hand only the root, held for the bar, just below middle C, so the hands stay close) or *Strum* (right hand strikes the chord on every count, left hand adds the bass). Every tab follows it.
- **Sheets** tab: printable A4 pages for a music stand. *Cheat sheets* (5 pages: reading any chord, the three styles with fingerings, all major/minor chords, 7th chords, and a page for one of your songs) and *Music sheets* (every common chord on a staff, left hand blue and right hand orange, one playing style per page set; optional rarer chords). Press Print / Save as PDF. Ready-made PDFs are kept in `cheat-sheets/` on the Mac (not uploaded).
- **Practice** (Songs tab): a "Best fit" suggestion (style, tempo, how to count, easier chords to start with), a metronome and a sample of the song (this section, from the selected chord, or the whole song) played in the chosen style, optionally on a loop (repeats until you press Stop; the count-in plays once). Songs sent from Ultimate Guitar bring their own strumming pattern and tempo (`js/rhythm.js`, `js/analyze.js`, `js/player.js`).
- **Tune** (Songs tab → open a song → "+ Tune"): type in a melody from a sheet you own, one bar per chord: pick a note length, tap the key; a full bar moves on. It is stored only on this device (and travels in share links). With a tune, the sample plays it in the right hand over the style's left hand ("Play the tune" switch). The tune is entered by the player; the app contains no one's arrangement (`js/melody.js`, `js/views/tune.js`).
- **Pick by count / import / fit check** (Tune screen): a grid of the keys that fit each bar's chord against the counts of the bar (tap to place a note), import of a MusicXML file (`js/musicxml.js`), and a fit check that dots each bar green or red by how many main-beat notes belong to its chord and can suggest removing or adding bars where a tune drifts from the chord chart.
- **Maker** (own tab): build a piece of your own from a sheet you are reading, with no chord chart behind it. Choose a time signature (4/4, 3/4, 2/4, 6/8, 9/8, 12/8, 3/8), tempo, key and number of bars, then fill each bar for each hand on a grid of keys against counts (half counts optional). It gives falling notes and a printable sheet (Sheets tab → Tune sheet), with long notes split into tied notes. Pieces are saved on the device (`js/piece.js`, `js/views/maker.js`, `js/views/count-grid.js`).
- **Type it** (Maker and a song's Tune screen): enter music as text, a line of the sheet at a time: `r:3 Bb4:1 C5 D5 | Eb5:3 D5:2 C5:1` (letter, ♭/♯ as b or #, octave with middle C = C4, `:` and the length in counts, `|` between bars). Mistakes are reported by bar before anything is changed (`js/notation-text.js`, `js/views/type-entry.js`).
- **Practice tools** (Maker, and Songs → Practice): play only a range of bars (From / To, with “Start here”, “End here”, “Only this bar”, “This bar + next 3”), loop it until Stop, a speed from 30 to 150%, one hand at a time (the other hand is left out of the sound and the falling notes). The falling notes have a Small / Medium / Large size and a full-screen mode (the browser's own full screen where it exists, otherwise they cover the page); Esc leaves it (`js/practice.js`, `js/views/practice-controls.js`, `js/views/stage.js`).
- **Reading notes quiz** (Quiz tab → Reading notes): one note on a treble or bass staff (or both), and you tap its key on the keyboard or choose its name (B♭3, F♯3 …). Sharps and flats are optional, a hint writes the letter of every line and space on the staff, and notes you miss come back more often (`js/note-quiz.js`, `js/views/note-quiz.js`).
- **Piano (USB, Chrome on the Mac)**: the **Piano** tab connects the real piano through Web MIDI (Safari and iPhone have no Web MIDI) and shows the keys you press, with the chord they make. Pressed keys light up on every keyboard in the app. **Wait for me** (practice panel) makes the falling notes stop until the right keys are pressed. **Record by playing** (Maker and a song's Tune screen) counts you in, then turns your playing into bars. The reading-notes quiz and the chord quiz's "Play it" accept the piano as the answer (`js/midi.js`, `js/wait-mode.js`, `js/recorder.js`, `js/chord-detect.js`, `js/live-keys.js`, `js/views/piano.js`, `js/views/wait-run.js`, `js/views/record-card.js`).
- **Quiz hands:** the chord quiz can ask about **both hands, the right hand only, the left hand only, or step by step (right, then left, then both)**. The reading-notes quiz gives **3 tries for each note**. Every time the app opens it starts on **Bass + chord** and **both hands** (these two are not remembered between visits).
- **Falling notes** (Songs tab, switch above the keyboards): blue (left hand) and orange (right hand) bars fall onto one keyboard in time with the sample, with finger numbers on the chord notes (`js/falling.js`).
- **Tune sheet** (Sheets tab): a printable A4 page of the tune on a treble staff with the held root on a bass staff, chord names above, four bars to a line (`js/tune-sheet.js`).
- **Finger numbers**: every key you press shows 1–5 (1 thumb … 5 little finger) for both hands in every style, on the Chords tab, the song player and the quiz answers (`js/fingers.js`, the common beginner fingerings). A "Finger numbers" switch turns them off.
- **Volume**: a slider and mute button in the header (80% is the original level, 100% a little louder); the level is remembered. It hides on the Sheets tab (`js/volume.js`).
- **Chords**: search (`Am`, `F#m7`, `Bb major`, `C/E`…) or pick root + type. Shows the left hand
  (root → 5th → octave) in blue and the right hand chord in orange, with inversions and sound.
- **Songs**: paste chords (plain, bars, `[Chorus]` sections, chords-over-lyrics, ChordPro). Step through them:
  hover or ← → on Mac; tap, swipe the keyboard or slide a finger along the chords on iPhone.
  "Smooth hand movement" picks inversions so your right hand barely moves; dashed keys preview the next chord.
- **Quiz**: Find the keys (mark both hands on one keyboard, 3 strikes, optional music-sheet hint) / Play it on your piano / Name it / Hear it, with spaced repetition and a progress grid.

### Songs from Ultimate Guitar

Browsers don't let the app download Ultimate Guitar pages itself, so the Songs tab has a
**Send to Chord Coach** bookmark button (`js/ultimate-guitar.js`). Open a song's chords page on UG,
press the bookmark, and the app opens with the chords and sections (lyrics and guitar tabs dropped,
capo transposed to concert pitch). Sending the same song again updates it. The bookmark points at the
app's current address, so set it up again after moving the app (e.g. to GitHub Pages).

Songs and quiz progress are saved per device (browser storage). Use **Share** to send songs between devices.

## Run it on the Mac

```sh
npm start            # serves on http://localhost:8000
npm test             # checks the chord theory (including the original chord table) and versioning
```

To try it on the iPhone on the same Wi-Fi, open `http://<your-mac-ip>:8000`
(find the IP in System Settings → Wi-Fi → Details). Offline mode only works once it's hosted on https.

## Put it online for free (GitHub Pages)

1. Create a GitHub repository and push this folder to it (branch `main`).
2. Repository → Settings → Pages → Source: **GitHub Actions**.
3. Every push to `main` now runs the tests and publishes the app
   ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). If a test fails, nothing is published.
4. Open `https://<username>.github.io/<repo>/` on the iPhone in Safari → Share → **Add to Home Screen**.

### If a device shows an old version

All files of a version are saved together when that version installs (`sw.js`), and the app opens from that saved set:
instant, offline-friendly, never a mix of versions. The browser checks for a new `sw.js` whenever the app opens or comes
back to the screen; when one arrives the app shows "A new version is ready. Reload". The footer shows `Version xxxxxxx`
and a **Refresh app** button (clears the saved copy; songs and progress are kept). A device that is stuck on an old copy
can open `reset.html` (for example `https://k1llu444.github.io/chord-coach/reset.html`). If a device cannot reach
the website at all (some company networks block `github.io`), it keeps running its saved version.

### Updates and versions (automatic)

`scripts/stamp-sw.mjs` fingerprints the app files and writes the result into `VERSION` in `sw.js`,
together with the list of files to keep offline. It runs on every deploy and on `npm start`,
so there's nothing to bump by hand: any change gives a new version, and phones pick it up the next
time the app is opened (offline apps show the update on the second open). `npm run stamp` runs it
manually; `npm run build` writes the deployable copy to `_site/`.

## Files

- `js/theory.js`: chord parsing, note spelling, voicings, inversions, song parsing
- `js/keyboard.js`: SVG keyboard drawing
- `js/audio.js`: built-in synth (Web Audio)
- `js/views/`: the Chords, Songs and Quiz tabs
- `sw.js`, `manifest.webmanifest`: offline support and home-screen install
