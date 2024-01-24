'use strict'
module.exports = (sequelize, DataTypes) => {
    const Url = sequelize.define(
        'Url',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            creatorId: DataTypes.INTEGER,
            type: DataTypes.STRING,
            itemId: DataTypes.INTEGER,
            state: DataTypes.STRING,
            url: DataTypes.TEXT,
            image: DataTypes.TEXT,
            title: DataTypes.TEXT,
            description: DataTypes.TEXT,
            domain: DataTypes.TEXT,
            favicon: DataTypes.TEXT,
        },
        {}
    )
    Url.associate = function (models) {}
    return Url
}
