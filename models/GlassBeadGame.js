'use strict'
module.exports = (sequelize, DataTypes) => {
    const GlassBeadGame = sequelize.define(
        'GlassBeadGame',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            postId: DataTypes.INTEGER,
            state: DataTypes.STRING,
            locked: DataTypes.BOOLEAN,
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
            totalBeads: DataTypes.INTEGER,
            // oldGameId: DataTypes.INTEGER,
        },
        {}
    )
    GlassBeadGame.associate = function (models) {
        // associations can be defined here
    }
    return GlassBeadGame
}
