// Turns a button into a press-and-hold confirm. Releasing early cancels.
function attachHold(btn, { seconds = 10, idleLabel, holdLabel, onComplete, onCancel } = {}) {
  const total = seconds * 1000;
  let raf = null, startedAt = 0, finished = false;

  btn.classList.add("hold");
  btn.style.touchAction = "none";
  if (idleLabel) btn.textContent = idleLabel;

  const setProgress = (p) => btn.style.setProperty("--progress", `${(p * 100).toFixed(1)}%`);

  function frame(now) {
    const p = Math.min((now - startedAt) / total, 1);
    setProgress(p);
    btn.textContent = `${holdLabel} ${Math.ceil((1 - p) * seconds)}`;
    if (p >= 1) return finish();
    raf = requestAnimationFrame(frame);
  }

  function begin(e) {
    if (finished || btn.disabled || raf) return;
    e.preventDefault();
    startedAt = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function release(early = true) {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (finished) return;
    setProgress(0);
    btn.textContent = idleLabel;
    if (early && startedAt) onCancel?.();
    startedAt = 0;
  }

  function finish() {
    finished = true;
    raf = null;
    setProgress(1);
    onComplete?.();
  }

  btn.addEventListener("pointerdown", begin);
  btn.addEventListener("pointerup", () => release());
  btn.addEventListener("pointerleave", () => release());
  btn.addEventListener("pointercancel", () => release());
  // Keyboard equivalent: hold Space or Enter.
  btn.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) begin(e);
  });
  btn.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") release();
  });

  return {
    reset(label = idleLabel) {
      finished = false;
      idleLabel = label;
      release(false);
    }
  };
}
