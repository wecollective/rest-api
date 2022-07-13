'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('Weaves', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            state: {
                type: Sequelize.STRING,
            },
            postId: {
                type: Sequelize.INTEGER,
            },
            numberOfMoves: {
                type: Sequelize.INTEGER,
            },
            numberOfTurns: {
                type: Sequelize.INTEGER,
            },
            allowedBeadTypes: {
                type: Sequelize.STRING,
            },
            moveTimeWindow: {
                type: Sequelize.INTEGER,
            },
            audioTimeLimit: {
                type: Sequelize.INTEGER,
            },
            characterLimit: {
                type: Sequelize.INTEGER,
            },
            privacy: {
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
        return queryInterface.dropTable('Weaves')
    },
}
