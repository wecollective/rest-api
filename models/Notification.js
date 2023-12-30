'use strict'
module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define(
        'Notification',
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
    Notification.associate = function (models) {
        Notification.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'triggerUser',
        })
        Notification.belongsTo(models.Space, {
            foreignKey: 'spaceAId',
            as: 'triggerSpace',
        })
        Notification.belongsTo(models.Space, {
            foreignKey: 'spaceBId',
            as: 'secondarySpace',
        })
        Notification.belongsTo(models.Post, {
            foreignKey: 'postId',
            as: 'relatedPost',
        })
        Notification.belongsTo(models.Post, {
            foreignKey: 'commentId',
            as: 'relatedComment',
        })
    }
    return Notification
}
