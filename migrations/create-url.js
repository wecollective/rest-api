'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('Urls', {
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
            state: {
                type: Sequelize.STRING,
            },
            url: {
                type: Sequelize.TEXT,
            },
            image: {
                type: Sequelize.TEXT,
            },
            title: {
                type: Sequelize.TEXT,
            },
            description: {
                type: Sequelize.TEXT,
            },
            domain: {
                type: Sequelize.TEXT,
            },
            favicon: {
                type: Sequelize.TEXT,
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
        return queryInterface.dropTable('Urls')
    },
}
