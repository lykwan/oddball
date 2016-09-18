/* globals Crafty */

module.exports = function(Crafty) {
  Crafty.c('Weapon', {
    init: function() {
      this.requires('Actor, Color, Collision');
    },

    setUp: function(type) {
      this.type = type;
      return this;
    }
  });

  Crafty.c('Damage', {
    init: function() {
      this.requires('Actor, Color, Collision');
    },

    setUpCreator(playerId) {
      this.creatorId = playerId;
      return this;
    },

    disappearAfter() {
      setTimeout(() => this.destroy(), 400);
      return this;
    }
  });
};
