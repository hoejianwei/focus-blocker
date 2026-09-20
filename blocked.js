// Everything after "?url=" is the original URL, kept raw so its own query survives.
const raw = location.search.replace(/^\?url=/, "");
let original = raw;
try { original = decodeURIComponent(raw); } catch { /* raw was already fine */ }

const hostEl = document.getElementById("host");
const btn = document.getElementById("unlock");
const note = document.getElementById("note");
const IDLE = "Hold 10s for 7 minutes";
const DEFAULT_NOTE = "The block comes back automatically.";

try {
  hostEl.textContent = new URL(original).hostname.replace(/^www\./, "");
} catch { /* keep the default label */ }

const hold = attachHold(btn, {
  seconds: 10,
  idleLabel: IDLE,
  holdLabel: "Keep holding…",
  onCancel() {
    note.textContent = "Let go early — still blocked.";
  },
  async onComplete() {
    btn.disabled = true;
    btn.textContent = "Unlocking…";
    note.textContent = DEFAULT_NOTE;
    const res = await chrome.runtime.sendMessage({ type: "unlock", minutes: 7 });
    if (!res?.ok) {
      btn.disabled = false;
      hold.reset(IDLE);
      note.textContent = "Something went wrong — try again.";
      return;
    }
    if (/^https?:/.test(original)) {
      location.replace(original);
      return;
    }
    // Fallback rules don't carry the original URL; offer the sites instead.
    const state = await chrome.runtime.sendMessage({ type: "status" });
    btn.remove();
    note.innerHTML = "Unlocked. Continue to: " + (state.sites || [])
      .map((h) => `<a href="https://${h}/">${h}</a>`).join(" · ");
  }
});
