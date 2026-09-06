import RAPIER from '@dimforge/rapier2d-compat';
import { Game } from './game';

const DT = 1 / 60;

async function boot(): Promise<void> {
  await RAPIER.init();

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  const game = new Game();
  const seedParam = new URLSearchParams(location.search).get('seed');
  const seed = seedParam !== null && /^\d{1,10}$/.test(seedParam) ? Number(seedParam) >>> 0 : (Math.random() * 2 ** 31) | 0;
  game.reset(seed);

  const mapButton = document.getElementById('map-button') as HTMLButtonElement;
  const launchButton = document.getElementById('launch-button') as HTMLButtonElement;
  mapButton.addEventListener('click', () => { game.toggleChart(); mapButton.blur(); });
  launchButton.addEventListener('click', () => { game.launch(); launchButton.blur(); });
  let uiState = '';
  function syncControls(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const key = `${game.state}:${game.chartOpen}:${game.mapH}:${w}:${h}`;
    if (key === uiState) return;
    uiState = key;
    const scale = Math.min(1, w / 900, h / 620);
    mapButton.hidden = game.state === 'gameover' || game.state === 'win';
    mapButton.innerHTML = game.chartOpen ? 'Close map <small>Esc</small>' : 'Map &amp; legend <small>Tab</small>';
    mapButton.setAttribute('aria-expanded', String(game.chartOpen));
    mapButton.style.top = `${game.chartOpen || game.state === 'menu' ? 16 : (28 + 170 * game.mapH / game.mapW) * scale}px`;
    mapButton.style.transform = `scale(${scale})`;
    launchButton.hidden = game.state !== 'menu' || game.chartOpen;
    launchButton.style.top = `${h / 2 + 227 * scale}px`;
    launchButton.style.transform = `translateX(-50%) scale(${scale})`;
  }

  let last = performance.now();
  let acc = 0;
  function frame(now: number): void {
    // Clamp so a backgrounded tab doesn't trigger a catch-up death spiral
    acc += Math.min((now - last) / 1000, 0.25);
    last = now;
    while (acc >= DT) {
      game.fixedUpdate(DT);
      acc -= DT;
    }
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.render(ctx, canvas.clientWidth, canvas.clientHeight);
    syncControls();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
