'use strict'
module.exports = (sequelize, DataTypes) => {
    const Image = sequelize.define(
        'Image',
        {
            creatorId: DataTypes.INTEGER,
            // type: DataTypes.STRING,
            // itemId: DataTypes.INTEGER,
            postId: DataTypes.INTEGER,
            index: DataTypes.INTEGER,
            url: DataTypes.TEXT,
            caption: DataTypes.TEXT,
        },
        {}
    )
    Image.associate = function (models) {
        Image.belongsTo(models.Post)
        // Image.belongsTo(models.User, {
        //     foreignKey: 'creatorId',
        //     as: 'Creator',
        // })
    }
    return Image
}
