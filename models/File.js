'use strict'
module.exports = (sequelize, DataTypes) => {
    const File = sequelize.define(
        'File',
        {
            id: {
                primaryKey: true,
                type: DataTypes.INTEGER,
                autoIncrement: true,
            },
            creatorId: DataTypes.INTEGER,
            state: DataTypes.STRING,
            url: DataTypes.TEXT,
            name: DataTypes.TEXT,
            mbsize: DataTypes.DECIMAL(10, 2),
            type: DataTypes.STRING,
        },
        {}
    )
    File.associate = function (models) {}
    return File
}
