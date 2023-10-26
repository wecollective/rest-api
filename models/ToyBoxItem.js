'use strict'
module.exports = (sequelize, DataTypes) => {
    const ToyBoxItem = sequelize.define(
        'ToyBoxItem',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            userId: DataTypes.INTEGER,
            row: DataTypes.INTEGER,
            index: DataTypes.INTEGER,
            itemType: DataTypes.STRING,
            itemId: DataTypes.INTEGER,
            state: DataTypes.STRING,
        },
        {}
    )
    ToyBoxItem.associate = function (models) {
        // associations can be defined here
    }
    return ToyBoxItem
}
