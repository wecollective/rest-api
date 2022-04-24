'use strict';
module.exports = (sequelize, DataTypes) => {
    const PostImage = sequelize.define('PostImage', {
        creatorId: DataTypes.INTEGER,
        postId: DataTypes.INTEGER,
        index: DataTypes.INTEGER,
        url: DataTypes.STRING,
        caption: DataTypes.TEXT
    }, {});
    PostImage.associate = function(models) {
        PostImage.belongsTo(models.Post, {
            foreignKey: 'postId',
        })
        PostImage.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'Creator'
        })
    };
    return PostImage;
};