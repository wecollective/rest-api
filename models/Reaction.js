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
            value: DataTypes.STRING, // update to number
            state: DataTypes.STRING,
            spaceId: DataTypes.INTEGER,
            userId: DataTypes.INTEGER,
            postId: DataTypes.INTEGER,
            commentId: DataTypes.INTEGER,
            inquiryAnswerId: DataTypes.INTEGER,
            linkId: DataTypes.INTEGER,
        },
        {}
    )
    Reaction.associate = function (models) {
        Reaction.belongsTo(models.Post, {
            foreignKey: 'postId',
        })
        Reaction.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'Creator',
        })
        Reaction.belongsTo(models.Space, {
            foreignKey: 'spaceId',
            as: 'Space',
        })
        Reaction.belongsTo(models.InquiryAnswer, {
            foreignKey: 'inquiryAnswerId',
        })
    }
    return Reaction
}
