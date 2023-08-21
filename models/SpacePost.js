'use strict'
module.exports = (sequelize, DataTypes) => {
    const SpacePost = sequelize.define(
        'SpacePost',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            type: DataTypes.STRING,
            relationship: DataTypes.STRING,
            creatorId: DataTypes.INTEGER,
            postId: DataTypes.INTEGER,
            spaceId: DataTypes.INTEGER,
            state: DataTypes.STRING,
        },
        {}
    )
    SpacePost.associate = function (models) {}
    return SpacePost
}
