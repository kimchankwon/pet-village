---
name: pet-village-feature-release
description: "Finish Pet Village player-facing features and fixes with the repository's required release ritual. Use whenever implementing gameplay, UI, art, content, or player-visible bug fixes in pet-village: bump the app version, verify locally, deploy a temporary HTML PR explanation to Netlify, and link the explanation from the PR without committing deployment artifacts."
---

# Pet Village Feature Release

Complete the implementation before calling it finished. Treat the version bump,
local verification, and Netlify explanation as required deliverables.

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
7. Deploy only the temp directory to a Netlify site named `pet-village-pr-{N}-explain`.
8. Put the live Netlify URL in the PR body.
9. Confirm no explain-page or Netlify build artifact is tracked in the working tree.

## Netlify constraints

- Keep explain HTML and copied screenshots/sprites in `/tmp`; never add them to the repository.
- Reuse an existing matching Netlify site when it exists; otherwise create the exact site name.
- Deploy production output with `npx netlify deploy --prod --dir=<temp-dir> --site=<site-id>`.
- Do not claim deployment success until the live URL responds successfully.

## Completion report

Report the shipped version, test/build results, browser verification, live explanation URL, and any remaining limitation. Do not describe a feature as complete if any required step failed.
