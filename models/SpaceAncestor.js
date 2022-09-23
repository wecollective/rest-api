'use strict'
module.exports = (sequelize, DataTypes) => {
    const SpaceAncestor = sequelize.define(
        'SpaceAncestor',
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
    SpaceAncestor.associate = function (models) {}
    return SpaceAncestor
}
