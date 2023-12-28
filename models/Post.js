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
            creatorId: DataTypes.INTEGER,
            type: DataTypes.STRING, // post, bead, card-face, image, url, audio, (comment, poll-answer)
            mediaTypes: DataTypes.STRING,
            title: DataTypes.TEXT,
            text: DataTypes.TEXT,
            searchableText: DataTypes.TEXT,
            color: DataTypes.STRING,
            watermark: DataTypes.BOOLEAN,
            originSpaceId: DataTypes.INTEGER,
            state: DataTypes.STRING,
            totalLikes: DataTypes.INTEGER,
            totalChildComments: DataTypes.INTEGER,
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
            as: 'PrivateSpaces',
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

        // blocks (use for all post children: media, comments, beads etc?)
        Post.belongsToMany(models.Post, {
            through: models.Link,
            as: 'Blocks',
            foreignKey: 'itemAId',
            otherKey: 'itemBId',
        })
        //

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

        // updated from itemId to postId (20-11-2023)
        // updated from hasMany to hasOne (23-11-2023)
        Post.hasOne(models.Url, {
            foreignKey: 'postId',
        })

        Post.hasOne(models.Image, {
            foreignKey: 'postId',
        })

        Post.hasOne(models.Audio, {
            foreignKey: 'postId',
        })
        //

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
