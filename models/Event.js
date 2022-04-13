'use strict';
module.exports = (sequelize, DataTypes) => {
  const Event = sequelize.define('Event', {
    postId: DataTypes.INTEGER,
    state: DataTypes.STRING,
    title: DataTypes.TEXT,
    startTime: DataTypes.DATE,
    endTime: DataTypes.DATE,
    // location: DataTypes.STRING,
  }, {});
  Event.associate = function(models) {
    Event.belongsTo(models.Post, {
        foreignKey: 'postId',
    })
    Event.belongsToMany(models.User, { 
        through: models.UserEvent,
        as: 'Interested',
        foreignKey: 'eventId'
    })
    Event.belongsToMany(models.User, { 
        through: models.UserEvent,
        as: 'Going',
        foreignKey: 'eventId',
    })
  };
  return Event;
};