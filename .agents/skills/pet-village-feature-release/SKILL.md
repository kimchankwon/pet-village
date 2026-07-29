---
name: pet-village-feature-release
description: "Finish Pet Village player-facing features and fixes with the repository's required release ritual. Use whenever implementing gameplay, UI, art, content, or player-visible bug fixes in pet-village: bump the app version, verify locally, deploy both a playable PR app and temporary HTML PR explanation to Netlify, and link both from the PR without committing deployment artifacts."
---

# Pet Village Feature Release

Complete the implementation before calling it finished. Treat the version bump,
local verification, playable Netlify app, and Netlify explanation as required deliverables.

## Workflow

1. Inspect `src/appVersion.ts`, `package.json`, and `package-lock.json` before editing.
2. Implement the player-facing change and add focused regression coverage where practical.
3. Bump all three version locations together:
   - patch for fixes, polish, and asset corrections;
   - minor for new gameplay or a meaningful player-facing capability;
   - major only for breaking saves/APIs or a large redesign.
4. Run `npm test` and `npm run build`. Run any feature-specific local check as well.
5. Exercise the feature locally in a browser when behavior or visuals changed. Check the browser console and test relevant map edges, viewport sizes, and input methods.
6. Prepare a standalone HTML explanation in `/tmp/pet-village-pr-{N}-explain/`. Include:
   - a concise TL;DR;
   - what changed and why;
   - how a reviewer can try it;
   - the exact verification performed;
   - the PR link when available.
   Write it in the theme of the game — see "Explanation page theme" below. A
   plain white developer changelog is not an acceptable deliverable.
7. Build a root-hosted Netlify preview with `npm run build -- --base=/ --outDir=/tmp/pet-village-pr-{N}-app --emptyOutDir`. This is separate from, and does not replace, the regular production build in step 4.
8. Also deploy the app on Netlify as `pet-village-pr-{N}.netlify.app`: create or reuse a site named exactly `pet-village-pr-{N}`, then deploy the preview directory. Production URL must be `https://pet-village-pr-{N}.netlify.app` (for example, PR 70 → `https://pet-village-pr-70.netlify.app`).
9. Deploy only the temp explanation directory to a separate Netlify site named `pet-village-pr-{N}-explain`.
10. Confirm both live URLs respond successfully, then put both in the PR body, clearly labeled **Playable app** and **Feature explanation**.
11. Confirm no explanation-page, Netlify state, or build artifact is tracked in the working tree.

## Explanation page theme

The explanation is a page about Pet Village, so it should look like it belongs
to Pet Village. A reviewer should recognise it as the same product before they
read a word of it.

- **Type and palette come from the game.** Monospace throughout, matching the
  canvas UI. Build the palette from the values already in `src/` rather than
  inventing one: the winter-night grounds (`#0f1a26`, `#1a2838`, `#2e4258`),
  ice (`#d8e6f2`), and the accent trio the HUD and menus already use — coin
  yellow `#ffe066` for headings, mint `#a8e6cf` for affirmatives and links,
  rose `#ffb3d1` for the "before" or negative side.
- **Frame it like the running game.** Open with the shell's own top bar — the
  mint `Menu` chip, "Pet Village", the shipped version — and lay the content out
  in bordered panels with the chunky offset shadow the in-game menus use.
- **Show, using the game's own art.** Copy the relevant sprites out of the build
  into the temp directory and render them at their true relative sizes with
  `image-rendering: pixelated`. A before/after drawn with real sprites explains a
  visual change in a way prose cannot. For non-visual changes, prefer a small
  diagram or a table over a wall of text.
- **A touch of the game's weather** (drifting snow, a subtle gradient sky) is
  welcome; keep it behind `prefers-reduced-motion` and never let it obscure text.
- **Write in the game's register.** Name things the way the village does —
  villagers, puffles, the Shore, Cafe Cinnamon — not "NPC entities" and
  "scene 3". Keep the engineering facts exact; only the voice is playful.
- **It still has to work as a document.** Responsive down to a phone, readable
  contrast, wide tables and diagrams scrolling inside their own container rather
  than the page. Everything inline and self-contained — no CDN, no remote fonts.

## Netlify constraints

- Keep the root-hosted app preview, explanation HTML, and copied screenshots/sprites in `/tmp`; never add them to the repository.
- Reuse each existing exact-name Netlify site when it exists; otherwise create it (`npx --yes netlify-cli@26.2.0 sites:create --name pet-village-pr-{N}` / `…-explain`). Do not reuse a differently named or previously linked site.
- Do not deploy the normal `dist/` directory to the PR site: its `/pet-village/` base targets GitHub Pages and breaks root-hosted Netlify assets.
- Deploy the root-hosted preview with `npx --yes netlify-cli@26.2.0 deploy --prod --no-build --dir=/tmp/pet-village-pr-{N}-app --site=<app-site-id>`.
- Deploy the explanation with `npx --yes netlify-cli@26.2.0 deploy --prod --no-build --dir=<temp-dir> --site=<explain-site-id>`.
- Always pass the explicit site ID so repository-level Netlify linkage cannot redirect either deployment.
- Do not claim deployment success until both production URLs respond successfully and show the intended content. For the app, verify the root HTML and every browser-requested asset needed to load it—including scripts, stylesheets, module chunks, fonts, and images—return HTTP 200; checking a single representative asset is not sufficient.

## Completion report

Report the shipped version, test/build results, browser verification, playable app URL, live explanation URL, and any remaining limitation. Do not describe a feature as complete if any required step failed. Say plainly which claims were verified by running the thing and which rest on reasoning alone.
