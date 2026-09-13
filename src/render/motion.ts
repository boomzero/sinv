interface Position { x: number; y: number }
interface Body {
  translation(): Position;
  rotation(): number;
}
interface Pose extends Position { angle: number }

/** Presentation snapshots only; never move physics bodies to render a frame. */
export class RenderMotion {
  private previous = new WeakMap<object, Pose>();
  alpha = 1;

  reset(): void { this.previous = new WeakMap(); }

  capture(key: object, position: Position, angle = 0): void {
    let pose = this.previous.get(key);
    if (!pose) {
      pose = { x: 0, y: 0, angle: 0 };
      this.previous.set(key, pose);
    }
    pose.x = position.x;
    pose.y = position.y;
    pose.angle = angle;
  }

  position(key: object, current: Position): Position {
    const previous = this.previous.get(key);
    // Respawns and teleports must snap, never streak across the map.
    if (!previous || Math.hypot(current.x - previous.x, current.y - previous.y) > 256) return current;
    return {
      x: previous.x + (current.x - previous.x) * this.alpha,
      y: previous.y + (current.y - previous.y) * this.alpha,
    };
  }

  body(body: Body): Pose {
    const position = this.position(body, body.translation());
    const angle = body.rotation();
    const previous = this.previous.get(body);
    const delta = previous ? Math.atan2(Math.sin(angle - previous.angle), Math.cos(angle - previous.angle)) : 0;
    return { ...position, angle: angle - delta * (1 - this.alpha) };
  }
}
