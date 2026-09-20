# Focus Blocker

A small Chrome extension that blocks Instagram and YouTube — with a **hold-to-confirm 15-minute pass** for when you genuinely need them.

- Blocked sites redirect to a local "Not right now." page (subdomains included: `www.`, `m.`, `music.youtube.com`, …).
- To get through, you **press and hold the button for 10 seconds**. Let go early and nothing happens.
- The pass lasts 15 minutes. The toolbar badge counts down (`14m`, `13m`…).
- When it expires the block returns automatically, and any still-open Instagram/YouTube tabs are reloaded back to the block page — so you can't stretch the pass by leaving a tab sitting open.
- Restarting Chrome mid-pass keeps the remaining minutes rather than resetting them.
- Only top-level page loads are blocked, so embedded YouTube players on other sites still work.

## Install (each computer)

Chrome doesn't allow installing extensions from a URL, so you load the folder directly. Takes about a minute.

1. **Get the files.** Either:
   - Download → the green **Code** button above → **Download ZIP** → unzip it somewhere permanent (e.g. your home folder). *Don't leave it in Downloads if you're likely to clean that out — Chrome loads the extension from this folder every time it starts.*
   - Or clone it: `git clone https://github.com/hoejianwei/focus-blocker.git ~/focus-blocker`
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the `focus-blocker` folder (the one containing `manifest.json`).
5. Pin it: click the puzzle-piece icon in the toolbar → pin **Focus Blocker**, so you can see the countdown badge.

Blocking starts immediately. To update later: `git pull` in the folder, then hit the refresh icon on the extension's card in `chrome://extensions`.

## Using it

**Hitting a blocked site** — you get the block page. Hold the button for 10 seconds to unlock, and you're sent straight on to the page you originally wanted.

**The toolbar popup** — shows time remaining, lets you start a pass from anywhere (same 10-second hold), end a pass early with **Block now**, and edit the site list.

**Changing the blocked sites** — open the popup, edit the list (one domain per line, e.g. `reddit.com`), click **Save list**. Bare domains only; `https://`, `www.` and trailing paths are stripped automatically.

## Changing the timings

Both numbers live in the code:

| What | Where |
|---|---|
| 15-minute pass length | `DEFAULT_MINUTES` in `background.js` |
| 10-second hold | `seconds: 10` in `blocked.js` and `popup.js` |

Reload the extension in `chrome://extensions` after editing.

## How it works

`background.js` registers one dynamic [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) rule that redirects `main_frame` navigations matching the blocked domains to `blocked.html`, passing the original URL along so it can be restored after unlocking. Unlocking removes the rule and sets a `chrome.alarms` timer; the alarm re-adds it. The service worker re-asserts the correct state on startup and whenever it wakes.

## Honest limitations

This is a speed bump, not a lock. It's loaded unpacked, so it can be removed or disabled in two clicks from `chrome://extensions`, and it does nothing about other browsers or your phone. It works by making the easy path slightly harder — which is usually enough, but it won't stop a determined detour.
