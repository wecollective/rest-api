'use strict'
module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define(
        'User',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            handle: DataTypes.STRING,
            name: DataTypes.STRING,
            email: DataTypes.STRING,
            password: DataTypes.STRING,
            bio: DataTypes.TEXT,
            flagImagePath: DataTypes.TEXT,
            coverImagePath: DataTypes.TEXT,
            facebookId: DataTypes.STRING,
            emailVerified: DataTypes.BOOLEAN,
            emailsDisabled: DataTypes.BOOLEAN,
            emailToken: DataTypes.TEXT,
            accountVerified: DataTypes.BOOLEAN,
            passwordResetToken: DataTypes.TEXT,
            state: DataTypes.STRING,
            mmId: DataTypes.INTEGER,
        },
        {}
    )
    User.associate = function (models) {
        User.hasMany(models.Post, {
            foreignKey: 'creatorId',
            // as: 'createdPosts'
        })

        User.hasMany(models.Comment, {
            foreignKey: 'creatorId',
            //as: 'createdComments'
        })

        User.hasMany(models.Reaction, {
            foreignKey: 'creatorId',
        })

        User.hasMany(models.Link, {
            foreignKey: 'creatorId',
            //as: 'createdComments'
        })

        // User.hasMany(models.GlassBead, {
        //     foreignKey: 'userId',
        //     // as: 'user'
        // })

        // User.hasMany(models.GlassBeadGameComment, {
        //     foreignKey: 'userId',
        // })

        User.belongsToMany(models.Space, {
            through: models.SpaceUser,
            as: 'UserSpaces',
            foreignKey: 'userId',
        })

        User.belongsToMany(models.Space, {
            through: models.SpaceUser,
            as: 'FollowedSpaces',
            foreignKey: 'userId',
        })

        User.belongsToMany(models.Space, {
            through: models.SpaceUser,
            as: 'ModeratedSpaces',
            foreignKey: 'userId',
        })

        User.belongsToMany(models.Post, {
            through: models.UserPost,
            as: 'UserPosts',
            foreignKey: 'userId',
        })

        User.belongsToMany(models.User, {
            through: models.UserUser,
            as: 'FollowedUsers',
            foreignKey: 'userAId',
            otherKey: 'userBId',
        })

        User.belongsToMany(models.User, {
            through: models.UserUser,
            as: 'MutedUsers',
            foreignKey: 'userAId',
            otherKey: 'userBId',
        })

        // User.belongsToMany(models.Prism, {
        //     through: models.PrismUser,
        //     //as: 'ModeratedSpaces',
        //     foreignKey: 'userId',
        // })

        User.belongsToMany(models.Event, {
            through: models.UserEvent,
            // as: 'UserEvent',
            foreignKey: 'userId',
        })

        // Stream relationship
        User.hasMany(models.Stream, {
            as: 'Streams',
            foreignKey: 'ownerId',
        })
        User.belongsToMany(models.Stream, {
            through: models.StreamSource,
            as: 'StreamSourceUser',
            foreignKey: 'sourceId',
        })
    }
    return User
}
