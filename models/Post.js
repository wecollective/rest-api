'use strict';
module.exports = (sequelize, DataTypes) => {
    const Post = sequelize.define('Post', {
        id: {
            primaryKey: true,
            type: DataTypes.INTEGER,
            autoIncrement: true,
        },
        type: DataTypes.STRING,
        subType: DataTypes.STRING,
        state: DataTypes.STRING,
        creatorId: DataTypes.INTEGER,
        text: DataTypes.TEXT,
        url: DataTypes.TEXT,
        urlImage: DataTypes.TEXT,
        urlDomain: DataTypes.TEXT,
        urlTitle: DataTypes.TEXT,
        urlDescription: DataTypes.TEXT
    }, {})

    Post.associate = function(models) {
        Post.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'Creator'
        })

        Post.belongsToMany(models.Holon, { 
            through: models.PostHolon,
            as: 'AllIncludedSpaces',
            foreignKey: 'postId'
        })

        Post.belongsToMany(models.Holon, { 
            through: models.PostHolon,
            as: 'DirectSpaces',
            foreignKey: 'postId'
        })

        Post.belongsToMany(models.Holon, { 
            through: models.PostHolon,
            as: 'IndirectSpaces',
            foreignKey: 'postId'
        })

        Post.belongsToMany(models.Holon, { 
            through: models.PostHolon,
            as: 'Reposts',
            foreignKey: 'postId'
        })

        Post.belongsToMany(models.Post, { 
            through: models.Link,
            as: 'StringPosts',
            foreignKey: 'itemAId',
            otherKey: 'itemBId'
        })

        Post.belongsToMany(models.User, { 
            through: models.UserPost,
            as: 'StringPlayers',
            foreignKey: 'postId'
        })

        Post.hasMany(models.Reaction)

        Post.hasMany(models.Link, {
            as: 'OutgoingLinks',
            foreignKey: 'itemAId'
        })
    
        Post.hasMany(models.Link, {
            as: 'IncomingLinks',
            foreignKey: 'itemBId'
        })

        Post.hasMany(models.Comment, {
            foreignKey: 'postId'
        })

        Post.hasMany(models.PostImage, {
            foreignKey: 'postId'
        })

        Post.hasOne(models.GlassBeadGame, {
            foreignKey: 'postId'
        })

        Post.hasOne(models.Event, {
            foreignKey: 'postId'
        })

        Post.hasOne(models.Weave, {
            foreignKey: 'postId'
        })
        
        Post.hasMany(models.PollAnswer)
    }
    return Post
}