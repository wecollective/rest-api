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
            type: DataTypes.STRING, // todo: remove
            itemAType: DataTypes.STRING,
            itemBType: DataTypes.STRING,
            itemAId: DataTypes.INTEGER,
            itemBId: DataTypes.INTEGER,
            index: DataTypes.INTEGER,
            relationship: DataTypes.STRING,
            role: DataTypes.STRING,
            description: DataTypes.TEXT,
            totalLikes: DataTypes.INTEGER,
            totalComments: DataTypes.INTEGER,
            totalRatings: DataTypes.INTEGER,
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
