import type { Game } from './game';
import { BOOST_MAX, HULL_MAX } from './constants';
import { GEM_THRUST_GAIN } from './world/exit';

export function runCheatCommand(game: Game, source: string): string {
  if (!game.cheats) return 'Enable cheat mode by typing kelly during a run.';
  const [command, ...args] = source.trim().toLowerCase().split(/\s+/);
  const count = (max: number): number => {
    if (args.length !== 1 || !/^\d+$/.test(args[0]) || Number(args[0]) > max)
      throw new Error(`Usage: ${command} <0–${max}>`);
    return Number(args[0]);
  };
  try {
    switch (command) {
      case 'help': return 'gems <0–999> · antimatter <0–99> · shield · heal · fuel · magnet <seconds> · tp exit · tp <x> <y> · hunters on|off · time <seconds> · infinite-boost on|off · impact-immunity on|off · status';
      case 'status': return `Seed ${game.seed} · ${game.difficulty.name} · power ${game.thrustGems}/${game.escapeGemTarget} · capsules ${game.antimatter} · time ${game.playT.toFixed(1)}s · infinite boost ${game.infiniteBoost ? 'on' : 'off'} · impact immunity ${game.impactImmunity ? 'on' : 'off'}`;
      case 'infinite-boost':
      case 'impact-immunity':
        if (args.length !== 1 || !['on', 'off'].includes(args[0])) throw new Error(`Usage: ${command} on|off`);
        if (command === 'infinite-boost') game.infiniteBoost = args[0] === 'on';
        else game.impactImmunity = args[0] === 'on';
        break;
      case 'gems': {
        const n = count(999); game.player.engineMultiplier = 1 + n * GEM_THRUST_GAIN;
        break;
      }
      case 'antimatter': game.antimatter = count(99); break;
      case 'magnet': game.magnetUntil = game.playT + count(3600); break;
      case 'time': game.playT = count(3600); break;
      case 'shield':
      case 'heal':
      case 'fuel':
        if (args.length) throw new Error(`Usage: ${command}`);
        if (command === 'shield') game.player.shield = true;
        if (command === 'heal') game.player.hull = HULL_MAX;
        if (command === 'fuel') game.player.boostFuel = BOOST_MAX;
        break;
      case 'hunters':
        if (args.length !== 1 || !['on', 'off'].includes(args[0])) throw new Error('Usage: hunters on|off');
        for (const hunter of game.hunters) hunter.body.setEnabled(args[0] === 'on');
        break;
      case 'tp': {
        const p = args.length === 1 && args[0] === 'exit'
          ? game.gate.layout.mouth : { x: Number(args[0]), y: Number(args[1]) };
        if (!(args.length === 2 || args.length === 1 && args[0] === 'exit') ||
          !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > game.mapW || p.y > game.mapH)
          throw new Error('Usage: tp exit OR tp <x> <y> within the map');
        game.player.body.setTranslation(p, true); game.player.body.setLinvel({ x: 0, y: 0 }, true);
        game.player.body.setRotation(0, true); game.player.body.setAngvel(0, true);
        break;
      }
      default: return 'Unknown command. Type help.';
    }
    game.cheatsUsed = true;
    return `OK: ${source}`;
  } catch (error) { return (error as Error).message; }
}
