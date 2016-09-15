var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var Crafty = require('craftyjs')();
var ServerModel = require('./public/src/model/server_model.js');
var Canvas = require('./public/src/components/canvas')(Crafty, ServerModel);
var seedrandom = require('seedrandom');
var Board = require('./public/src/board.js');
const Constants = require('./public/src/constants.js');
const mapGrid = Constants.mapGrid;
const wallDirection = Constants.wallDirection;

app.use(express.static('public'));

app.get('/', function (req, res) {
  res.send('Hello World!');
});

var colors = ['blue', 'red', 'yellow', 'green'];

var gameState = {
  playerId: 0,
  players: {},
  seedRandomStr: "random Str",
  board: null
};

io.on('connection', function(socket) {
  console.log('a user connected');
  socket.emit('connected', { selfId: gameState.playerId,
                             seedRandomStr: gameState.seedRandomStr,
                             playerColor: colors[gameState.playerId],
                             playerIds: Object.keys(gameState.players)
                           });

  if (!gameState.board) {
    gameState.board =
      new Board(mapGrid.NUM_COLS, mapGrid.NUM_ROWS, gameState.seedRandomStr);
    for (let i = 0; i < mapGrid.NUM_COLS; i++) {
      for (let j = 0; j < mapGrid.NUM_ROWS; j++) {
        gameState.board.grid[i][j].drawWalls(Crafty);
      }
    }
  }
  setUpAddNewPlayer(socket);

  let player =
    Crafty.e('Player')
          .at(0, 0)
          .setUp(gameState.playerId);

  gameState.players[gameState.playerId] = player;
  gameState.playerId++;


  setUpDisconnect(socket);
  setUpUpdatePos(socket);
});

function setUpDisconnect(socket) {
  socket.on('disconnect', function() {
    console.log('user disconnected');
  });
}

function setUpUpdatePos(socket) {
  socket.on('updatePos', function(data) {
    let movingPlayer = gameState.players[data.playerId];
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

    io.emit('updatePos', {
      playerId: data.playerId,
      x: movingPlayer.x,
      y: movingPlayer.y
    });
  });
}

function setUpAddNewPlayer(socket) {
  socket.broadcast.emit('addNewPlayer', {
    playerId: gameState.playerId
  });
}

server.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
