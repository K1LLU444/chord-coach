# Chord Coach

A piano chord helper for a Casio CT-S300 (61 keys), made for a complete beginner.
Runs in the browser on Mac and iPhone (add it to the home screen to use it like an app, offline too).

- **Playing style**: a switch under the header picks how the hands share a chord: *Bass + chord* (left hand root → 5th → octave, right hand chord), *Chord + broken notes* (left hand chord, right hand notes one at a time) or *Strum* (right hand strikes the chord on every count, left hand adds the bass). Every tab follows it.
- **Sheets** tab: printable A4 pages for a music stand. *Cheat sheets* (5 pages: reading any chord, the three styles with fingerings, all major/minor chords, 7th chords, and a page for one of your songs) and *Music sheets* (every common chord on a staff, left hand blue and right hand orange, one playing style per page set; optional rarer chords). Press Print / Save as PDF. Ready-made PDFs are kept in `cheat-sheets/` on the Mac (not uploaded).
- **Practice** (Songs tab): a "Best fit" suggestion (style, tempo, how to count, easier chords to start with), a metronome and a sample of the song (this section, from the selected chord, or the whole song) played in the chosen style, optionally on a loop (repeats until you press Stop; the count-in plays once). Songs sent from Ultimate Guitar bring their own strumming pattern and tempo (`js/rhythm.js`, `js/analyze.js`, `js/player.js`).
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
