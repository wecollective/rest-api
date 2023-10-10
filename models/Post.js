'use strict'
module.exports = (sequelize, DataTypes) => {
    const Post = sequelize.define(
        'Post',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            type: DataTypes.STRING,
            state: DataTypes.STRING,
            creatorId: DataTypes.INTEGER,
            title: DataTypes.TEXT,
            text: DataTypes.TEXT,
            searchableText: DataTypes.TEXT,
            color: DataTypes.STRING,
            watermark: DataTypes.BOOLEAN,
            totalLikes: DataTypes.INTEGER,
            totalComments: DataTypes.INTEGER,
            totalLinks: DataTypes.INTEGER,
            totalReposts: DataTypes.INTEGER,
            totalRatings: DataTypes.INTEGER,
            totalGlassBeadGames: DataTypes.INTEGER,
            lastActivity: DataTypes.DATE,
        },
        {}
    )

    Post.associate = function (models) {
        Post.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'Creator',
        })

        Post.belongsToMany(models.Space, {
            through: models.SpacePost,
            as: 'AllPostSpaces',
            foreignKey: 'postId',
        })

        Post.belongsToMany(models.Space, {
            through: models.SpacePost,
            as: 'DirectSpaces',
            foreignKey: 'postId',
        })

        Post.belongsToMany(models.Space, {
            through: models.SpacePost,
            as: 'IndirectSpaces',
            foreignKey: 'postId',
        })

        Post.belongsToMany(models.Space, {
            through: models.SpacePost,
            as: 'Reposts',
            foreignKey: 'postId',
        })

        Post.belongsToMany(models.User, {
            through: models.UserPost,
            as: 'Players',
            foreignKey: 'postId',
        })

        Post.belongsToMany(models.Post, {
            through: models.Link,
            as: 'Beads',
            foreignKey: 'itemAId',
            otherKey: 'itemBId',
        })

        Post.belongsToMany(models.Post, {
            through: models.Link,
            as: 'CardSides',
            foreignKey: 'itemAId',
            otherKey: 'itemBId',
        })

        Post.hasMany(models.Link, {
            as: 'OutgoingPostLinks',
            foreignKey: 'itemAId',
        })

        Post.hasMany(models.Link, {
            as: 'OutgoingCommentLinks',
            foreignKey: 'itemAId',
        })

        Post.hasMany(models.Link, {
            as: 'IncomingPostLinks',
            foreignKey: 'itemBId',
        })

        Post.hasMany(models.Link, {
            as: 'IncomingCommentLinks',
            foreignKey: 'itemBId',
        })

        Post.hasMany(models.Reaction, {
            foreignKey: 'itemId',
        })

        Post.hasMany(models.Comment, {
            foreignKey: 'itemId',
        })

        Post.hasMany(models.Url, {
            foreignKey: 'itemId',
        })

        Post.hasMany(models.Image, {
            foreignKey: 'itemId',
        })

        Post.hasMany(models.Audio, {
            foreignKey: 'itemId',
        })

        Post.hasOne(models.Event, {
            foreignKey: 'postId',
        })

        Post.hasOne(models.Poll, {
            foreignKey: 'postId',
        })

        Post.hasOne(models.GlassBeadGame, {
            foreignKey: 'postId',
        })
    }
    return Post
}
