import { createCheatConsole } from './cheat-console';
import { MAX_BLASTS } from './world/exit';
import RAPIER from '@dimforge/rapier2d-compat';
import { Game } from './game';
import { FrameStats } from './frame-stats';
import { FixedStepAccumulator } from './fixed-step';
import { readSaved, writeSaved } from './util/storage';

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
  const cheatConsole = createCheatConsole(game);

  const detonateButton = document.getElementById('detonate-button') as HTMLButtonElement;
  detonateButton.addEventListener('click', () => { game.detonate(); detonateButton.blur(); });
  const mapButton = document.getElementById('map-button') as HTMLButtonElement;
  const launchButton = document.getElementById('launch-button') as HTMLButtonElement;
  const pauseButton = document.getElementById('pause-button') as HTMLButtonElement;
  const retryButton = document.getElementById('retry-button') as HTMLButtonElement;
  const difficultyControls = document.getElementById('difficulty-controls') as HTMLDivElement;
  const difficultyButtons = Array.from(
    difficultyControls.querySelectorAll<HTMLButtonElement>('button'),
  );
  mapButton.addEventListener('click', () => { game.toggleChart(); mapButton.blur(); });
  launchButton.addEventListener('click', () => { game.launch(); launchButton.blur(); });
  pauseButton.addEventListener('click', () => { game.togglePause(); pauseButton.blur(); });
  retryButton.addEventListener('click', () => { game.restart(); retryButton.blur(); });
  difficultyButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      game.selectDifficulty(index);
      button.blur();
    });
  });
  const joystickOption = document.getElementById('joystick-option') as HTMLButtonElement;
  const joystick = document.getElementById('joystick') as HTMLDivElement;
  const joystickKnob = document.getElementById('joystick-knob') as HTMLDivElement;
  joystickOption.addEventListener('click', () => {
    game.input.setFixedJoystick(!game.input.fixedJoystick);
    joystickOption.blur();
  });
  const fpsOption = document.getElementById('fps-option') as HTMLButtonElement;
  const fpsCounter = document.getElementById('fps-counter') as HTMLDivElement;
  const frameStats = new FrameStats();
  let showFps = readSaved('sinv-show-fps') === 'true';
  function syncFps(): void {
    frameStats.reset();
    fpsCounter.hidden = !showFps;
    fpsCounter.textContent = 'Measuring FPS…';
    fpsOption.textContent = `FPS counter: ${showFps ? 'On' : 'Off'}`;
    fpsOption.setAttribute('aria-pressed', String(showFps));
  }
  fpsOption.addEventListener('click', () => {
    showFps = !showFps;
    writeSaved('sinv-show-fps', String(showFps));
    syncFps();
    fpsOption.blur();
  });
  let last = performance.now();
  const simulationClock = new FixedStepAccumulator();
  document.addEventListener('visibilitychange', () => {
    frameStats.reset();
    simulationClock.reset();
    last = performance.now();
  });
  syncFps();
  let uiState = '';
  let detonateState = '';
  let joystickTransform = '';
  function syncControls(): void {
    const detonateHidden = game.state !== 'playing' || game.chartOpen || !game.nearBarrier || game.gate.blasts >= MAX_BLASTS;
    const canDetonate = game.canDetonate;
    const detonateKey = `${detonateHidden}:${canDetonate}:${game.antimatter}`;
    if (detonateKey !== detonateState) {
      detonateState = detonateKey;
      detonateButton.hidden = detonateHidden;
      detonateButton.disabled = !canDetonate;
      detonateButton.textContent = game.antimatter > 0 ? `Detonate · E (${game.antimatter})` : 'Find antimatter capsules';
    }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const key = `${game.input.fixedJoystick}:${game.state}:${game.chartOpen}:${game.difficultyIndex}:${game.mapH}:${w}:${h}`;
    if (key === uiState) return;
    uiState = key;
    fpsOption.hidden = game.chartOpen || (game.state !== 'menu' && game.state !== 'paused');
    frameStats.reset();
    joystickOption.hidden = !game.input.touchCapable || game.chartOpen ||
      (game.state !== 'menu' && game.state !== 'paused');
    joystickOption.textContent = `Fixed joystick: ${game.input.fixedJoystick ? 'On' : 'Off'}`;
    joystickOption.setAttribute('aria-pressed', String(game.input.fixedJoystick));
    joystick.hidden = !game.input.touchCapable || !game.input.fixedJoystick ||
      game.state !== 'playing' || game.chartOpen;
    if (joystick.hidden) {
      game.input.joystickBounds = null;
    } else {
      const bounds = joystick.getBoundingClientRect();
      game.input.joystickBounds = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, radius: bounds.width / 2 };
    }
    const scale = Math.min(1, w / 900, h / 620);
    const buttonScale = game.input.touchCapable ? 1 : scale;
    mapButton.hidden = game.state === 'gameover' || game.state === 'win';
    mapButton.innerHTML = game.chartOpen ? 'Close map <small>Esc</small>' : 'Map &amp; legend <small>Tab</small>';
    mapButton.setAttribute('aria-expanded', String(game.chartOpen));
    mapButton.style.top = `${game.chartOpen || game.state === 'menu' ? 16 : (28 + 170 * game.mapH / game.mapW) * scale}px`;
    fpsCounter.style.top = `${game.chartOpen || game.state === 'menu' ? 76 : (28 + 170 * game.mapH / game.mapW) * scale + 56}px`;
    mapButton.style.transform = `scale(${buttonScale})`;
    launchButton.hidden = game.state !== 'menu' || game.chartOpen;
    launchButton.style.top = `${game.input.touchCapable ? h / 2 + 125 * scale + 54 : h / 2 + 227 * scale}px`;
    launchButton.style.transform = `translateX(-50%) scale(${buttonScale})`;
    pauseButton.hidden = (game.state !== 'playing' && game.state !== 'paused') || game.chartOpen;
    pauseButton.textContent = game.state === 'paused' ? 'Resume' : 'Pause';
    retryButton.hidden = game.state !== 'gameover' && game.state !== 'win';
    retryButton.style.top = `${h / 2 + (game.state === 'win' ? 166 : 142) * scale}px`;
    retryButton.style.transform = `translateX(-50%) scale(${buttonScale})`;
    difficultyControls.hidden =
      !game.input.touchCapable || game.state !== 'menu' || game.chartOpen;
    difficultyControls.style.top = `${h / 2 + 125 * scale}px`;
    difficultyButtons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === game.difficultyIndex));
    });
  }

  const update = (dt: number): void => {
    if (!cheatConsole.isOpen()) game.fixedUpdate(dt);
  };
  function frame(now: number): void {
    simulationClock.advance((now - last) / 1000, update);
    last = now;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.render(ctx, canvas.clientWidth, canvas.clientHeight);
    syncControls();
    cheatConsole.sync();
    const offset = game.input.joystickOffset;
    const transform = `translate(${offset.x * 0.65}px, ${offset.y * 0.65}px)`;
    if (transform !== joystickTransform) {
      joystickTransform = transform;
      joystickKnob.style.transform = transform;
    }
    if (showFps && !document.hidden) {
      const text = frameStats.sample(now);
      if (text !== null) fpsCounter.textContent = text;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
