const seedrandom = require('seedrandom');
const Constants = require('./constants.js');
const Craftyjs = require('craftyjs');
const ServerModel = require('./model/server_model.js');
const createCanvas = require('./components/canvas.js');
const Board = require('./board.js');
const mapGrid = Constants.mapGrid;
const wallDirection = Constants.wallDirection;
const weaponTypes = Constants.weaponTypes;

const constants = {
  WEAPON_RANGE: 10,
  BUFFER_DAMAGE_TIME: 1000,
  BUFFER_SHOOTING_TIME: 1500,
  WEAPON_SPAWN_TIME: 5000,
  DAMAGE_ANIMATION_TIME: 100,
  DAMAGE_DISAPPEAR_TIME: 1000,
  HP_DAMAGE: 10,
  GAME_DURATION: 30, // 200
  COLORS: ['blue', 'red', 'yellow', 'green']
};

class GameState {
  constructor(io, socket, roomId) {
    this.sockets = {};
    this.socketToPlayers = {};
    this.roomId = roomId;
    this.players = {
      1: null,
      2: null,
      3: null,
      4: null
    };
    this.weapons = {};
    this.ball = null;
    this.seedRandomStr = "randomStr" +
      Math.floor(Math.random() * 30).toString();
    this.board = null;
    this.timer = constants.GAME_DURATION;
    this.ballHolder = null;
    this.addWeaponIntervalId = null;
    this.setScoreIntervalId = null;
    this.io = io;

    this.addSocket(socket);
    this.Crafty = Craftyjs();
    createCanvas(this.Crafty, ServerModel);
  }

  addSocket(socket) {
    if (Object.keys(this.sockets).length < 4) {
      this.sockets[socket.id] = socket;
      socket.join(this.roomId);  // join that socket to the game room

      socket.on('setUpLoadingScene', () => {
        this.setUpLoadingScene(socket);
      });
      return true;
    } else {
      return false; // room is full
    }
  }

  setUpLoadingScene(socket) {
    // give a playerId to player
    let playerId;
    for (let i = 1; i <= Object.keys(this.players).length; i++) {
      if (this.players[i] === null) {
        playerId = i;
        break;
      }
    }

    // if there are more than 4 players
    if (playerId === undefined) {
      return;
    }

    socket.emit('joinGame', {
      selfId: playerId,
      seedRandomStr: this.seedRandomStr,
      playerColor: constants.COLORS[playerId - 1]
    });

    // adding existing players in the room
    Object.keys(this.players).forEach((id) => {
       if (this.players[id] !== null) {
         socket.emit('addNewPlayer', {
           playerId: id,
           playerColor: constants.COLORS[id - 1]
         });
       }
    });

    this.players[playerId] = true;

    this.setUpDisconnect(socket, playerId);
    this.setUpAddNewPlayer(socket, playerId,
                            constants.COLORS[playerId - 1]);
    this.setUpStartGame(socket);
    this.setUpUpdatePos(socket);
    this.setUpPickUpWeapon(socket);
    this.setUpShootWeapon(socket);
  }

  setUpDisconnect(socket, playerId) {
    socket.on('disconnect', () => {
      console.log('user disconnected');
      delete this.sockets[socket.id];

      // delete player if game has started already
      if (this.players[playerId] !== true) {
        this.players[playerId].destroy();
      }
      this.players[playerId] = null;
      this.io.to(this.roomId).emit('othersDisconnected', {
        playerId: playerId
      });
    });
  }

  setUpAddNewPlayer(socket, playerId, color) {
    socket.broadcast.to(this.roomId).emit('addNewPlayer', {
      playerId: playerId,
      playerColor: color
    });
  }

  setUpStartGame(socket) {
    this.drawBoard();
    const playerPos = this.getPlayerInitPos();
    socket.on('startNewGame', data => {
      // start the game when there are two or more players
      console.log('got here!!!!!!!!!!!!!!');
      if (Object.keys(this.players).length >= 2) {
        const players = Object.keys(this.players).filter((playerId) => {
          return this.players[playerId] !== null;
        }).map(playerId => {
          return {
            playerId: playerId,
            playerColor: constants.COLORS[playerId - 1],
            playerPos: [playerPos[playerId - 1][0], playerPos[playerId - 1][1]]
          };
        });

        // creating the player characters
        Object.keys(this.players).filter((playerId) => {
          return this.players[playerId] !== null;
        }).forEach(playerId => {
          let player =
            this.Crafty.e('Player')
                  .at(playerPos[playerId - 1][0], playerPos[playerId - 1][1])
                  .setUp(playerId, constants.COLORS[playerId - 1]);
          this.players[playerId] = player;
        });

        this.io.to(this.roomId).emit('startNewGame', {
          players: players,
          timer: this.timer
        });

        this.addBall();
        this.addWeapon();
        this.addTimer();
      }
    });
  }

