// Focus Blocker — blocks a list of sites, with a short pass scoped to one tab.
//
// The redirect rule is ALWAYS on. A pass doesn't remove it; it adds a
// higher-priority session rule that exempts a single tab id. So any other tab —
// including a brand new one opened during a pass — still gets blocked, and the
// worst a bookkeeping bug can do is leave one dead tab exempt.

const BLOCK_RULE_ID = 1;
const ALLOW_RULE_ID = 2;
const FALLBACK_IDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const TICK_ALARM = "tick";
const REBLOCK_ALARM = "reblock";
const DEFAULT_SITES = ["instagram.com", "youtube.com"];
const DEFAULT_MINUTES = 7;

async function getSites() {
  const { sites } = await chrome.storage.local.get("sites");
  return Array.isArray(sites) && sites.length ? sites : DEFAULT_SITES;
}

async function getState() {
  const { unlockUntil, passTabId } = await chrome.storage.local.get(["unlockUntil", "passTabId"]);
  return {
    unlockUntil: typeof unlockUntil === "number" ? unlockUntil : 0,
    passTabId: typeof passTabId === "number" ? passTabId : null
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function sitePattern() {
  const hosts = (await getSites()).map(escapeRe).join("|");
  return `^https?://([a-z0-9-]+\\.)*(${hosts})/.*`;
}

async function isBlockedUrl(url) {
  const hosts = (await getSites()).map(escapeRe).join("|");
  return new RegExp(`^https?://([a-z0-9-]+\\.)*(${hosts})/`).test(url);
}

function blockPageFor(url) {
  return chrome.runtime.getURL(`blocked.html?url=${url}`);
}

// Always-on: send blocked sites to the block page. Falls back to plain
// urlFilter rules if the regex form is ever rejected, and records why.
async function installBlockRule() {
  const page = chrome.runtime.getURL("blocked.html");
  const ids = [BLOCK_RULE_ID, ...FALLBACK_IDS];
  const regexRule = {
    id: BLOCK_RULE_ID,
    priority: 1,
    // \0 is the whole matched URL, handed to the block page so we can return to it.
    action: { type: "redirect", redirect: { regexSubstitution: `${page}?url=\\0` } },
    condition: { regexFilter: await sitePattern(), resourceTypes: ["main_frame"] }
  };
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids, addRules: [regexRule] });
    await chrome.storage.local.set({ lastRuleError: null });
  } catch (err) {
    console.error("[Focus Blocker] regex rule rejected:", err);
    const sites = await getSites();
    const simple = sites.slice(0, FALLBACK_IDS.length).map((host, i) => ({
      id: FALLBACK_IDS[i],
      priority: 1,
      action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } },
      condition: { urlFilter: `||${host}`, resourceTypes: ["main_frame"] }
    }));
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids, addRules: simple });
      await chrome.storage.local.set({ lastRuleError: `regex rejected (${err.message}); using simple rules` });
    } catch (err2) {
      console.error("[Focus Blocker] all network rules failed:", err2);
      await chrome.storage.local.set({ lastRuleError: `network rules failed: ${err2.message}` });
    }
  }
}

// The pass: exempt exactly one tab. tabId null tears the exemption down.
async function setExemptTab(tabId) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ALLOW_RULE_ID],
    addRules: tabId == null ? [] : [{
      id: ALLOW_RULE_ID,
      priority: 2, // beats the redirect
      action: { type: "allow" },
      condition: {
        regexFilter: await sitePattern(),
        resourceTypes: ["main_frame"],
        tabIds: [tabId]
      }
    }]
  });
}

async function block({ reloadPassTab = true } = {}) {
  const { passTabId } = await getState();
  await chrome.storage.local.set({ unlockUntil: 0, passTabId: null });
  await chrome.alarms.clear(REBLOCK_ALARM);
  await setExemptTab(null);
  await installBlockRule();
  await updateBadge();
  // Kick the formerly-exempt tab back to the block page instead of leaving it sitting there.
  if (reloadPassTab && passTabId != null) {
    chrome.tabs.reload(passTabId).catch(() => {});
  }
}

