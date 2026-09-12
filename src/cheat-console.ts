import './cheat-console.css';
import type { Game } from './game';
import { runCheatCommand } from './cheat-commands';

export function createCheatConsole(game: Game): { sync(): void; isOpen(): boolean } {
  const button = document.createElement('button');
  button.textContent = 'Commands /'; button.className = 'game-button'; button.style.cssText = 'left:16px;bottom:82px';
  button.hidden = true;
  const dialog = document.createElement('dialog');
  dialog.className = 'cheat-console';
  dialog.setAttribute('aria-labelledby', 'console-title');
  dialog.innerHTML = `
    <form>
      <header><div><h2 id="console-title">Playtest console</h2><p>Paused <span>· Scores disabled</span></p></div>
        <button type="button" data-close aria-label="Close console">Close <kbd>Esc</kbd></button></header>
      <details open><summary>Command reference <span>Click to fill</span></summary>
        <div class="command-reference"></div>
      </details>
      <p class="console-current" aria-label="Current testing settings"></p>
      <div class="console-archives"></div>
      <div class="console-log-heading"><span>Executed this run</span><button type="button" data-clear>Clear</button></div>
      <div class="console-log" role="log" aria-live="polite" aria-label="Command results"><p class="console-empty">No commands executed this run.</p></div>
      <label for="console-command">Command</label>
      <div class="console-entry"><span aria-hidden="true">›</span><input id="console-command" autocomplete="off" spellcheck="false" placeholder="e.g. magnet 100"><button type="submit">Run ↵</button></div>
      <footer>↑ ↓ command history <span>Escape to resume</span></footer>
    </form>`;
  document.body.append(button, dialog);
  const input = dialog.querySelector('input')!;
  const output = dialog.querySelector<HTMLDivElement>('.console-log')!;
  const reference = dialog.querySelector('.command-reference')!;
  const commands = [
    ['gems 54', 'Set engine power'], ['antimatter 5', 'Set blast capsules'],
    ['shield', 'Arm a shield'], ['heal', 'Restore hull'],
    ['fuel', 'Refill boost'], ['magnet 12', 'Magnetism in seconds'],
    ['tp exit', 'Move to exit approach'], ['tp 1000 1000', 'Move to coordinates'],
    ['hunters off', 'Disable hunters'], ['hunters on', 'Restore hunters'],
    ['time 120', 'Set elapsed seconds'], ['status', 'Inspect this run'],
    ['infinite-boost on', 'Unlimited fuel · on / off'],
    ['impact-immunity on', 'Ignore rock damage · on / off'],
    ['gravity off', 'Player gravity · on / off'],
  ];
  for (const [command, description] of commands) {
    const item = document.createElement('button'); item.type = 'button';
    const code = document.createElement('code'); code.textContent = command;
    const caption = document.createElement('span'); caption.textContent = description;
    item.append(code, caption); reference.append(item);
    item.addEventListener('click', () => { input.value = command; input.focus(); });
  }
  dialog.querySelector('[data-clear]')!.addEventListener('click', () => { output.replaceChildren(); });
  const history: string[] = []; let cursor = 0;
  let displayedRun = game.runId;
  const current = dialog.querySelector<HTMLParagraphElement>('.console-current')!;
  const refresh = () => {
    if (displayedRun !== game.runId) {
      if (output.querySelector('.console-result')) {
        const archive = document.createElement('details');
        const title = document.createElement('summary');
        title.textContent = `Run ${displayedRun} — history only`;
        const log = document.createElement('div'); log.className = 'console-log';
        log.append(...Array.from(output.children));
        archive.append(title, log);
        dialog.querySelector('.console-archives')!.prepend(archive);
      }
      displayedRun = game.runId;
      output.replaceChildren();
      const empty = document.createElement('p'); empty.className = 'console-empty';
      empty.textContent = 'No commands executed this run.'; output.append(empty);
      cursor = history.length; input.value = '';
    }
    const huntersOff = game.hunters.length > 0 && game.hunters.every(h => !h.body.isEnabled());
    current.textContent = `Now · Infinite boost ${game.cheats && game.infiniteBoost ? 'ON' : 'OFF'} · Impact immunity ${game.cheats && game.impactImmunity ? 'ON' : 'OFF'} · Player gravity ${game.cheats && game.noGravity ? 'OFF' : 'ON'} · Hunters ${game.hunters.length === 0 ? 'NONE' : huntersOff ? 'OFF' : 'ON'}`;
  };
  const close = () => { dialog.close(); game.input.clearHeld(); button.blur(); };
  const open = () => {
    if (!game.cheats || dialog.open) return;
    refresh(); game.input.clearHeld();
    dialog.showModal(); input.focus();
  };
  button.addEventListener('click', open);
  dialog.querySelector('[data-close]')!.addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.querySelector('form')!.addEventListener('submit', e => {
    e.preventDefault(); const source = input.value.trim(); if (!source) return;
    history.push(source); cursor = history.length;
    if (source.toLowerCase() === 'help') {
      dialog.querySelector('details')!.open = true;
    } else {
      output.querySelector('.console-empty')?.remove();
      const row = document.createElement('div'); row.className = 'console-result';
      const command = document.createElement('code'); command.textContent = `› ${source}`;
      const result = document.createElement('span');
      const message = runCheatCommand(game, source);
      result.textContent = message.startsWith('OK:') ? 'Executed' : message;
      if (message.startsWith('OK:')) result.className = 'console-success';
      row.append(command, result); output.append(row);
      while (output.children.length > 30) output.firstElementChild!.remove();
    }
    refresh(); output.scrollTop = output.scrollHeight; input.value = ''; input.focus();
  });
  window.addEventListener('keydown', e => {
    if (dialog.open) {
      e.stopImmediatePropagation();
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault(); cursor = Math.max(0, Math.min(history.length, cursor + (e.code === 'ArrowUp' ? -1 : 1)));
        input.value = history[cursor] ?? '';
      }
    } else if (game.cheats && e.code === 'Slash') {
      e.preventDefault(); e.stopImmediatePropagation(); open();
    }
  }, true);
  return { isOpen: () => dialog.open, sync: () => {
    if (dialog.open || displayedRun !== game.runId) refresh();
    button.hidden = !game.cheats;
    const detonate = document.getElementById('detonate-button');
    button.style.bottom = detonate && !detonate.hidden ? `${84 + detonate.offsetHeight + 10}px` : '84px';
    if (!game.cheats && dialog.open) close();
  } };
}
