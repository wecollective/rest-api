'use strict'
module.exports = (sequelize, DataTypes) => {
    const Stream = sequelize.define(
        'Stream',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            ownerId: DataTypes.INTEGER,
            handle: DataTypes.STRING,
            name: DataTypes.STRING,
            image: DataTypes.TEXT,
            state: DataTypes.STRING,
        },
        {}
    )
    Stream.associate = function (models) {
        Stream.belongsToMany(models.Space, {
            as: 'SourceSpaces',
            through: models.StreamSource,
            foreignKey: 'streamId',
        })
        Stream.belongsToMany(models.User, {
            as: 'SourceUsers',
            through: models.StreamSource,
            foreignKey: 'streamId',
        })
    }
    return Stream
}
