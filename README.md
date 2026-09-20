# Focus Blocker

A small Chrome extension that blocks Instagram and YouTube — with a **hold-to-confirm 7-minute pass** for when you genuinely need them.

- Blocked sites redirect to a local "Not right now." page (subdomains included: `www.`, `m.`, `music.youtube.com`, …).
- To get through, you **press and hold the button for 10 seconds**. Let go early and nothing happens.
- The pass lasts 7 minutes and **belongs to one tab only**. Every other tab stays blocked, including a new tab you open during the pass — so a pass can't quietly spread across the browser.
- **Closing that tab ends the pass immediately** — open Instagram again and you're back at the block page, even with minutes left on the clock.
- When the 7 minutes expire the block returns automatically, and any still-open tabs on those sites are reloaded back to the block page — so you can't stretch the pass by leaving a tab sitting open.
- Restarting Chrome ends any pass in progress.
- Only top-level page loads are blocked, so embedded YouTube players on other sites still work.

Works on **Chrome and Microsoft Edge**, on **macOS and Windows** — the same folder, no separate build. Edge is Chromium underneath and runs this Manifest V3 extension unchanged. (Internet Explorer can't: it was retired in 2022 and never had this extension model.)

## Install (each computer)

Chrome doesn't allow installing extensions from a URL, so you load the folder directly. Takes about a minute.

1. **Get the files.** Either:
   - Download → the green **Code** button above → **Download ZIP** → unzip it somewhere permanent (e.g. your home folder). *Don't leave it in Downloads if you're likely to clean that out — Chrome loads the extension from this folder every time it starts.*
   - Or clone it: `git clone https://github.com/hoejianwei/focus-blocker.git ~/focus-blocker`
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the `focus-blocker` folder (the one containing `manifest.json`).
5. Pin it: click the puzzle-piece icon in the toolbar → pin **Focus Blocker**, so you can see the countdown badge.

Blocking starts immediately.

### Windows

Same five steps, with these differences:

- **Where to put the folder.** Somewhere permanent like `C:\Users\<you>\focus-blocker` — *not* Downloads, and not a folder you sync and later move. The browser reads the extension from this exact path on every launch; move or delete it and the extension breaks.
  ```powershell
  git clone https://github.com/hoejianwei/focus-blocker.git $env:USERPROFILE\focus-blocker
  ```
  No Git on that machine? Download the ZIP, then **right-click → Properties → Unblock** before extracting, and make sure you select the inner folder — the one with `manifest.json` directly inside, not a wrapper folder of the same name.
- **Load unpacked** opens a folder picker: select the folder itself, don't open it and pick a file.

### Microsoft Edge

- Go to `edge://extensions` instead of `chrome://extensions`.
- **Developer mode** is a toggle in the **bottom left** of that page, not the top right.
- **Load unpacked** then works the same way. The extension page, popup, countdown badge and 10-second hold all behave identically.
- Keep the two independent: installing it in Edge doesn't affect Chrome, so if you use both browsers, install it in both — otherwise the other one is an open door.

## Updating — read this, it's the one real trap

After changing the files (`git pull`, or editing them yourself), **Chrome will keep running the old version until you explicitly reload the extension**:

> `chrome://extensions` → the **Focus Blocker** card → click the **circular refresh arrow on the card itself**.

That's the card's own arrow, not the browser's page-reload button.

Two things that look like they should work but don't:

- **Closing the window is not always quitting the browser.** On macOS the process keeps running in the dock, so reopening a window reloads nothing — a real restart is **⌘Q**, then launch again. On Windows closing the last window usually does quit, *unless* "Continue running background apps when Google Chrome is closed" is on in Settings → System, in which case Chrome lives on in the notification area and you need **Exit** from its tray icon, or Task Manager.
- Quitting and relaunching only helps if it was a genuine quit. When in doubt, use the refresh arrow — it always works, on every platform.

A stale build is easy to mistake for a broken one: the extension sits there looking installed while enforcing an older version's behaviour, or, if the old version happened to have its rule lifted for a pass, enforcing nothing at all.

**Confirm the update landed** two ways:
- The version on the extension card matches the `version` in `manifest.json`.
- The popup's bottom line reads `v<version> · 1 rule active`.

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

## Troubleshooting

**Check the popup first.** Its bottom line is the health indicator:

| Line | Meaning |
|---|---|
| `v1.2.0 · 1 rule active` | Working normally. |
| `⚠ … blocking rule not installed` | No rule is live. Opening the popup already tried to repair it — close and reopen the popup to see if it cleared. |
| Version older than `manifest.json` | A stale build. Reload it with the card's refresh arrow (see **Updating**). |

**A blocked site loads anyway.** Almost always a stale build — check the version first. Opening the popup reinstalls the rule, so try that before digging further.

**Looking closer.** `chrome://extensions` → **service worker** under Focus Blocker → in that console:

```js
chrome.runtime.getManifest().version                        // which build is actually running
await chrome.declarativeNetRequest.getDynamicRules()        // expect one redirect rule
await chrome.declarativeNetRequest.getSessionRules()        // the allow rule, only during a pass
await chrome.storage.local.get()                            // unlockUntil, passTabId, lastRuleError
```

An empty array from `getDynamicRules()` means nothing is being blocked at the network layer. Any rule-installation failure is logged there and kept in `lastRuleError`.

**Checking from outside the browser.** It records the running registration in its profile data, which is the ground truth about which build is loaded.

macOS:

```sh
python3 -c "import json;d=json.load(open('$HOME/Library/Application Support/Google/Chrome/Default/Secure Preferences'));
print([(v.get('service_worker_registration_info'),v.get('serviceworkerevents')) for v in d['extensions']['settings'].values() if 'focus-blocker' in str(v.get('path',''))])"
```

Windows (PowerShell) — swap in `Microsoft\Edge` for `Google\Chrome` to check Edge:

```powershell
$p = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Secure Preferences"
(Get-Content $p -Raw | ConvertFrom-Json).extensions.settings.PSObject.Properties |
  Where-Object { $_.Value.path -like "*focus-blocker*" } |
  ForEach-Object { $_.Value.service_worker_registration_info; $_.Value.serviceworkerevents }
```

If the version there is behind `manifest.json`, the browser has not re-read the folder — reload the extension. If `serviceworkerevents` is missing `tabs.onUpdated`, you are on a build older than 1.1.0. The service worker re-asserts the correct state on startup and whenever it wakes.

## Honest limitations

This is a speed bump, not a lock. It's loaded unpacked, so it can be removed or disabled in two clicks from `chrome://extensions`, and it does nothing about other browsers or your phone. It works by making the easy path slightly harder — which is usually enough, but it won't stop a determined detour.
