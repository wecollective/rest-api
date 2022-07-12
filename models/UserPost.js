'use strict'
module.exports = (sequelize, DataTypes) => {
    const UserPost = sequelize.define(
        'UserPost',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            userId: DataTypes.INTEGER,
            postId: DataTypes.INTEGER,
            type: DataTypes.STRING,
            relationship: DataTypes.STRING,
            index: DataTypes.INTEGER,
            state: DataTypes.STRING,
            color: DataTypes.STRING,
        },
        {}
    )
    UserPost.associate = function (models) {
        // associations can be defined here
    }
    return UserPost
}
