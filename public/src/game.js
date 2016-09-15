import createCanvas from './components/canvas.js';
import createComponents from './components/entities.js';
import createPlayerComponent from './components/player.js';
import ClientModel from './model/client_model.js';
import Board from './board.js';
const Constants = require('./constants.js');
const mapGrid = Constants.mapGrid;
const wallDirection = Constants.wallDirection;

const socket = io();
/* globals Crafty */
/* globals io */

class Game {
  constructor() {
    this.players = {};
    this.weapons = {};
  }

  width() {
    return mapGrid.NUM_ROWS * mapGrid.TILE_WIDTH;
  }

  height() {
    return mapGrid.NUM_COLS * mapGrid.TILE_HEIGHT;
  }

  start() {
    createCanvas(Crafty, ClientModel);
    Crafty.background('#000000');

    Crafty.scene('Loading', () => {
      this.setUpLoadingScene.bind(this)();
    });

    Crafty.scene('Game', () => {
      this.setUpConnection();
      this.setUpPlayersMove();
      this.setUpAddNewPlayer();
      this.setUpPlacingWeapons();
      this.setUpCreateDamage();
      this.setUpHPChange();
    });

    // Crafty.scene('Loading');

    Crafty.scene('Game');
  }

  setUpLoadingScene() {
    let loadingScene =
      Crafty.e('2D, DOM, Text')
            .attr({ x: 0, y: 0 })
            .text('A-maze Ball')
            .textColor('white');

    let playerTextY = 50;
    socket.on('connected', data => {
      Crafty.e('2D, DOM, Text')
            .attr({ x: 50, y: playerTextY })
            .text(data.selfId)
            .textColor(data.playerColor);
      playerTextY += 30;
    });

    socket.on('addNewPlayer', data => {
      Crafty.e('2D, DOM, Text')
            .attr({ x: 50, y: playerTextY })
            .text(`connected with ${ data.playerId }`)
            .textColor('white');
      playerTextY += 30;
    });
  }

  setUpConnection() {
    var colors = ['#7ec0ee', 'red', 'yellow', 'green'];
    socket.on('connected', data => {
      // let weaponDisplay = Crafty.e('WeaponDisplay')
      //                           .attr({ x: 600, y: 300 })
      //                           .createText(' ');
      // let weaponDisplayId = weaponDisplay[0];
      let player = Crafty.e('Player')
                         .at(0, 0)
                         .setUp(data.selfId, data.playerColor)
                         .setUpSocket(socket)
                         .bindingKeyEvents();

      $('#scoreboard')
        .append(`<li class='player-${ data.selfId }'>
                    ${ player.HP }
                </li>`);

      data.playerIds.forEach(id => {
        let otherPlayer = Crafty.e('OtherPlayer')
                                .at(0, 0)
                                .setUp(id, colors[id]);
        $('#scoreboard')
          .append(`<li class='player-${ id }'>
                      ${ otherPlayer.HP }
                  </li>`);
        this.players[id] = otherPlayer;
      });

      this.players[data.selfId] = player;
      this.board =
        new Board(mapGrid.NUM_COLS, mapGrid.NUM_ROWS, data.seedRandomStr);

      for (let i = 0; i < mapGrid.NUM_COLS; i++) {
        for (let j = 0; j < mapGrid.NUM_ROWS; j++) {
          this.board.grid[i][j].drawWalls(Crafty);
        }
      }

    });
  }

  setUpAddNewPlayer() {
    var colors = ['blue', 'red', 'yellow', 'green'];
    socket.on('addNewPlayer', data => {
      let otherPlayer = Crafty.e('OtherPlayer')
                              .at(0, 0)
                              .setUp(data.playerId, colors[data.playerId]);
      $('#scoreboard')
        .append(`<li class='player-${ data.playerId }'>
                    ${ otherPlayer.HP }
                </li>`);
      this.players[data.playerId] = otherPlayer;
    });
  }

  setUpPlayersMove() {
    socket.on('updatePos', data => {
      const player = this.players[data.playerId];
      if (player) {
        player.x = data.x;
        player.y = data.y;
      }
    });
  }

  setUpPlacingWeapons() {
    socket.on('addWeapon', data => {
      const weapon = Crafty.e('Weapon')
                           .at(data.x, data.y)
                           .setUp(data.weaponId, data.type)
                           .color(data.color);
      this.weapons[data.weaponId] = weapon;
    });

    socket.on('destroyWeapon', data => {
      const weapon = this.weapons[data.weaponId];
      weapon.destroy();
    });
  }

  setUpCreateDamage() {
    socket.on('createDamage', data => {
      Crafty.e('Damage')
            .at(data.damageCell[0], data.damageCell[1])
            .setUpCreator(data.creatorId)
            .disappearAfter()
            .color('#7ec0ee', 0.5);
    });
  }

  setUpHPChange() {
    socket.on('HPChange', data => {
      const player = this.players[data.playerId];
      if (player) {
        player.HP = data.playerHP;
        $(`.player-${ data.playerId }`).text(player.HP);
      }
    });
  }
}

export default Game;
