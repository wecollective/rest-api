'use strict'
module.exports = (sequelize, DataTypes) => {
    const StreamSource = sequelize.define(
        'StreamSource',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            streamId: DataTypes.INTEGER,
            sourceType: DataTypes.STRING,
            sourceId: DataTypes.INTEGER,
            state: DataTypes.STRING,
        },
        {}
    )
    StreamSource.associate = function (models) {
        // associations can be defined here
    }
    return StreamSource
}
