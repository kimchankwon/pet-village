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
7. Deploy the verified `dist/` app to a Netlify site named `pet-village-pr{N}`. Its production URL must be `https://pet-village-pr{N}.netlify.app` (for example, PR 70 uses `pet-village-pr70.netlify.app`).
8. Deploy only the temp explanation directory to a separate Netlify site named `pet-village-pr-{N}-explain`.
9. Confirm both live URLs respond successfully, then put both in the PR body, clearly labeled **Playable app** and **Feature explanation**.
10. Confirm no explanation-page, Netlify state, or build artifact is tracked in the working tree.

## Netlify constraints

- Keep explanation HTML and copied screenshots/sprites in `/tmp`; never add them to the repository.
- Reuse each existing exact-name Netlify site when it exists; otherwise create it. Do not reuse a differently named or previously linked site.
- Deploy the already verified app build with `npx --yes netlify-cli@26.2.0 deploy --prod --no-build --dir=dist --site=<app-site-id>`.
- Deploy the explanation with `npx --yes netlify-cli@26.2.0 deploy --prod --no-build --dir=<temp-dir> --site=<explain-site-id>`.
- Always pass the explicit site ID so repository-level Netlify linkage cannot redirect either deployment.
- Do not claim deployment success until both production URLs respond successfully and show the intended content.

## Completion report

Report the shipped version, test/build results, browser verification, playable app URL, live explanation URL, and any remaining limitation. Do not describe a feature as complete if any required step failed.
