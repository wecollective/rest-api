'use strict'
module.exports = (sequelize, DataTypes) => {
    const ToyBoxRow = sequelize.define(
        'ToyBoxRow',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            userId: DataTypes.INTEGER,
            index: DataTypes.INTEGER,
            name: DataTypes.TEXT,
            image: DataTypes.TEXT,
        },
        {}
    )
    ToyBoxRow.associate = function (models) {
        // associations can be defined here
    }
    return ToyBoxRow
}
