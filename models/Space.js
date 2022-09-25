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
        },
        {}
    )
    Space.associate = function (models) {
        // VHR relationship
        Space.belongsToMany(models.Space, {
            through: models.VerticalHolonRelationship,
            as: 'DirectParentHolons',
            foreignKey: 'holonBId',
        })
        Space.belongsToMany(models.Space, {
            through: models.VerticalHolonRelationship,
            as: 'DirectChildHolons',
            foreignKey: 'holonAId',
        })
        Space.belongsToMany(models.Space, {
            through: models.SpaceAncestor,
            as: 'A', // ?
            foreignKey: 'spaceAId',
        })
        Space.belongsToMany(models.Space, {
            through: models.SpaceAncestor,
            as: 'SpaceAncestors',
            foreignKey: 'spaceBId',
        })
        // HolonPosts relationship
        Space.belongsToMany(models.Post, {
            through: models.SpacePost,
            as: 'HolonPosts',
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
