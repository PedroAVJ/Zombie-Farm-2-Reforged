export type PlayMode = "local" | "online";

const MODE_KEY = "zf2r.play-mode.v1";

export function getPreferredPlayMode(): PlayMode | null {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === "local" || value === "online" ? value : null;
  } catch {
    return null;
  }
}

export function setPreferredPlayMode(mode: PlayMode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* preference is optional */ }
}

export function clearPreferredPlayMode(): void {
  try { localStorage.removeItem(MODE_KEY); } catch { /* preference is optional */ }
}

export function choosePlayMode(onlineAvailable = true): Promise<PlayMode> {
  if (!onlineAvailable) {
    setPreferredPlayMode("local");
    return Promise.resolve("local");
  }
  const preferred = getPreferredPlayMode();
  if (preferred) return Promise.resolve(preferred);

  const root = document.createElement("div");
  root.className = "zf-mode-gate";
  root.innerHTML = `
    <main class="zf-mode-card" aria-labelledby="zf-mode-title">
      <h1 id="zf-mode-title">Choose Your Farm</h1>
      <p class="zf-mode-intro">Local Farm and Online Farm have completely separate progress.</p>
      <button class="zf-mode-choice" data-mode="local">
        <strong>Play Local</strong>
        <span>Play entirely on this device. No account or internet required.</span>
        <small>Saved in this browser · Single-player features</small>
      </button>
      <button class="zf-mode-choice" data-mode="online">
        <strong>Play Online</strong>
        <span>Sign in to save across devices and use online features.</span>
        <small>Cloud saved · Internet required for gameplay</small>
      </button>
    </main>`;
  document.body.appendChild(root);

  return new Promise((resolve) => {
    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.onclick = () => {
        const mode = button.dataset.mode as PlayMode;
        setPreferredPlayMode(mode);
        root.remove();
        resolve(mode);
      };
    });
  });
}

export function showOnlineUnavailable(
  retry: () => Promise<boolean>,
  openLocal: () => void,
): Promise<void> {
  const root = document.createElement("div");
  root.className = "zf-mode-gate";
  root.innerHTML = `
    <main class="zf-mode-card zf-online-unavailable" aria-labelledby="zf-online-title">
      <h1 id="zf-online-title">Can’t Reach Your Online Farm</h1>
      <p>Your cloud progress is safe, but Online Farm requires an internet connection.</p>
      <button class="zf-mode-action primary" data-action="retry">Try Again</button>
      <button class="zf-mode-action" data-action="local">Open Separate Local Farm</button>
      <small>Local Farm has separate progress and will not change your Online Farm.</small>
      <div class="zf-mode-error" role="status"></div>
    </main>`;
  document.body.appendChild(root);

  return new Promise((resolve) => {
    const retryButton = root.querySelector<HTMLButtonElement>('[data-action="retry"]')!;
    const localButton = root.querySelector<HTMLButtonElement>('[data-action="local"]')!;
    const status = root.querySelector<HTMLElement>(".zf-mode-error")!;
    retryButton.onclick = async () => {
      retryButton.disabled = true;
      localButton.disabled = true;
      status.textContent = "Connecting…";
      if (await retry()) {
        root.remove();
        resolve();
        return;
      }
      status.textContent = "Still unable to connect. Your Online Farm remains safe.";
      retryButton.disabled = false;
      localButton.disabled = false;
    };
    localButton.onclick = openLocal;
  });
}
