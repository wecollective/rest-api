'use strict'
module.exports = (sequelize, DataTypes) => {
    const Poll = sequelize.define(
        'Poll',
        {
            postId: DataTypes.INTEGER,
            type: DataTypes.STRING,
            title: DataTypes.TEXT,
            answersLocked: DataTypes.BOOLEAN,
            endTime: DataTypes.DATE,
        },
        {}
    )
    Poll.associate = function (models) {
        Poll.hasMany(models.PollAnswer, {
            foreignKey: 'pollId',
        })
    }
    return Poll
}
