'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('Files', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            creatorId: {
                type: Sequelize.INTEGER,
            },
            state: {
                type: Sequelize.STRING,
            },
            url: {
                type: Sequelize.TEXT,
            },
            name: {
                type: Sequelize.TEXT,
            },
            mbsize: {
                type: Sequelize.DECIMAL(10, 2),
            },
            type: {
                type: Sequelize.STRING,
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
        })
    },
    down: (queryInterface, Sequelize) => {
        return queryInterface.dropTable('Files')
    },
}
