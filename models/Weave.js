'use strict'
module.exports = (sequelize, DataTypes) => {
    const Weave = sequelize.define(
        'Weave',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            state: DataTypes.STRING,
            postId: DataTypes.INTEGER,
            numberOfMoves: DataTypes.INTEGER,
            numberOfTurns: DataTypes.INTEGER,
            allowedBeadTypes: DataTypes.STRING,
            moveTimeWindow: DataTypes.INTEGER,
            audioTimeLimit: DataTypes.INTEGER,
            characterLimit: DataTypes.INTEGER,
            privacy: DataTypes.STRING,
        },
        {}
    )
    Weave.associate = function (models) {
        Weave.belongsTo(models.Post, {
            foreignKey: 'postId',
        })
    }
    return Weave
}
