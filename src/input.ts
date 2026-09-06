export class Input {
  private down = new Set<string>();
  private just = new Set<string>();
  // Rolling buffer of recently typed letters, for edge://surf-style cheat codes.
  private typed = '';
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;

  clearHeld(): void {
    this.down.clear();
    this.just.clear();
    this.mouseDown = false;
  }

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof Element && e.target.closest('button') && (e.code === 'Enter' || e.code === 'Space')) return;
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }
      if (!e.repeat) this.just.add(e.code);
      this.down.add(e.code);
      // Track single printable characters for typed cheat sequences.
      if (e.key.length === 1) {
        this.typed = (this.typed + e.key.toLowerCase()).slice(-24);
      }
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.clearHeld();
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.target instanceof Element && e.target.closest('button')) return;
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

  /**
   * edge://surf-style cheat entry: returns true once when the player has just
   * finished typing `word` on the keyboard, then clears the buffer so the same
   * word must be retyped to fire again.
   */
  consumeTyped(word: string): boolean {
    if (this.typed.endsWith(word)) {
      this.typed = '';
      return true;
    }
    return false;
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
