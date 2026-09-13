type Material = 'metal' | 'rock' | 'ice';

let version = 0;
const sources = {
  metal: new Image(),
  rock: new Image(),
  ice: new Image(),
};
for (const source of Object.values(sources)) source.onload = () => { version++; };
sources.metal.src = new URL('../../public/assets/station-hull-v5.png', import.meta.url).href;
sources.rock.src = new URL('../../public/assets/asteroid-rock.png', import.meta.url).href;
sources.ice.src = new URL('../../public/assets/asteroid-ice-v7.png', import.meta.url).href;

const tiles = new Map<Material, { version: number; canvas: HTMLCanvasElement }>();
export const materialVersion = (): number => version;

/** Fixed world density: panels and fractures never grow with the landmark. */
export function paintMaterial(ctx: CanvasRenderingContext2D, material: Material, extent: number): void {
  const source = sources[material];
  ctx.fillStyle = material === 'metal' ? '#374754' : material === 'ice' ? '#526572' : '#48443e';
  if (source.complete && source.naturalWidth) {
    let tile = tiles.get(material);
    if (!tile || tile.version !== version) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = Math.round(canvas.width * source.naturalHeight / source.naturalWidth);
      canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
      tile = { version, canvas };
      tiles.set(material, tile);
    }
    ctx.fillStyle = ctx.createPattern(tile.canvas, 'repeat') ?? ctx.fillStyle;
  }
  ctx.fillRect(-extent, -extent, extent * 2, extent * 2);
}
