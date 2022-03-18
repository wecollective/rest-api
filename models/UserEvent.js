'use strict';
module.exports = (sequelize, DataTypes) => {
    const UserEvent = sequelize.define('UserEvent', {
        userId: DataTypes.INTEGER,
        eventId: DataTypes.INTEGER,
        relationship: DataTypes.STRING,
        state: DataTypes.STRING,
    }, {});
    UserEvent.associate = function(models) {
        // associations can be defined here
    };
    return UserEvent;
};