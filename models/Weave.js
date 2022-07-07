'use strict';
module.exports = (sequelize, DataTypes) => {
    const Weave = sequelize.define('Weave', {
        id: {
            primaryKey: true,
            type: DataTypes.INTEGER,
            autoIncrement: true,
        },
        numberOfMoves: DataTypes.INTEGER,
        numberOfTurns: DataTypes.INTEGER,
        allowedBeadTypes: DataTypes.STRING,
        moveTimeWindow: DataTypes.INTEGER,
        audioTimeLimit: DataTypes.INTEGER,
        characterLimit: DataTypes.INTEGER,
        fixedPlayerColors: DataTypes.BOOLEAN,
        privacy: DataTypes.STRING
    }, {});
    Weave.associate = function(models) {
        Weave.belongsTo(models.Post, {
            foreignKey: 'postId',
        })
    };
    return Weave;
};