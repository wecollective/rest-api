'use strict'
module.exports = (sequelize, DataTypes) => {
    const GlassBeadGame2 = sequelize.define(
        'GlassBeadGame2',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            postId: DataTypes.INTEGER,
            state: DataTypes.STRING,
            locked: DataTypes.BOOLEAN,
            topic: DataTypes.STRING,
            topicGroup: DataTypes.STRING,
            topicImage: DataTypes.STRING,
            synchronous: DataTypes.BOOLEAN,
            multiplayer: DataTypes.BOOLEAN,
            nextMoveDeadline: DataTypes.DATE,
            allowedBeadTypes: DataTypes.STRING,
            playerOrder: DataTypes.TEXT,
            totalMoves: DataTypes.INTEGER,
            movesPerPlayer: DataTypes.INTEGER,
            moveDuration: DataTypes.INTEGER,
            moveTimeWindow: DataTypes.INTEGER,
            characterLimit: DataTypes.INTEGER,
            introDuration: DataTypes.INTEGER,
            outroDuration: DataTypes.INTEGER,
            intervalDuration: DataTypes.INTEGER,
            backgroundImage: DataTypes.STRING,
            backgroundVideo: DataTypes.STRING,
            backgroundVideoStartTime: DataTypes.STRING,
            oldGameId: DataTypes.INTEGER,
        },
        {}
    )
    GlassBeadGame2.associate = function (models) {
        // associations can be defined here
    }
    return GlassBeadGame2
}