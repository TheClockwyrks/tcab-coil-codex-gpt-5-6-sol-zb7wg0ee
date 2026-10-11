# Coil

Coil is a neon grid-serpent game about routing under pressure. Eat pulses to grow, avoid the wall and your own trail, and reach each new pulse before the combo window drains. Quick consecutive eats raise the multiplier to x5.

## Run locally

Requires a current Node.js installation.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To create the self-contained static site, run `npm run build`; the result is written to `dist/` and can be served from a site root or sub-path. The committed PNG and WAV files under `assets/` are bundled directly and require no generation tools.

## Controls

- Move: Arrow keys or WASD
- Confirm: Enter or Space
- Pause/resume: P or Escape
- Mute/unmute: M
- Menus also support mouse and touch

Use `npm test` for the simulation tests. `npm run typecheck`, `npm run lint`, and `npm run format` run the remaining project checks.
