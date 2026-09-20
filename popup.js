const statusEl = document.getElementById("status");
const sitesEl = document.getElementById("sites");
const savedEl = document.getElementById("saved");
const unlockBtn = document.getElementById("unlock");
const blockBtn = document.getElementById("block");
const IDLE = "Hold 10s to unlock";

function renderDiagnostics(state) {
  const el = document.getElementById("diag");
  if (state.version === undefined) return;
  const problem = state.ruleCount === 0 || state.lastRuleError;
  el.textContent = problem
    ? `⚠ v${state.version} — blocking rule not installed${state.lastRuleError ? `: ${state.lastRuleError}` : ""}`
    : `v${state.version} · ${state.ruleCount} rule${state.ruleCount === 1 ? "" : "s"} active`;
  el.classList.toggle("warn", Boolean(problem));
}

function render(state) {
  renderDiagnostics(state);
  const left = (state.unlockUntil || 0) - Date.now();
  statusEl.textContent = left > 0
    ? `Unlocked — ${Math.ceil(left / 60000)} min left.`
    : "Blocking is on.";
  unlockBtn.disabled = left > 0;
  blockBtn.disabled = left <= 0;
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "status" });
  if (document.activeElement !== sitesEl) sitesEl.value = (state.sites || []).join("\n");
  render(state);
}

const hold = attachHold(unlockBtn, {
  seconds: 10,
  idleLabel: IDLE,
  holdLabel: "Keep holding…",
  async onComplete() {
    render(await chrome.runtime.sendMessage({ type: "unlock", minutes: 7 }));
    hold.reset(IDLE);
  }
});

blockBtn.addEventListener("click", async () => {
  render(await chrome.runtime.sendMessage({ type: "block" }));
  hold.reset(IDLE);
});

document.getElementById("save").addEventListener("click", async () => {
  const sites = sitesEl.value.split(/[\s,]+/).filter(Boolean);
  const res = await chrome.runtime.sendMessage({ type: "setSites", sites });
  sitesEl.value = (res.sites || []).join("\n");
  savedEl.classList.add("show");
  setTimeout(() => savedEl.classList.remove("show"), 1200);
});

refresh();
setInterval(refresh, 15000);
