'use strict';

// Which item is on screen and how long it has left. Time is passed in so the
// logic stays testable.
class Rotation {
  constructor(items, now) {
    this.items = items;
    this.index = 0;
    this.paused = false;
    this.startedAt = now;
    this.pausedElapsed = 0;
  }

  durationMs() {
    return this.items[this.index].seconds * 1000;
  }

  remainingMs(now) {
    const elapsed = this.paused ? this.pausedElapsed : now - this.startedAt;
    return Math.max(0, this.durationMs() - elapsed);
  }

  // Advances when the current item's time is up; true when it did.
  tick(now) {
    if (this.paused || this.remainingMs(now) > 0) return false;
    this.go(1, now);
    return true;
  }

  go(step, now) {
    const n = this.items.length;
    this.index = (((this.index + step) % n) + n) % n;
    this.startedAt = now;
    this.pausedElapsed = 0;
  }

  togglePause(now) {
    if (this.paused) {
      this.startedAt = now - this.pausedElapsed;
      this.paused = false;
    } else {
      this.pausedElapsed = now - this.startedAt;
      this.paused = true;
    }
  }
}

module.exports = { Rotation };
