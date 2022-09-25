'use strict'
module.exports = (sequelize, DataTypes) => {
    const SpaceNotification = sequelize.define(
        'SpaceNotification',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            ownerId: DataTypes.INTEGER,
            seen: DataTypes.BOOLEAN,
            type: DataTypes.STRING,
            state: DataTypes.STRING,
            spaceAId: DataTypes.INTEGER,
            spaceBId: DataTypes.INTEGER,
            userId: DataTypes.INTEGER,
            postId: DataTypes.INTEGER,
            commentId: DataTypes.INTEGER,
        },
        {}
    )
    SpaceNotification.associate = function (models) {
        SpaceNotification.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'triggerUser',
        })
        SpaceNotification.belongsTo(models.Space, {
            foreignKey: 'spaceAId',
            as: 'triggerSpace',
        })
        SpaceNotification.belongsTo(models.Space, {
            foreignKey: 'ownerId',
            as: 'owner',
        })
    }
    return SpaceNotification
}
