'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('GlassBeadGames', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            postId: {
                type: Sequelize.INTEGER,
            },
            topic: {
                type: Sequelize.STRING,
            },
            topicGroup: {
                type: Sequelize.STRING,
            },
            topicImage: {
                type: Sequelize.TEXT,
            },
            backgroundImage: {
                type: Sequelize.TEXT,
            },
            backgroundVideo: {
                type: Sequelize.TEXT,
            },
            backgroundVideoStartTime: {
                type: Sequelize.INTEGER,
            },
            playerOrder: {
                type: Sequelize.TEXT,
            },
            numberOfTurns: {
                type: Sequelize.INTEGER,
            },
            moveDuration: {
                type: Sequelize.INTEGER,
            },
            introDuration: {
                type: Sequelize.INTEGER,
            },
            intervalDuration: {
                type: Sequelize.INTEGER,
            },
            outroDuration: {
                type: Sequelize.INTEGER,
            },
            locked: {
                type: Sequelize.BOOLEAN,
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
        return queryInterface.dropTable('GlassBeadGames')
    },
}
