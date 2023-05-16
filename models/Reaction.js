'use strict'
module.exports = (sequelize, DataTypes) => {
    const Reaction = sequelize.define(
        'Reaction',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            type: DataTypes.STRING,
            value: DataTypes.INTEGER,
            state: DataTypes.STRING,
            spaceId: DataTypes.INTEGER,
            creatorId: DataTypes.INTEGER,
            // postId: DataTypes.INTEGER,
            // commentId: DataTypes.INTEGER,
            // pollAnswerId: DataTypes.INTEGER,
            // linkId: DataTypes.INTEGER,
            itemType: DataTypes.STRING,
            itemId: DataTypes.INTEGER,
        },
        {}
    )
    Reaction.associate = function (models) {
        Reaction.belongsTo(models.Post, {
            foreignKey: 'itemId',
        })
        Reaction.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'Creator',
        })
        Reaction.belongsTo(models.Space, {
            foreignKey: 'spaceId',
            as: 'Space',
        })
        Reaction.belongsTo(models.PollAnswer, {
            foreignKey: 'itemId',
        })
    }
    return Reaction
}
