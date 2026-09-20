// Focus Blocker — blocks a list of sites, with a timed pass.

const RULE_ID = 1;
const TICK_ALARM = "tick";
const REBLOCK_ALARM = "reblock";
const DEFAULT_SITES = ["instagram.com", "youtube.com"];
const DEFAULT_MINUTES = 15;

async function getSites() {
  const { sites } = await chrome.storage.local.get("sites");
  return Array.isArray(sites) && sites.length ? sites : DEFAULT_SITES;
}

async function getUnlockUntil() {
  const { unlockUntil } = await chrome.storage.local.get("unlockUntil");
  return typeof unlockUntil === "number" ? unlockUntil : 0;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function buildRules() {
  const hosts = (await getSites()).map(escapeRe).join("|");
  const page = chrome.runtime.getURL("blocked.html");
  return [{
    id: RULE_ID,
    priority: 1,
    action: {
      type: "redirect",
      // \0 is the whole matched URL, handed to the block page so we can return to it.
      redirect: { regexSubstitution: `${page}?url=\\0` }
    },
    condition: {
      regexFilter: `^https?://([a-z0-9-]+\\.)*(${hosts})/.*`,
      resourceTypes: ["main_frame"]
    }
  }];
}

async function applyBlocking(enabled) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: enabled ? await buildRules() : []
  });
}

async function block({ reloadOpenTabs = true } = {}) {
  await chrome.storage.local.set({ unlockUntil: 0 });
  await chrome.alarms.clear(REBLOCK_ALARM);
  await applyBlocking(true);
  await updateBadge();
  if (reloadOpenTabs) await bounceOpenTabs();
}

async function unlock(minutes = DEFAULT_MINUTES) {
  const until = Date.now() + minutes * 60_000;
  await chrome.storage.local.set({ unlockUntil: until });
  await applyBlocking(false);
  await chrome.alarms.create(REBLOCK_ALARM, { when: until });
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await updateBadge();
  return until;
}

// When the pass expires, kick any still-open blocked tabs back to the block page.
async function bounceOpenTabs() {
  const sites = await getSites();
  const patterns = sites.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);
  const tabs = await chrome.tabs.query({ url: patterns });
  for (const tab of tabs) {
    if (tab.id != null) chrome.tabs.reload(tab.id).catch(() => {});
  }
}

async function updateBadge() {
  const until = await getUnlockUntil();
  const left = until - Date.now();
  if (left > 0) {
    const mins = Math.ceil(left / 60_000);
    await chrome.action.setBadgeText({ text: `${mins}m` });
    await chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.alarms.clear(TICK_ALARM);
  }
}

// Re-assert the correct state whenever the worker wakes up.
async function sync() {
  const until = await getUnlockUntil();
  if (until > Date.now()) {
    await applyBlocking(false);
    await chrome.alarms.create(REBLOCK_ALARM, { when: until });
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
    await updateBadge();
  } else {
    await block({ reloadOpenTabs: false });
  }
}

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REBLOCK_ALARM) await block();
  if (alarm.name === TICK_ALARM) await updateBadge();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "unlock": {
        const until = await unlock(msg.minutes || DEFAULT_MINUTES);
        sendResponse({ ok: true, unlockUntil: until });
        break;
      }
      case "block":
        await block();
        sendResponse({ ok: true, unlockUntil: 0 });
        break;
      case "status":
        sendResponse({
          ok: true,
          unlockUntil: await getUnlockUntil(),
          sites: await getSites(),
          minutes: DEFAULT_MINUTES
        });
        break;
      case "setSites": {
        const sites = (msg.sites || [])
          .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
          .filter(Boolean);
        await chrome.storage.local.set({ sites: sites.length ? sites : DEFAULT_SITES });
        if ((await getUnlockUntil()) <= Date.now()) await applyBlocking(true);
        sendResponse({ ok: true, sites: await getSites() });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // async response
});
