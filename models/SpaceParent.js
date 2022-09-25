'use strict'
module.exports = (sequelize, DataTypes) => {
    const SpaceParent = sequelize.define(
        'SpaceParent',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            state: DataTypes.STRING,
            spaceAId: DataTypes.INTEGER,
            spaceBId: DataTypes.INTEGER,
        },
        {}
    )
    SpaceParent.associate = function (models) {}
    return SpaceParent
}
