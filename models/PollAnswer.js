'use strict'
module.exports = (sequelize, DataTypes) => {
    const PollAnswer = sequelize.define(
        'PollAnswer',
        {
            creatorId: DataTypes.INTEGER,
            pollId: DataTypes.INTEGER,
            text: DataTypes.TEXT,
            state: DataTypes.STRING,
        },
        {}
    )
    PollAnswer.associate = function (models) {
        PollAnswer.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'Creator',
        })
        PollAnswer.hasMany(models.Reaction, {
            foreignKey: 'itemId',
        })
    }
    return PollAnswer
}