  getPlayerInitPos() {
    let playerPos = [];
    for (let i = 0; i <= 1 ; i++) {
      for (let j = 0; j <= 1; j++) {
        const col = j * (mapGrid.NUM_COLS - 1);
        const row = i * (mapGrid.NUM_ROWS - 1);
        playerPos.push([col, row]);
      }
    }
    return playerPos;
  }

  drawBoard() {
    this.board =
      new Board(mapGrid.NUM_COLS, mapGrid.NUM_ROWS, this.seedRandomStr);
    for (let i = 0; i < mapGrid.NUM_COLS; i++) {
      for (let j = 0; j < mapGrid.NUM_ROWS; j++) {
        this.board.grid[i][j].drawWalls(this.Crafty);
      }
    }
  }

  addBall() {
    const col = Math.floor(mapGrid.NUM_COLS / 2);
    const row = Math.floor(mapGrid.NUM_ROWS / 2);
    this.ball =
      this.Crafty.e('Ball')
            .at(col, row)
            .onHit('Player', this.pickUpBall.bind(this));
    this.io.to(this.roomId).emit('addBall', {
      col: col,
      row: row
    });
  }

   pickUpBall() {
    console.log(this.ball);
    const player = this.ball.hit('Player')[0].obj;
    this.ball.destroy();
    this.ball = null;
    this.ballHolder = player;
    this.setBallTime(player);

    this.io.to(this.roomId).emit('showBall', {
      playerId: player.playerId
    });
  }

   setBallTime(player) {
    this.setScoreIntervalId = setInterval(() => {
      if (!this.ballHolder ||
          player.playerId !== this.ballHolder.playerId) {
        clearInterval(this.setScoreIntervalId);
      }

      player.currentBallHoldingTime++;
      if (player.currentBallHoldingTime > player.longestBallHoldingTime) {
        player.longestBallHoldingTime = player.currentBallHoldingTime;
        this.showScoreboard(player);
      }

      // this.showSelfScore(player);
    }, 1000);
  }

  showScoreboard(player) {
    this.io.to(this.roomId).emit('showScoreboard', {
      playerId: player.playerId,
      score: player.longestBallHoldingTime
    });
  }

  addTimer() {
    this.timer--;
    let intervalId = setInterval(() => {
      this.io.to(this.roomId).emit('countDown', {
        timer: this.timer
      });


      if (this.timer <= 0) {
        clearInterval(intervalId);
        this.gameOver();
      }

      this.timer--;
    }, 1000);
  }

  gameOver() {
    clearInterval(this.addWeaponIntervalId);
    clearInterval(this.setScoreIntervalId);
    let winner = null;
    let winnerScore = 0;
    let playerIds = Object.keys(this.players);
    for (let i = 0; i < playerIds.length; i++) {
      let player = this.players[playerIds[i]];
      if (player) {
        let playerScore = player.longestBallHoldingTime;
        if (playerScore > winnerScore) {
          winner = player;
          winnerScore = playerScore;
        }
      }
    }

    let winnerId;
    if (winner !== null) {
      winnerId = winner.playerId;
    }

    this.io.to(this.roomId).emit('gameOver', {
      winnerId: winnerId,
      winnerScore: winnerScore
    });

    setTimeout(() => {
      this.clearGameState();
    }, 300);
  }

  clearGameState() {
    Object.keys(this.weapons).forEach(weaponPos => {
      this.weapons[weaponPos].destroy();
    });
    this.weapons = {};

    if (this.ball !== null) {
      this.ball.destroy();
      this.ball = null;
    }

    this.seedRandomStr =
      "randomStr" + Math.floor(Math.random() * 30).toString();
    this.board = null;
    this.timer = constants.GAME_DURATION;
    this.ballHolder = null;
    this.addWeaponIntervalId = null;

    this.Crafty('Wall').each(function(i) {
      this.destroy();
    });

    this.Crafty('Damage').each(function(i) {
      this.destroy();
    });

    Object.keys(this.players).map(id => {
      if (this.players[id] !== null && this.players[id] !== true) {
        this.players[id].destroy();
        this.players[id] = true;
      }
    });

  }

