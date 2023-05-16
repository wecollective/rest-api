'use strict'
module.exports = (sequelize, DataTypes) => {
    const Comment = sequelize.define(
        'Comment',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            state: DataTypes.STRING,
            itemType: DataTypes.STRING,
            itemId: DataTypes.INTEGER,
            creatorId: DataTypes.INTEGER,
            spaceId: DataTypes.INTEGER,
            parentCommentId: DataTypes.INTEGER,
            text: DataTypes.TEXT,
            totalLikes: DataTypes.INTEGER,
            totalLinks: DataTypes.INTEGER,
            totalReposts: DataTypes.INTEGER,
            totalRatings: DataTypes.INTEGER,
            totalGlassBeadGames: DataTypes.INTEGER,
            mmId: DataTypes.INTEGER,
            mmCommentNumber: DataTypes.INTEGER,
        },
        {}
    )
    Comment.associate = function (models) {
        Comment.belongsTo(models.Post, {
            //as: 'postComment',
            foreignKey: 'itemId',
            //sourceKey: 'postId'
        })
        Comment.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'Creator',
        })
        Comment.hasMany(models.Comment, {
            foreignKey: 'parentCommentId',
            as: 'Replies',
        })
    }
    return Comment
}
