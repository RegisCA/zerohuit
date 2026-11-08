# Zerohuit

A clean, ad-free minesweeper-style logic puzzle, built for a Fire HD 10 in
landscape. Clue numbers run from zero to eight (*zéro à huit*), a sibling to
[octohuit](https://github.com/RegisCA/octohuit).

## Run it

```sh
npm install
npm run dev      # then open http://localhost:5173/zerohuit/
```

Or build once and serve the static files from `dist/`:

```sh
npm run build
npm run preview
```

## Play it

`.github/workflows/deploy.yml` deploys `main` to GitHub Pages at
`https://regisca.github.io/zerohuit/`. It's an installable PWA. Open it in
Chrome or Silk, "Add to Home Screen", and it works fully offline.

## How it plays

- **Tap** opens a cell. **Long-press** (or right-click) marks it. The
  **Open / Mark** toggle swaps the two, so tapping marks and long-pressing opens.
- **Tap a number** whose marks already match it to open all its other
  neighbours (chording).
- **The first tap is always safe** and always opens an area: mines are placed
  after it, away from it and its neighbours.
- **Undo** takes back the last move, including the one that hit a mine, and
  adds 15 seconds to the clock. The result shows how many undos you used.
  Undo history is kept in memory, so it starts fresh after a reload.
- **When a game ends**, the result shows in the top bar and the board stays
  fully visible.
- **Easy 9×9 · 10**, **Medium 24×14 · 52**, **Hard 30×16 · 99**. Medium and
  Hard are wide so they fill a landscape screen.

## Reading the board

- Raised grey tiles are unopened. White tiles are numbers you're still working.
- **Finished areas fade back.** A number fades once none of its neighbours are
  still unopened, and a mark fades once every number touching it has faded.
  This only uses what you can see, trusting your marks, so it never gives away
  where the mines are.
- A number with **more marks around it than its value** gets a red ring.

## Layout

- One screen, no scrolling. The board scales to fill whatever space is left
  under the top bar.
- In portrait, wide boards rotate a quarter turn to stay large.
- Dark and light themes follow the system, with a manual override.
- The game in progress, the tap mode, and best times per level survive a reload
  (localStorage). The clock pauses while the app is in the background.

## Tests

```sh
npm test         # vitest: placement, flood fill, chording, win/loss, fading rules
```
