'use strict'
module.exports = (sequelize, DataTypes) => {
    const Holon = sequelize.define(
        'Holon',
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
    Holon.associate = function (models) {
        // VHR relationship
        Holon.belongsToMany(models.Holon, {
            through: models.VerticalHolonRelationship,
            as: 'DirectParentHolons',
            foreignKey: 'holonBId',
        })
        Holon.belongsToMany(models.Holon, {
            through: models.VerticalHolonRelationship,
            as: 'DirectChildHolons',
            foreignKey: 'holonAId',
        })
        Holon.belongsToMany(models.Holon, {
            through: models.SpaceAncestor,
            as: 'A', // ?
            foreignKey: 'spaceAId',
        })
        Holon.belongsToMany(models.Holon, {
            through: models.SpaceAncestor,
            as: 'SpaceAncestors',
            foreignKey: 'spaceBId',
        })
        // HolonPosts relationship
        Holon.belongsToMany(models.Post, {
            through: models.SpacePost,
            as: 'HolonPosts',
            foreignKey: 'spaceId',
        })
        // SpaceUsers relationships
        Holon.belongsTo(models.User, {
            as: 'Creator',
            foreignKey: 'creatorId',
        })
        Holon.belongsToMany(models.User, {
            through: models.SpaceUser,
            as: 'Followers',
            foreignKey: 'spaceId',
        })
        Holon.belongsToMany(models.User, {
            through: models.SpaceUser,
            as: 'Moderators',
            foreignKey: 'spaceId',
        })
        Holon.belongsToMany(models.User, {
            through: models.SpaceUser,
            as: 'UsersWithAccess',
            foreignKey: 'spaceId',
        })
    }
    return Holon
}
