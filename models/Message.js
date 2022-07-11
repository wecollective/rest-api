'use strict'
module.exports = (sequelize, DataTypes) => {
    const Message = sequelize.define(
        'Message',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            type: DataTypes.STRING,
            state: DataTypes.STRING,
            from: DataTypes.INTEGER,
            to: DataTypes.INTEGER,
            text: DataTypes.TEXT,
        },
        {}
    )
    Message.associate = function (models) {
        // associations can be defined here
    }
    return Message
}
