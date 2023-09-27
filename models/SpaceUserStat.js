'use strict'
module.exports = (sequelize, DataTypes) => {
    const SpaceUserStat = sequelize.define(
        'SpaceUserStat',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            spaceId: DataTypes.INTEGER,
            userId: DataTypes.INTEGER,
            totalPostLikes: DataTypes.INTEGER,
        },
        {}
    )
    SpaceUserStat.associate = function (models) {
        SpaceUserStat.belongsTo(models.User, {
            foreignKey: 'userId',
        })
    }
    return SpaceUserStat
}
