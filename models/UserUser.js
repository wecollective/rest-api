'use strict'
module.exports = (sequelize, DataTypes) => {
    const UserUser = sequelize.define(
        'UserUser',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            relationship: DataTypes.STRING,
            state: DataTypes.STRING,
            userAId: DataTypes.INTEGER,
            userBId: DataTypes.INTEGER,
        },
        {}
    )
    UserUser.associate = function (models) {
        // associations can be defined here
    }
    return UserUser
}
