'use strict';
module.exports = (sequelize, DataTypes) => {
  const Event = sequelize.define('Event', {
    postId: DataTypes.INTEGER,
    state: DataTypes.STRING,
    title: DataTypes.TEXT,
    eventStartTime: DataTypes.DATE,
    eventEndTime: DataTypes.DATE,
    // location: DataTypes.STRING,
  }, {});
  Event.associate = function(models) {
    Event.belongsTo(models.Post, {
        foreignKey: 'postId',
    })
    Event.belongsToMany(models.User, { 
        through: models.UserEvent,
        as: 'EventUser',
        foreignKey: 'eventId'
    })
    // Event.belongsToMany(models.User, { 
    //     through: models.UserEvent,
    //     as: 'EventFollower',
    //     foreignKey: 'eventId'
    // })
  };
  return Event;
};