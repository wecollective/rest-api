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
        moveDuration: DataTypes.INTEGER,
        allowedPostTypes: DataTypes.STRING,
        privacy: DataTypes.STRING
    }, {});
    Weave.associate = function(models) {
        Weave.belongsTo(models.Post, {
            foreignKey: 'postId',
        })
    };
    return Weave;
};