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
            color: DataTypes.STRING,
            state: DataTypes.STRING,
            creatorId: DataTypes.INTEGER,
            title: DataTypes.TEXT,
            text: DataTypes.TEXT,
            totalLikes: DataTypes.INTEGER,
            totalComments: DataTypes.INTEGER,
            totalLinks: DataTypes.INTEGER,
            totalReposts: DataTypes.INTEGER,
            totalRatings: DataTypes.INTEGER,
            totalGlassBeadGames: DataTypes.INTEGER,
            lastActivity: DataTypes.DATE,
            // todo: remove
            mmId: DataTypes.INTEGER,
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

        Post.belongsToMany(models.Post, {
            through: models.Link,
            as: 'Beads',
            foreignKey: 'itemAId',
            otherKey: 'itemBId',
        })

        Post.belongsToMany(models.User, {
            through: models.UserPost,
            as: 'Players',
            foreignKey: 'postId',
        })

        Post.hasMany(models.Reaction)

        Post.hasMany(models.Link, {
            as: 'OutgoingLinks',
            foreignKey: 'itemAId',
        })

        Post.hasMany(models.Link, {
            as: 'IncomingLinks',
            foreignKey: 'itemBId',
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
