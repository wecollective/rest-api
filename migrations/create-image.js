'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('Images', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            creatorId: {
                type: Sequelize.INTEGER,
            },
            // type: {
            //     type: Sequelize.STRING,
            // },
            // itemId: {
            //     type: Sequelize.INTEGER,
            // },
            postId: {
                type: Sequelize.INTEGER,
            },
            index: {
                type: Sequelize.INTEGER,
            },
            url: {
                type: Sequelize.TEXT,
            },
            caption: {
                type: Sequelize.TEXT,
            },
            state: {
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
        return queryInterface.dropTable('Images')
    },
}
