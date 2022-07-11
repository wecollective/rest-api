'use strict'
module.exports = (sequelize, DataTypes) => {
    const Prism = sequelize.define(
        'Prism',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            postId: DataTypes.INTEGER,
            numberOfPlayers: DataTypes.INTEGER,
            duration: DataTypes.STRING,
            privacy: DataTypes.STRING,
        },
        {}
    )
    Prism.associate = function (models) {
        Prism.belongsTo(models.Post, {
            foreignKey: 'postId',
            as: 'creator',
        })
        Prism.belongsToMany(models.User, {
            through: models.PrismUser,
            foreignKey: 'prismId',
        })
    }
    return Prism
}
