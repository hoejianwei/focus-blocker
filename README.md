# Focus Blocker

A small Chrome extension that blocks Instagram and YouTube — with a **hold-to-confirm 7-minute pass** for when you genuinely need them.

- Blocked sites redirect to a local "Not right now." page (subdomains included: `www.`, `m.`, `music.youtube.com`, …).
- To get through, you **press and hold the button for 10 seconds**. Let go early and nothing happens.
- The pass lasts 7 minutes and **belongs to one tab only**. Every other tab stays blocked, including a new tab you open during the pass — so a pass can't quietly spread across the browser.
- **Closing that tab ends the pass immediately** — open Instagram again and you're back at the block page, even with minutes left on the clock.
- When the 7 minutes expire the block returns automatically, and any still-open tabs on those sites are reloaded back to the block page — so you can't stretch the pass by leaving a tab sitting open.
- Restarting Chrome ends any pass in progress.
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

**Hitting a blocked site** — you get the block page. Hold the button for 10 seconds to unlock, and you're sent straight on to the page you originally wanted. The pass covers that one tab: close it and the block is back, so the way out is simply to close the tab when you're done. A link that opens in a *new* tab will hit the block page — that's deliberate.

**The toolbar popup** — shows time remaining, lets you start a pass from anywhere (same 10-second hold), end a pass early with **Block now**, and edit the site list.

**Changing the blocked sites** — open the popup, edit the list (one domain per line, e.g. `reddit.com`), click **Save list**. Bare domains only; `https://`, `www.` and trailing paths are stripped automatically.

## Changing the timings

Both numbers live in the code:

| What | Where |
|---|---|
| 7-minute pass length | `DEFAULT_MINUTES` in `background.js` |
| 10-second hold | `seconds: 10` in `blocked.js` and `popup.js` |

Reload the extension in `chrome://extensions` after editing.

## How it works

`background.js` keeps one dynamic [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) rule permanently installed: `main_frame` navigations matching the blocked domains are redirected to `blocked.html`, with the original URL passed along so it can be restored after unlocking.

A pass never removes that rule. It adds a higher-priority **session** rule with an `allow` action and a `tabIds` condition naming the single tab that earned the pass. Everything else keeps hitting the redirect. The exemption comes down when the `chrome.alarms` timer fires or when that tab is closed (`tabs.onRemoved`), whichever is first, and session rules are dropped by Chrome at browser restart anyway.

Scoping the exemption instead of lifting the block is what makes this hard to get wrong: there is no window in which the whole browser is unblocked, so a missed event or a sleeping service worker can at worst leave one already-closed tab exempt.

Two further safeguards, both learned the hard way: the rule is re-installed on **every** service-worker start rather than only from `onInstalled`, because reloading an unpacked extension does not reliably fire that event — and a version that only reinstalled on install could be left with no rule at all, silently unblocked forever. And a `tabs.onUpdated` listener independently redirects any non-exempt tab that lands on a blocked site, so the extension does not depend on the network rule alone being correct.

### If something ever gets through

Open the popup — that re-installs the rule on the spot. To look closer, go to `chrome://extensions`, click **service worker** under Focus Blocker, and run `await chrome.declarativeNetRequest.getDynamicRules()` in the console; you should see one redirect rule. The service worker re-asserts the correct state on startup and whenever it wakes.

## Honest limitations

This is a speed bump, not a lock. It's loaded unpacked, so it can be removed or disabled in two clicks from `chrome://extensions`, and it does nothing about other browsers or your phone. It works by making the easy path slightly harder — which is usually enough, but it won't stop a determined detour.
