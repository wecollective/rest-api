'use strict';
module.exports = (sequelize, DataTypes) => {
  const GlassBeadGameComment = sequelize.define('GlassBeadGameComment', {
    id: {
        primaryKey: true,
        type: DataTypes.INTEGER,
        autoIncrement: true,
    },
    gameId: DataTypes.INTEGER,
    userId: DataTypes.INTEGER,
    text: DataTypes.TEXT
  }, {});
  GlassBeadGameComment.associate = function(models) {
    GlassBeadGameComment.belongsTo(models.GlassBeadGame, {
        foreignKey: 'gameId',
    })
    GlassBeadGameComment.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
    })
  };
  return GlassBeadGameComment;
};