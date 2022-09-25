'use strict'
module.exports = (sequelize, DataTypes) => {
    const SpaceUser = sequelize.define(
        'SpaceUser',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            relationship: DataTypes.STRING,
            state: DataTypes.STRING,
            spaceId: DataTypes.INTEGER,
            userId: DataTypes.INTEGER,
        },
        {}
    )
    SpaceUser.associate = function (models) {
        // associations can be defined here
    }
    return SpaceUser
}
