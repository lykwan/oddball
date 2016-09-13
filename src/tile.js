import { mapGrid, wallDirection } from './constants.js';
/* globals Crafty */

class Tile {
  constructor(x, y) {
    this.walls = {
      left: true,
      right: true,
      top: true,
      bottom: true,
    };
    this.isInMaze = false;
    this.hasBeenFrontier = false;
    this.x = x;
    this.y = y;
  }

  drawWalls() {
    if (this.walls.left) {
      Crafty.e('Wall').wallDir(wallDirection.VERTICAL)
                      .atWall(this.x, this.y, [0, 0]);
    }
    if (this.walls.right) {
      Crafty.e('Wall').wallDir(wallDirection.VERTICAL)
                      .atWall(this.x, this.y, [1, 0]);
    }
    if (this.walls.top) {
      Crafty.e('Wall').wallDir(wallDirection.HORIZONTAL)
                      .atWall(this.x, this.y, [0, 0]);
    }
    if (this.walls.bottom) {
      Crafty.e('Wall').wallDir(wallDirection.HORIZONTAL)
                      .atWall(this.x, this.y, [0, 1]);
    }
  }
}

export default Tile;
