'use strict'
module.exports = (sequelize, DataTypes) => {
    const Audio = sequelize.define(
        'Audio',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            type: DataTypes.STRING,
            itemId: DataTypes.INTEGER,
            state: DataTypes.STRING,
            url: DataTypes.TEXT,
        },
        {}
    )
    Audio.associate = function (models) {
        // associations can be defined here
        Audio.belongsTo(models.Post, {
            foreignKey: 'itemId',
        })
    }
    return Audio
}
