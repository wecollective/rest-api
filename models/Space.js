'use strict'
module.exports = (sequelize, DataTypes) => {
    const Space = sequelize.define(
        'Space',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            state: DataTypes.STRING,
            privacy: DataTypes.STRING,
            creatorId: DataTypes.INTEGER,
            handle: DataTypes.STRING,
            name: DataTypes.STRING,
            description: DataTypes.TEXT,
            flagImagePath: DataTypes.TEXT,
            coverImagePath: DataTypes.TEXT,
            inviteToken: DataTypes.TEXT,
            totalPostLikes: DataTypes.INTEGER,
            totalPosts: DataTypes.INTEGER,
            totalComments: DataTypes.INTEGER,
            totalFollowers: DataTypes.INTEGER,
        },
        {}
    )
    Space.associate = function (models) {
        // todo: Remove 'Space' from aliases so cleaner
        Space.belongsToMany(models.Space, {
            through: models.SpaceParent,
            as: 'DirectParentSpaces',
            foreignKey: 'spaceBId',
        })

        Space.belongsToMany(models.Space, {
            through: models.SpaceParent,
            as: 'DirectChildSpaces',
            foreignKey: 'spaceAId',
        })

        Space.belongsToMany(models.Space, {
            through: models.SpaceAncestor,
            as: 'SpaceAncestors',
            foreignKey: 'spaceBId',
            otherKey: 'spaceAId',
        })

        Space.belongsToMany(models.Space, {
            through: models.SpaceAncestor,
            as: 'SpaceDescendents',
            foreignKey: 'spaceAId',
            otherKey: 'spaceBId',
        })

        // Stream source relationship
        Space.belongsToMany(models.Stream, {
            through: models.StreamSource,
            as: 'StreamSourceSpace',
            foreignKey: 'sourceId',
        })

        // SpacePosts relationship
        Space.belongsToMany(models.Post, {
            through: models.SpacePost,
            as: 'SpacePosts',
            foreignKey: 'spaceId',
        })

        // SpaceUsers relationships
        Space.belongsTo(models.User, {
            as: 'Creator',
            foreignKey: 'creatorId',
        })

        Space.belongsToMany(models.User, {
            through: models.SpaceUser,
            as: 'Followers',
            foreignKey: 'spaceId',
        })

        Space.belongsToMany(models.User, {
            through: models.SpaceUser,
            as: 'Moderators',
            foreignKey: 'spaceId',
        })

        Space.belongsToMany(models.User, {
            through: models.SpaceUser,
            as: 'UsersWithAccess',
            foreignKey: 'spaceId',
        })
    }
    return Space
}
