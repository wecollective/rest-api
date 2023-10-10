'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('Posts', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            type: {
                type: Sequelize.STRING,
            },
            state: {
                type: Sequelize.STRING,
            },
            creatorId: {
                type: Sequelize.INTEGER,
            },
            title: {
                type: Sequelize.TEXT,
            },
            text: {
                type: Sequelize.TEXT,
            },
            searchableText: {
                type: Sequelize.TEXT,
            },
            color: {
                type: Sequelize.STRING,
            },
            watermark: {
                type: Sequelize.BOOLEAN,
            },
            totalLikes: {
                type: Sequelize.INTEGER,
            },
            totalComments: {
                type: Sequelize.INTEGER,
            },
            totalLinks: {
                type: Sequelize.INTEGER,
            },
            totalReposts: {
                type: Sequelize.INTEGER,
            },
            totalRatings: {
                type: Sequelize.INTEGER,
            },
            totalGlassBeadGames: {
                type: Sequelize.INTEGER,
            },
            lastActivity: {
                type: Sequelize.DATE,
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
        return queryInterface.dropTable('Posts')
    },
}
