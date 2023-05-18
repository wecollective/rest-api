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
            as: 'PostA',
        })
        Link.belongsTo(models.Post, {
            foreignKey: 'itemBId',
            as: 'PostB',
        })
        // Link.belongsTo(models.Comment, {
        //     foreignKey: 'itemAId',
        //     as: 'CommentA',
        // })
        // Link.belongsTo(models.Comment, {
        //     foreignKey: 'itemBId',
        //     as: 'CommentB',
        // })
        // Link.belongsTo(models.Post, {
        //   //as: 'postComment',
        //   foreignKey: 'itemAId',
        //   //sourceKey: 'postId'
        // })
        // Link.belongsTo(models.User, {
        //   //foreignKey: 'creatorId',
        //   //as: 'creator'
        // })
        // Link.belongsTo(models.Space, {
        //   //foreignKey: 'creatorId',
        //   //as: 'creator'
        // })
    }
    return Link
}
