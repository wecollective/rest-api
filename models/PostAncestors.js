'use strict'
module.exports = (sequelize, DataTypes) => {
    const PostAncestors = sequelize.define(
        'PostAncestors',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            ancestorId: DataTypes.INTEGER,
            descendentId: DataTypes.INTEGER,
            state: DataTypes.STRING,
        },
        {}
    )
    PostAncestors.associate = function (models) {
        // associations can be defined here
    }
    return PostAncestors
}
