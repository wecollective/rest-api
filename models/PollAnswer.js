'use strict'
module.exports = (sequelize, DataTypes) => {
    const PollAnswer = sequelize.define(
        'PollAnswer',
        {
            creatorId: DataTypes.INTEGER,
            pollId: DataTypes.INTEGER,
            text: DataTypes.TEXT,
        },
        {}
    )
    PollAnswer.associate = function (models) {
        PollAnswer.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'Creator',
        })
        PollAnswer.hasMany(models.Reaction)
    }
    return PollAnswer
}
