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
            through: models.HolonHandle,
            as: 'A', // ?
            foreignKey: 'holonBId',
        })
        Holon.belongsToMany(models.Holon, {
            through: models.HolonHandle,
            as: 'HolonHandles',
            foreignKey: 'holonAId',
        })
        // HolonPosts relationship
        Holon.belongsToMany(models.Post, {
            through: models.PostHolon,
            as: 'HolonPosts',
            foreignKey: 'holonId',
        })
        // HolonUsers relationships
        Holon.belongsTo(models.User, {
            as: 'Creator',
            foreignKey: 'creatorId',
        })
        Holon.belongsToMany(models.User, {
            through: models.HolonUser,
            as: 'Followers',
            foreignKey: 'holonId',
        })
        Holon.belongsToMany(models.User, {
            through: models.HolonUser,
            as: 'Moderators',
            foreignKey: 'holonId',
        })
        Holon.belongsToMany(models.User, {
            through: models.HolonUser,
            as: 'UsersWithAccess',
            foreignKey: 'holonId',
        })
    }
    return Holon
}
