'use strict'
module.exports = (sequelize, DataTypes) => {
    const Inquiry = sequelize.define(
        'Inquiry',
        {
            postId: DataTypes.INTEGER,
            type: DataTypes.STRING,
            title: DataTypes.TEXT,
            answersLocked: DataTypes.BOOLEAN,
            endTime: DataTypes.DATE,
        },
        {}
    )
    Inquiry.associate = function (models) {
        Inquiry.hasMany(models.InquiryAnswer, {
            foreignKey: 'inquiryId',
        })
    }
    return Inquiry
}
