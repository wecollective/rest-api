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
            state: {
                type: Sequelize.STRING,
            },
            locked: {
                type: Sequelize.BOOLEAN,
            },
            topicGroup: {
                type: Sequelize.STRING,
            },
            topicImage: {
                type: Sequelize.STRING,
            },
            synchronous: {
                type: Sequelize.BOOLEAN,
            },
            multiplayer: {
                type: Sequelize.BOOLEAN,
            },
            nextMoveDeadline: {
                type: Sequelize.DATE,
            },
            allowedBeadTypes: {
                type: Sequelize.STRING,
            },
            playerOrder: {
                type: Sequelize.TEXT,
            },
            totalMoves: {
                type: Sequelize.INTEGER,
            },
            movesPerPlayer: {
                type: Sequelize.INTEGER,
            },
            moveDuration: {
                type: Sequelize.INTEGER,
            },
            moveTimeWindow: {
                type: Sequelize.INTEGER,
            },
            characterLimit: {
                type: Sequelize.INTEGER,
            },
            introDuration: {
                type: Sequelize.INTEGER,
            },
            outroDuration: {
                type: Sequelize.INTEGER,
            },
            intervalDuration: {
                type: Sequelize.INTEGER,
            },
            backgroundImage: {
                type: Sequelize.STRING,
            },
            backgroundVideo: {
                type: Sequelize.STRING,
            },
            backgroundVideoStartTime: {
                type: Sequelize.STRING,
            },
            totalBeads: {
                type: Sequelize.INTEGER,
            },
            // oldGameId: {
            //     type: Sequelize.INTEGER,
            // },
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
