'use strict'
module.exports = (sequelize, DataTypes) => {
    const PollAnswer = sequelize.define(
        'PollAnswer',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            creator: DataTypes.INTEGER,
            text: DataTypes.TEXT,
            postId: DataTypes.INTEGER,
        },
        {}
    )
    PollAnswer.associate = function (models) {
        PollAnswer.belongsTo(models.Post, { foreignKey: 'postId' })
        PollAnswer.hasMany(models.Reaction, { as: 'Votes' })
    }
    return PollAnswer
}
