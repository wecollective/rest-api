'use strict';
module.exports = (sequelize, DataTypes) => {
    const MultiplayerString = sequelize.define('MultiplayerString', {
        id: {
            primaryKey: true,
            type: DataTypes.INTEGER,
            autoIncrement: true,
        },
        numberOfTurns: DataTypes.INTEGER,
        moveDuration: DataTypes.INTEGER,
        allowedPostTypes: DataTypes.STRING,
        privacy: DataTypes.STRING
    }, {});
    MultiplayerString.associate = function(models) {
        MultiplayerString.belongsTo(models.Post, {
            foreignKey: 'postId',
        })
    };
    return MultiplayerString;
};