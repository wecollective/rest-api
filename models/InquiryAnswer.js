'use strict'
module.exports = (sequelize, DataTypes) => {
    const InquiryAnswer = sequelize.define(
        'InquiryAnswer',
        {
            creatorId: DataTypes.INTEGER,
            inquiryId: DataTypes.INTEGER,
            text: DataTypes.TEXT,
        },
        {}
    )
    InquiryAnswer.associate = function (models) {
        InquiryAnswer.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'Creator',
        })
        InquiryAnswer.hasMany(models.Reaction)
    }
    return InquiryAnswer
}
