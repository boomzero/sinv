export class Input {
  private down = new Set<string>();
  private just = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }
      if (!e.repeat) this.just.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  get thrust(): boolean {
    return this.down.has('KeyW') || this.down.has('ArrowUp');
  }
  get reverse(): boolean {
    return this.down.has('KeyS') || this.down.has('ArrowDown');
  }
  get turn(): number {
    let t = 0;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) t -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) t += 1;
    return t;
  }
  get boost(): boolean {
    return this.down.has('Space') || this.down.has('ShiftLeft');
  }

  /** Edge-triggered: returns true once per physical key press. */
  justPressed(code: string): boolean {
    if (this.just.has(code)) {
      this.just.delete(code);
      return true;
    }
    return false;
  }

  endFrame(): void {
    this.just.clear();
  }
}
