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
            type: DataTypes.STRING, // todo: remove after updates
            itemAType: DataTypes.STRING, // 'user', 'space', posts: ('post', 'comment', 'bead', 'poll-answer', 'card-face', media block: 'url', 'image', 'audio')
            itemBType: DataTypes.STRING,
            itemAId: DataTypes.INTEGER,
            itemBId: DataTypes.INTEGER,
            index: DataTypes.INTEGER, // used to order media blocks, card faces, and GBG beads
            relationship: DataTypes.STRING, // 'link', 'parent', or 'root' ('link' used for horizontal user created links, 'parent' used for links that connect child items to their parents, 'root' used to connect descendents to their root (i.e the source post for a deeply nested comment))
            role: DataTypes.STRING, // null or prompt ('prompt' used on GBG's when a post is linked as the starting bead of a new game)
            description: DataTypes.TEXT, // user entered text description of the link
            // todo: potentially wrap links in posts and get the below tally values there?
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
        //
        Link.belongsTo(models.Post, { foreignKey: 'itemBId' })
        Link.belongsTo(models.Url, { foreignKey: 'itemBId' })
        Link.belongsTo(models.Image, { foreignKey: 'itemBId' })
        Link.belongsTo(models.Audio, { foreignKey: 'itemBId' })
    }
    return Link
}
