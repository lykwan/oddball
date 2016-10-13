const seedrandom = require('seedrandom');
const Constants = require('./constants.js');
const Craftyjs = require('craftyjs');
const initGame = require('./components/init.js');
const Board = require('./board.js');
const mapGrid = Constants.mapGrid;
const wallDirection = Constants.wallDirection;
const weaponTypes = Constants.weaponTypes;
const gameSettings = Constants.gameSettings;

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
    this.board =
      new Board(mapGrid.NUM_COLS, mapGrid.NUM_ROWS,
                this.seedRandomStr, this.Crafty);
    this.timer = gameSettings.GAME_DURATION;
    this.ballHolder = null;
    this.addWeaponIntervalId = null;
    this.setScoreIntervalId = null;
    this.io = io;

    this.addSocket(socket);
    this.Crafty = Craftyjs();
    initGame(this.Crafty);
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

    socket.emit('joinGame', {
      selfId: playerId,
      seedRandomStr: this.seedRandomStr,
      playerColor: gameSettings.COLORS[playerId - 1]
    });

    // adding existing players in the room
    Object.keys(this.players).forEach((id) => {
       if (this.players[id] !== null) {
         socket.emit('addNewPlayer', {
           playerId: id,
           playerColor: gameSettings.COLORS[id - 1]
         });
       }
    });

    this.players[playerId] = true;

    this.setUpDisconnect(socket, playerId);
    this.setUpAddNewPlayer(socket, playerId,
                            gameSettings.COLORS[playerId - 1]);
    this.setUpStartGame(socket);
    this.setUpUpdateMovement(socket);
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

      // notify other people that this player disconnected
      this.io.to(this.roomId).emit('othersDisconnected', {
        playerId: playerId
      });
    });
  }

  // when a new player enters
  setUpAddNewPlayer(socket, playerId, color) {
    socket.broadcast.to(this.roomId).emit('addNewPlayer', {
      playerId: playerId,
      playerColor: color
    });
  }

  setUpStartGame(socket) {
    const allPlayerPos = this.getPlayerInitPos();
    socket.on('startNewGame', data => {
      // start the game when there are two or more players
      if (Object.keys(this.sockets).length < 2) {
        return;
      }

      // creating the player characters
      this.createPlayerEntities(allPlayerPos);

      // sending this info over to the client
      const playerData = Object.keys(this.players).filter((playerId) => {
        return this.players[playerId] !== null;
      }).map(playerId => {
        const playerPos = allPlayerPos[playerId - 1];
        const playerEntity = this.players[playerId];
        return {
          playerId: playerId,
          playerColor: gameSettings.COLORS[playerId - 1],
          playerPos: playerPos,
          playerPx: [playerEntity.x, playerEntity.y]
        };
      });

      this.io.to(this.roomId).emit('startNewGame', {
        players: playerData,
        timer: this.timer
      });

      this.addBall();
      this.addWeapon();
      this.addTimer();
    });
  }

  createPlayerEntities(allPlayerPos) {
    Object.keys(this.players).filter((playerId) => {
      return this.players[playerId] !== null;
    }).forEach(playerId => {
      const [playerRow, playerCol] = allPlayerPos[playerId - 1];
      let player =
        this.Crafty.e('SelfPlayer')
                   .at(playerRow, playerCol)
                   .setUp(playerId, gameSettings.COLORS[playerId - 1]);
        this.players[playerId] = player;
    });
  }

  getPlayerInitPos() {
    let playerPos = [];
    [0, this.board.numGridRows - 1].forEach(row => {
      [0, this.board.numGridCols - 1].forEach(col => {
        const mazePos = this.board.gridToMazePos(row, col);
        playerPos.push(mazePos);
      });
    });

    return playerPos;
  }

  drawBoard() {
  }

  addBall() {
    const col = Math.floor(this.board.numGridCols / 2);
    const row = Math.floor(this.board.numGridRows / 2);
    const [mazeRow, mazeCol] = this.board.gridToMazePos(row, col);
    this.ball =
      this.Crafty.e('Ball')
                  .at(mazeRow, mazeCol)
                  .setUpStaticPos(mazeRow, mazeCol);
    this.io.to(this.roomId).emit('addBall', {
      col: mazeCol,
      row: mazeRow
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
    this.timer = gameSettings.GAME_DURATION;
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

  setUpUpdateMovement(socket) {
    socket.on('updatePos', data => {
      let movingPlayer = this.players[data.playerId];
      let dirX, dirY;
      if (data.charMove.left) {
        dirX = -1;
        dirY = -1;
      } else if (data.charMove.right) {
        dirX = 1;
        dirY = 1;
      } else if (data.charMove.up) {
        dirX = 1;
        dirY = -1;
      } else if (data.charMove.down) {
        dirX = -1;
        dirY = 1;
      }

      movingPlayer.moveDir(dirX, dirY);
      if (this.collideWithWall(movingPlayer)) {
        let undoDirX = dirX === -1 ? 1 : -1;
        let undoDirY = dirY === -1 ? 1 : -1;
        movingPlayer.moveDir(undoDirX, undoDirY);
      }

      if (this.ball && this.collideWithItem(movingPlayer, this.ball)) {
        this.pickUpBall(movingPlayer);
      }

      this.io.to(this.roomId).emit('updatePos', {
        playerId: data.playerId,
        x: movingPlayer.x,
        y: movingPlayer.y,
        charMove: data.charMove
      });
    });

    socket.on('stopMovement', data => {
      this.io.to(this.roomId).emit('stopMovement', {
        playerId: data.playerId,
        keyCode: data.keyCode
      });
    });
  }

  pickUpBall(player) {
    this.ball.destroy();
    this.ball = null;
    this.ballHolder = player;
    this.setBallTime(player);

    this.io.to(this.roomId).emit('showBall', {
      playerId: player.playerId
    });
  }

  // checking if player's current position is colliding with a wall or
  // if it is out of the grid
  collideWithWall(player) {
    let [rows, cols] = player.getRowsCols();
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < cols.length; j++) {
        if (!this.board.isInGrid(rows[i], cols[j]) ||
            this.board.maze[rows[i]][cols[j]].isWall) {
          return true;
        }
      }
    }

    return false;
  }

  collideWithItem(player, item) {
    let [rows, cols] = player.getRowsCols();
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < cols.length; j++) {
        if (rows[i] === item.staticRow && cols[j] === item.staticCol) {
          return true;
        }
      }
    }

    return false;
  }

  addWeapon() {
    this.addWeaponIntervalId = setInterval(() => {
      // Pick a random col, row
      let [row, col] = this.board.getRandomCell();
      while (this.weapons[[row, col]]) {
        [row, col] = this.board.getRandomCell();
      }

      const randomIdx =
        Math.floor(Math.random() * Object.keys(weaponTypes).length);
      // const type = weaponTypes[Object.keys(weaponTypes)[randomIdx]];
      const type = 'DFS';
      const weapon = this.Crafty.e('Weapon')
                               .at(row, col)
                               .setUpStaticPos(row, col)
                               .setUp(type);
      this.weapons[[row, col]] = weapon;

      this.io.to(this.roomId).emit('addWeapon', {
        row: row,
        col: col,
        type: type
      });

    }, gameSettings.WEAPON_SPAWN_TIME);
  }

  setUpPickUpWeapon(socket) {
    socket.on('pickUpWeapon', data => {
      const player = this.players[data.playerId];
      const collidedWeapon = this.collidedWeapon(player);
      if (collidedWeapon !== null) {
        player.weaponType = collidedWeapon.type;
        socket.emit('pickUpWeapon', {
          type: collidedWeapon.type
        });

        const [row, col] = [collidedWeapon.staticRow, collidedWeapon.staticCol];
        collidedWeapon.destroy();
        delete this.weapons[[row, col]];
        this.io.to(this.roomId).emit('destroyWeapon', {
          row: row,
          col: col
        });
      }
    });
  }

  collidedWeapon(player) {
    let weaponPos = Object.keys(this.weapons);
    for (let i = 0; i < weaponPos.length; i++) {
      const weapon = this.weapons[weaponPos[i]];
      if (this.collideWithItem(player, weapon)) {
        return weapon;
      }
    }

    return null;
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
          const [row, col] = damageCells[idx];
          const damage = this.Crafty.e('Damage')
                        .at(row, col)
                        .setUpCreator(data.playerId)
                        .setUpStaticPos(row, col)
                        .disappearAfter(gameSettings.DAMAGE_DISAPPEAR_TIME);

          this.checkForDamageCollision(damage);

          this.io.to(this.roomId).emit('createDamage', {
            row: row,
            col: col,
            creatorId: data.playerId,
            disappearTime: gameSettings.DAMAGE_DISAPPEAR_TIME
          });

          idx++;

          if (idx === damageCells.length) {
            clearInterval(intervalId);
          }

        }, gameSettings.DAMAGE_ANIMATION_TIME);
      }
    });
  }

  // check if it hits a player once in a while
  checkForDamageCollision(damage) {
    damage.checkCollisionInterval = setInterval(() => {
      Object.keys(this.players).forEach(playerId => {
        let player = this.players[playerId];
        // if player exists and it collides with a damage cell
        if (player && this.collideWithItem(player, damage)) {
          this.lowerHP(player, damage);
        }
      });
    }, gameSettings.CHECK_COLLISION_INTERVAL);
  }

  bufferShootingTime(player) {
    player.weaponCoolingDown = true;
    setTimeout(() => {
      player.weaponCoolingDown = false;
    }, gameSettings.BUFFER_SHOOTING_TIME);
  }

  // find out the cells that bfs weapon reaches to
  shootBFSWeapon(player) {
    let damageCells = [];
    let exploredCells = {};
    let [rows, cols] = player.getRowsCols();
    let [initRow, initCol] = [rows[0], cols[0]];
    let remainingDistance = gameSettings.WEAPON_RANGE;
    let tileQueue = [[initRow, initCol]];
    while (remainingDistance > 0 && tileQueue.length !== 0) {
      let [row, col] = tileQueue.shift();
      damageCells.push([row, col]);
      exploredCells[[row, col]] = true; // so we won't duplicate damage cells
      // push its neighbor tiles to the queue
      let neighborTiles = this.board.getNeighborTiles(row, col);
      neighborTiles.forEach(([tileRow, tileCol]) => {
        if (exploredCells[[tileRow, tileCol]] === undefined) {
          // hasn't been explored yet
          tileQueue.push([tileRow, tileCol]);
        }
      });
      remainingDistance--;
    }

    return damageCells;
  }

  shootDFSWeapon(player) {
    let damageCells = [];
    let exploredCells = {};
    let [rows, cols] = player.getRowsCols();
    let [row, col] = [rows[0], cols[0]];
    let remainingDistance = gameSettings.WEAPON_RANGE;
    let tileStack = [];
    while (remainingDistance > 0) {
      if (exploredCells[[row, col]] === undefined) {
        damageCells.push([row, col]);
        exploredCells[[row, col]] = true;
        remainingDistance--;
      }

      // check its remaining neighbor tiles, see if there's another path we
      // can go to
      let neighborTiles = this.board.getNeighborTiles(row, col);
      let unvisitedNeighbors = neighborTiles.filter(pos => {
        return exploredCells[pos] === undefined;
      });

      if (unvisitedNeighbors.length !== 0) {
        tileStack.push([row, col]);
        let randomIdx = Math.floor(Math.random() * unvisitedNeighbors.length);
        [row, col] = unvisitedNeighbors[randomIdx];
      } else {
        if (tileStack.length === 0) {
          break;
        }

        [row, col] = tileStack.pop(); // no remaining paths, have to backtrack
      }
    }

    return damageCells;
  }

  lowerHP(player, damageEntity) {
    if (!player.hasTakenDamage &&
      parseInt(damageEntity.creatorId) !== parseInt(player.playerId)) {
      player.HP -= gameSettings.HP_DAMAGE;
      if (player.HP <= 0) {
        this.respawnPlayer(player);
      }
      this.bufferDamageTime(player);
      this.io.to(this.roomId).emit('HPChange', {
        playerId: player.playerId,
        playerHP: player.HP
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
    const [randomRow, randomCol] =
      initPlayerPos[Math.floor(Math.random() * initPlayerPos.length)];
    player.at(randomCol, randomRow);

    this.io.to(this.roomId).emit('updatePos', {
      playerId: player.playerId,
      x: player.x,
      y: player.y
    });
  }

  loseBall(player) {
    this.addBall(player.getMazeCol(), player.getMazeRow());
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
    }, gameSettings.BUFFER_DAMAGE_TIME);
  }

}

module.exports = GameState;
