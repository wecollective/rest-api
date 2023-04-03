'use strict'
module.exports = (sequelize, DataTypes) => {
    const Image = sequelize.define(
        'Image',
        {
            creatorId: DataTypes.INTEGER,
            type: DataTypes.STRING,
            itemId: DataTypes.INTEGER,
            index: DataTypes.INTEGER,
            url: DataTypes.TEXT,
            caption: DataTypes.TEXT,
        },
        {}
    )
    Image.associate = function (models) {
        Image.belongsTo(models.Post, {
            foreignKey: 'itemId',
        })
        // Image.belongsTo(models.User, {
        //     foreignKey: 'creatorId',
        //     as: 'Creator',
        // })
    }
    return Image
}
