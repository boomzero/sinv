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
  game.reset((Math.random() * 2 ** 31) | 0);

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
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
