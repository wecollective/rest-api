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
            // type: DataTypes.STRING,
            // itemId: DataTypes.INTEGER,
            postId: DataTypes.INTEGER,
            state: DataTypes.STRING,
            url: DataTypes.TEXT,
            image: DataTypes.TEXT,
            title: DataTypes.TEXT,
            description: DataTypes.TEXT,
            domain: DataTypes.TEXT,
        },
        {}
    )
    Url.associate = function (models) {
        // Url.belongsTo(models.Post)
        // Url.hasMany(models.Link)
    }
    return Url
}
