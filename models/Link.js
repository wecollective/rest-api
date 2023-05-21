'use strict'
module.exports = (sequelize, DataTypes) => {
    const Link = sequelize.define(
        'Link',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            state: DataTypes.STRING,
            creatorId: DataTypes.INTEGER,
            type: DataTypes.STRING,
            index: DataTypes.INTEGER,
            relationship: DataTypes.STRING,
            description: DataTypes.TEXT,
            itemAId: DataTypes.INTEGER,
            itemBId: DataTypes.INTEGER,
        },
        {}
    )
    Link.associate = function (models) {
        Link.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'Creator',
        })
        Link.belongsTo(models.Post, {
            foreignKey: 'itemAId',
            as: 'IncomingPost',
        })
        Link.belongsTo(models.Post, {
            foreignKey: 'itemBId',
            as: 'OutgoingPost',
        })
        Link.belongsTo(models.Comment, {
            foreignKey: 'itemAId',
            as: 'IncomingComment',
        })
        Link.belongsTo(models.Comment, {
            foreignKey: 'itemBId',
            as: 'OutgoingComment',
        })
    }
    return Link
}
