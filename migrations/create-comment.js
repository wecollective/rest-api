'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('Comments', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            state: {
                type: Sequelize.STRING,
            },
            itemType: {
                type: Sequelize.STRING,
            },
            itemId: {
                type: Sequelize.INTEGER,
            },
            creatorId: {
                type: Sequelize.INTEGER,
            },
            spaceId: {
                type: Sequelize.INTEGER,
            },
            parentCommentId: {
                type: Sequelize.INTEGER,
            },
            text: {
                type: Sequelize.TEXT,
            },
            totalLikes: {
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
        return queryInterface.dropTable('Comments')
    },
}