async function unlock(minutes = DEFAULT_MINUTES, tabId = null) {
  if (tabId == null) return null; // a pass has to belong to some tab
  const until = Date.now() + minutes * 60_000;
  await chrome.storage.local.set({ unlockUntil: until, passTabId: tabId });
  await setExemptTab(tabId);
  await chrome.alarms.create(REBLOCK_ALARM, { when: until });
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await updateBadge();
  return until;
}

async function updateBadge() {
  const { unlockUntil } = await getState();
  const left = unlockUntil - Date.now();
  if (left > 0) {
    await chrome.action.setBadgeText({ text: `${Math.ceil(left / 60_000)}m` });
    await chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.alarms.clear(TICK_ALARM);
  }
}

// Re-assert the correct state when the worker wakes or the extension loads.
async function sync() {
  await installBlockRule();
  const { unlockUntil, passTabId } = await getState();
  if (unlockUntil > Date.now() && passTabId != null) {
    await setExemptTab(passTabId);
    await chrome.alarms.create(REBLOCK_ALARM, { when: unlockUntil });
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
    await updateBadge();
  } else {
    await block({ reloadPassTab: false });
  }
}

chrome.runtime.onInstalled.addListener(sync);
// A new browser session: session rules are already gone, so start clean.
chrome.runtime.onStartup.addListener(() => block({ reloadPassTab: false }));

// Run on EVERY service-worker start. Reloading an unpacked extension does not
// reliably fire onInstalled, so relying on it alone can leave the rule missing
// and everything permanently unblocked.
sync();

// Belt and braces: enforce in the tabs API too, so a missing or mis-applied
// network rule can't silently unblock anything.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  const url = info.url || tab.url;
  if (!url || !(await isBlockedUrl(url))) return;
  const { unlockUntil, passTabId } = await getState();
  if (unlockUntil > Date.now() && tabId === passTabId) return;
  chrome.tabs.update(tabId, { url: blockPageFor(url) }).catch(() => {});
});

// Closing the tab ends the pass.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { unlockUntil, passTabId } = await getState();
  if (unlockUntil > Date.now() && tabId === passTabId) {
    await block({ reloadPassTab: false });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REBLOCK_ALARM) await block();
  if (alarm.name === TICK_ALARM) await updateBadge();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "unlock": {
        // The block page unlocks its own tab; the popup unlocks the active one.
        let tabId = sender.tab?.id;
        if (tabId == null) {
          const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = active?.id ?? null;
        }
        const until = await unlock(msg.minutes || DEFAULT_MINUTES, tabId);
        sendResponse(until ? { ok: true, unlockUntil: until } : { ok: false, error: "no tab" });
        break;
      }
      case "block":
        await block();
        sendResponse({ ok: true, unlockUntil: 0 });
        break;
      case "status": {
        await sync(); // opening the popup repairs a missing rule
        const { unlockUntil } = await getState();
        const { lastRuleError } = await chrome.storage.local.get("lastRuleError");
        sendResponse({
          ok: true,
          unlockUntil,
          sites: await getSites(),
          minutes: DEFAULT_MINUTES,
          version: chrome.runtime.getManifest().version,
          ruleCount: (await chrome.declarativeNetRequest.getDynamicRules()).length,
          lastRuleError: lastRuleError || null
        });
        break;
      }
      case "setSites": {
        const sites = (msg.sites || [])
          .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
          .filter(Boolean);
        await chrome.storage.local.set({ sites: sites.length ? sites : DEFAULT_SITES });
        await installBlockRule();
        const { unlockUntil, passTabId } = await getState();
        if (unlockUntil > Date.now() && passTabId != null) await setExemptTab(passTabId);
        sendResponse({ ok: true, sites: await getSites() });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // async response
});
