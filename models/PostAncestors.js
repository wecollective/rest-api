'use strict'
module.exports = (sequelize, DataTypes) => {
    const PostAncestor = sequelize.define(
        'PostAncestor',
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
    PostAncestor.associate = function (models) {
        // associations can be defined here
    }
    return PostAncestor
}
