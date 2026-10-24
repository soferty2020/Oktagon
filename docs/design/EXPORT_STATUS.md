# Figma screenshot export status

Date: 2026-10-25
Target: `docs/design/screenshots/`
Figma: https://www.figma.com/design/c5DTybphpHse74fdjtQoPt

## Status: BLOCKED (not exported)

The connected Figma account on Starter has exhausted its MCP call allowance. Attempting to export the dashboard via `get_screenshot` returned the Figma MCP rate-limit error. **No screenshot PNGs have been exported or uploaded to this repository.** Existing `docs/design/screens.md` contains node links and a screen inventory, not image files.

Do not synthesize or substitute screenshots and call them Figma exports. Do not implement visually from guessed screenshots.

## How to unblock
Option A: When the Figma MCP quota renews, export each named frame at 1x/2x PNG and add it to `docs/design/screenshots/`.
Option B: A user with Figma editor access can export the frames manually via Figma's Export panel, then add the resulting PNGs to GitHub.

Suggested naming: `dashboard-desktop.png`, `athletes-desktop.png`, `schedule-desktop.png`, `finance-desktop.png`, `groups-desktop.png`, `attendance-desktop.png`, `settings-desktop.png`, `trainers-desktop.png`, `branches-desktop.png`, `users-desktop.png`, `news-desktop.png`, `chat-desktop.png`, plus detail, dialog, states, tablet and mobile frames.

## DeepSeek Harness handoff
The implementation system is **DeepSeek Harness**, not Hermes. It currently has no Figma access. Until actual screenshot exports are committed, it should use the Markdown specs to plan and audit the UI only, and ask for image assets before attempting pixel-aligned implementation. The existing GitHub issue #24 should be interpreted accordingly.

## Brand asset
The reconstructed logo is provisional and not yet approved as official. Do not use it as the definitive brand logo.
