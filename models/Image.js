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
            state: DataTypes.STRING,
        },
        {}
    )
    Image.associate = function (models) {
        // Image.belongsTo(models.Post)
        // Image.hasMany(models.Link)
    }
    return Image
}
