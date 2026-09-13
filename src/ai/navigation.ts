import { distanceToStructure, type Point, type Structure } from '../world/generate';
import { HUNTER_RADIUS, PLAYER_RADIUS } from '../constants';

const CELL = 36;
const CLEARANCE = HUNTER_RADIUS + 18;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

class MinHeap {
  private entries: { id: number; score: number }[] = [];
  push(id: number, score: number): void {
    const entry = { id, score };
    let i = this.entries.length;
    this.entries.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.entries[parent].score <= score) break;
      this.entries[i] = this.entries[parent]; i = parent;
    }
    this.entries[i] = entry;
  }
  pop(): number | undefined {
    if (!this.entries.length) return undefined;
    const first = this.entries[0], last = this.entries.pop()!;
    if (this.entries.length) {
      let i = 0;
      while (i * 2 + 1 < this.entries.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.entries.length && this.entries[child + 1].score < this.entries[child].score) child++;
        if (this.entries[child].score >= last.score) break;
        this.entries[i] = this.entries[child]; i = child;
      }
      this.entries[i] = last;
    }
    return first.id;
  }
}

/** Static terrain navigation. Gravity and moving rocks remain steering rules,
 * so finding a route never disables BHAS or promises a black-hole lure. */
export class Navigation {
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly shapes: { shape: Structure; minX: number; maxX: number; minY: number; maxY: number }[];

  constructor(readonly width: number, readonly height: number, structures: Structure[]) {
    this.cols = Math.ceil(width / CELL);
    this.rows = Math.ceil(height / CELL);
    this.shapes = structures.map(shape => {
      const xs = shape.verts.filter((_, i) => i % 2 === 0), ys = shape.verts.filter((_, i) => i % 2 === 1);
      return { shape, minX: shape.x + Math.min(...xs), maxX: shape.x + Math.max(...xs), minY: shape.y + Math.min(...ys), maxY: shape.y + Math.max(...ys) };
    });
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let i = 0; i < this.blocked.length; i++) this.blocked[i] = +!this.clearPoint(this.point(i));
  }

  private point(id: number): Point { return { x: (id % this.cols + 0.5) * CELL, y: (Math.floor(id / this.cols) + 0.5) * CELL }; }

  clearPoint(p: Point, margin = CLEARANCE): boolean {
    if (p.x < margin || p.y < margin || p.x > this.width - margin || p.y > this.height - margin) return false;
    for (const box of this.shapes) {
      if (p.x < box.minX - margin || p.x > box.maxX + margin || p.y < box.minY - margin || p.y > box.maxY + margin) continue;
      if (distanceToStructure(p, box.shape) < margin) return false;
    }
    return true;
  }

  clearLine(a: Point, b: Point, margin = CLEARANCE): boolean {
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    if (minX < margin || minY < margin || maxX > this.width - margin || maxY > this.height - margin) return false;
    const dx = b.x - a.x, dy = b.y - a.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 12));
    const point = { x: 0, y: 0 };
    // Reject distant terrain once per segment, rather than scanning the whole
    // map at every sample along each pickup's magnetic line of sight.
    for (const box of this.shapes) {
      if (maxX < box.minX - margin || minX > box.maxX + margin || maxY < box.minY - margin || minY > box.maxY + margin) continue;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        point.x = a.x + dx * t; point.y = a.y + dy * t;
        if (point.x < box.minX - margin || point.x > box.maxX + margin || point.y < box.minY - margin || point.y > box.maxY + margin) continue;
        if (distanceToStructure(point, box.shape) < margin) return false;
      }
    }
    return true;
  }

  private nearestNode(p: Point, margin = HUNTER_RADIUS - 0.5): number | null {
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
    let best: number | null = null, distance = Infinity;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, id = y * this.cols + x;
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows || this.blocked[id]) continue;
      const q = this.point(id), d = Math.hypot(p.x - q.x, p.y - q.y);
      // Permit joining a route from physical contact with a wall, but never
      // snap to a free cell on the opposite side of that wall.
      if (d < distance && this.clearLine(p, q, margin)) { best = id; distance = d; }
    }
    return best;
  }

  findPath(start: Point, target: Point): Point[] {
    if (this.clearLine(start, target)) return [{ ...target }];
    // The smaller player can touch a wall closer than the hunter's radius.
    // Connect that endpoint with player clearance; the hunter catches it
    // before its center reaches the endpoint. Interior routing stays padded.
    const from = this.nearestNode(start), to = this.nearestNode(target, PLAYER_RADIUS - 0.5);
    if (from === null || to === null) return [];
    const costs = new Float64Array(this.blocked.length).fill(Infinity);
    const parents = new Int32Array(this.blocked.length).fill(-1);
    const visited = new Uint8Array(this.blocked.length);
    const queue = new MinHeap();
    const heuristic = (id: number) => Math.hypot(id % this.cols - to % this.cols, Math.floor(id / this.cols) - Math.floor(to / this.cols));
    costs[from] = 0; queue.push(from, heuristic(from));
    let current: number | undefined;
    while ((current = queue.pop()) !== undefined) {
      if (visited[current]) continue;
      visited[current] = 1;
      if (current === to) {
        const route: Point[] = [];
        for (let id = to; id !== -1; id = parents[id]) route.push(this.point(id));
        route.reverse();
        // nearestNode checked the final connection with player clearance,
        // including targets immediately beside a wall.
        route.push({ ...target });
        const smooth: Point[] = [];
        let origin = start, index = 0;
        while (index < route.length) {
          let furthest = index;
          for (let j = index + 1; j < route.length; j++) {
            if (!this.clearLine(origin, route[j])) break;
            furthest = j;
          }
          smooth.push(route[furthest]); origin = route[furthest]; index = furthest + 1;
        }
        return smooth;
      }
      const x = current % this.cols, y = Math.floor(current / this.cols);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy, next = ny * this.cols + nx;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows || this.blocked[next] || visited[next]) continue;
        // Diagonals cannot cut across the corner of a blocked cell.
        if (dx && dy && (this.blocked[y * this.cols + nx] || this.blocked[ny * this.cols + x])) continue;
        const candidate = costs[current] + (dx && dy ? Math.SQRT2 : 1);
        if (candidate >= costs[next]) continue;
        costs[next] = candidate; parents[next] = current; queue.push(next, candidate + heuristic(next));
      }
    }
    return [];
  }
}