  setUpUpdatePos(socket) {
    socket.on('updatePos', data => {
      let movingPlayer = this.players[data.playerId];
      if (data.charMove.left) {
        movingPlayer.x -= movingPlayer.charSpeed;
        if (movingPlayer.hit("Wall")) {
          movingPlayer.x += movingPlayer.charSpeed;
        }
      } else if (data.charMove.right) {
        movingPlayer.x += movingPlayer.charSpeed;
        if (movingPlayer.hit("Wall")) {
          movingPlayer.x -= movingPlayer.charSpeed;
        }
      } else if (data.charMove.up) {
        movingPlayer.y -= movingPlayer.charSpeed;
        if (movingPlayer.hit("Wall")) {
          movingPlayer.y += movingPlayer.charSpeed;
        }
      } else if (data.charMove.down) {
        movingPlayer.y += movingPlayer.charSpeed;
        if (movingPlayer.hit("Wall")) {
          movingPlayer.y -= movingPlayer.charSpeed;
        }
      }

      this.io.to(this.roomId).emit('updatePos', {
        playerId: data.playerId,
        x: movingPlayer.x,
        y: movingPlayer.y
      });
    });
  }

  addWeapon() {
    this.addWeaponIntervalId = setInterval(() => {
      // Pick a random col, row
      let col = Math.floor(Math.random() * mapGrid.NUM_COLS);
      let row = Math.floor(Math.random() * mapGrid.NUM_ROWS);
      while (this.weapons[[col, row]]) {
        col = Math.floor(Math.random() * mapGrid.NUM_COLS);
        row = Math.floor(Math.random() * mapGrid.NUM_ROWS);
      }

      const randomIdx =
        Math.floor(Math.random() * Object.keys(weaponTypes).length);
      const type = weaponTypes[Object.keys(weaponTypes)[randomIdx]];
      const weapon = this.Crafty.e('Weapon')
                           .at(col, row)
                           .setUp(type);
      this.weapons[[col, row]] = weapon;

      this.io.to(this.roomId).emit('addWeapon', {
        x: col,
        y: row,
        type: type,
      });

    }, constants.WEAPON_SPAWN_TIME);
  }

  setUpPickUpWeapon(socket) {
    socket.on('pickUpWeapon', data => {
      const player = this.players[data.playerId];
      const collidedWeapons = player.hit('Weapon');
      if (collidedWeapons) {
        const weapon = collidedWeapons[0].obj;
        player.weaponType = weapon.type;
        socket.emit('pickUpWeapon', {
          type: weapon.type
        });

        const [col, row] = [weapon.getCol(), weapon.getRow()];
        weapon.destroy();
        delete this.weapons[[col, row]];
        this.io.to(this.roomId).emit('destroyWeapon', {
          col: col,
          row: row
        });
      }
    });
  }

  setUpShootWeapon(socket) {
    socket.on('shootWeapon', data => {
      const player = this.players[data.playerId];
      if (!player.weaponCoolingDown) {
        let damageCells = [];
        if (player.weaponType === weaponTypes.BFS) {
          damageCells = this.shootBFSWeapon(player);
        } else if (player.weaponType === weaponTypes.DFS) {
          damageCells = this.shootDFSWeapon(player);
        }

        this.bufferShootingTime(player);

        let idx = 0;
        let intervalId = setInterval(() => {
          const damage = this.Crafty.e('Damage')
                .at(damageCells[idx][0], damageCells[idx][1])
                .setUpCreator(data.playerId)
                .disappearAfter(constants.DAMAGE_DISAPPEAR_TIME);

          damage.onHit('Player', this.lowerHP.bind(this, damage));

          this.io.to(this.roomId).emit('createDamage', {
            damageCell: damageCells[idx],
            creatorId: data.playerId,
            disappearTime: constants.DAMAGE_DISAPPEAR_TIME
          });

          idx++;

          if (idx === damageCells.length) {
            clearInterval(intervalId);
          }

        }, constants.DAMAGE_ANIMATION_TIME);
      }
    });
  }

  bufferShootingTime(player) {
    player.weaponCoolingDown = true;
    setTimeout(() => {
      player.weaponCoolingDown = false;
    }, constants.BUFFER_SHOOTING_TIME);
  }


