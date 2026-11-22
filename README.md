# Blank website

A clean HTML, CSS and JavaScript starting point with Vite's live reload.
No framework, accounts, database or external services are needed.

## Run locally

```sh
bun install
bun run dev
```

Open the URL printed by Vite. The server binds to `0.0.0.0` so it also works
in a Freebuff Cloud preview.

## Make it yours

- `index.html` — page content, title and description.
- `src/style.css` — styles, colors and typography.
- `src/main.js` — browser behavior and the stylesheet import.
- `public/` — create this folder for images and other static files.

Replace the greeting with your website. Add a framework only if your project
needs one.

## Tests

The game ships its own regression suite. It drives the real `index.html` in
headless Chrome through the same functions the UI uses, with a fixed RNG seed
so a failure can be replayed.

```sh
npm test                 # every spec
npm test -- capture      # one area (capture, economy, ai, objectives, …)
npm test -- --seed=42    # reproduce a specific run
```

No test dependency is installed: the harness talks to Chrome over the DevTools
protocol using Node's built-in `fetch`/`WebSocket` (Node 22+). Chrome is found at
the usual paths; set `CHROME_PATH` if it lives elsewhere.

## Build and publish

```sh
bun run build
bun run preview
```

The build produces `dist/`. When the user asks to publish on Freebuff Sites,
use `sites_deploy` with `deploy.json`. Its tiny `worker/index.js` serves the
built assets through the platform's `ASSETS` binding. No integrations or
secrets are required. Other static hosts can serve `dist/` directly.