  shootBFSWeapon(player) {
    let damageCells = [];
    let initCol = player.getCol();
    let initRow = player.getRow();
    let remainingDistance = constants.WEAPON_RANGE;
    let tileQueue = [[initCol, initRow]];
    while (remainingDistance > 0) {
      let [col, row] = tileQueue.shift();
      damageCells.push([col, row]);
      let tile = this.board.grid[col][row];
      if (!tile.walls.left) {
        const damageCell = [col - 1, row];
        if (!this.hasCell(damageCells, damageCell)) {
          tileQueue.push([col - 1, row]);
        }
      }
      if (!tile.walls.top) {
        const damageCell = [col, row - 1];
        if (!this.hasCell(damageCells, damageCell)) {
          tileQueue.push([col, row - 1]);
        }
      }
      if (!tile.walls.right) {
        const damageCell = [col + 1, row];
        if (!this.hasCell(damageCells, damageCell)) {
          tileQueue.push([col + 1, row]);
        }
      }
      if (!tile.walls.bottom) {
        const damageCell = [col, row + 1];
        if (!this.hasCell(damageCells, damageCell)) {
          tileQueue.push([col, row + 1]);
        }
      }
      remainingDistance--;
    }

    return damageCells;
  }

  shootDFSWeapon(player) {
    let damageCells = [];
    let col = player.getCol();
    let row = player.getRow();
    let remainingDistance = constants.WEAPON_RANGE;
    let tileStack = [];
    while (remainingDistance > 0) {
      if (!this.hasCell(damageCells, [col, row])) {
        damageCells.push([col, row]);
      }
      let tile = this.board.grid[col][row];
      let untouchedPaths =
        this.getUntouchedPaths(col, row, damageCells, tile.remainingPaths());
      if (untouchedPaths.length !== 0) {
        remainingDistance--;
        tileStack.push([col, row]);
        let randomIdx = Math.floor(Math.random() * untouchedPaths.length);
        let path = untouchedPaths[randomIdx];
        [col, row] = this.getNewColRow(col, row, path);
      } else {
        [col, row] = tileStack.pop();
      }
    }

    return damageCells;
  }

  getNewColRow(col, row, path) {
    if (path === 'left') {
      return [col - 1, row];
    } else if (path === 'top') {
      return [col, row - 1];
    } else if (path === 'right') {
      return [col + 1, row];
    } else if (path === 'bottom') {
      return [col, row + 1];
    }
  }

  getUntouchedPaths(col, row, damageCells, remainingPaths) {
    let newPos;
    return remainingPaths.filter((path) => {
      newPos = this.getNewColRow(col, row, path);
      return !this.hasCell(damageCells, newPos);
    });
  }

  hasCell(damageCells, damageCell) {
    return damageCells.some(cell => {
      return cell[0] === damageCell[0] && cell[1] === damageCell[1];
    });
  }

  lowerHP(damageEntity) {
    const hitPlayers = damageEntity.hit('Player');
    if (hitPlayers) {
      hitPlayers.forEach(playerObj => {
        const player = playerObj.obj;
        if (!player.hasTakenDamage &&
          parseInt(damageEntity.creatorId) !== parseInt(player.playerId)) {
          player.HP -= constants.HP_DAMAGE;
          if (player.HP <= 0) {
            this.respawnPlayer(player);
          }
          this.bufferDamageTime(player);
          this.io.to(this.roomId).emit('HPChange', {
            playerId: player.playerId,
            playerHP: player.HP
          });
        }
      });
    }
  }

  respawnPlayer(player) {
    player.HP = 100;
    if (this.ballHolder &&
        player.playerId === this.ballHolder.playerId) {
      this.loseBall(player);
    }

    player.weaponType = null;
    this.io.to(this.roomId).emit('loseWeapon', {
      playerId: player.id
    });

    const initPlayerPos = this.getPlayerInitPos();
    const randomPos =
      initPlayerPos[Math.floor(Math.random() * initPlayerPos.length)];
    player.at(randomPos[0], randomPos[1]);

    this.io.to(this.roomId).emit('updatePos', {
      playerId: player.playerId,
      x: player.x,
      y: player.y
    });
  }

  loseBall(player) {
    this.addBall(player.getCol(), player.getRow());
    this.ballHolder = null;

    this.io.to(this.roomId).emit('loseBall', {
      playerId: player.playerId
    });

    player.currentBallHoldingTime = 0;
    // this.showSelfScore(player);
  }

  showSelfScore(player) {
    this.io.to(player.playerId).emit('showSelfScore', {
      currentBallHoldingTime: player.currentBallHoldingTime,
      longestBallHoldingTime: player.longestBallHoldingTime
    });
  }

  bufferDamageTime(player) {
    player.hasTakenDamage = true;
    setTimeout(() => {
      player.hasTakenDamage = false;
    }, constants.BUFFER_DAMAGE_TIME);
  }

}

module.exports = GameState;
