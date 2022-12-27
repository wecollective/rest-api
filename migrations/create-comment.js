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
            creatorId: {
                type: Sequelize.INTEGER,
            },
            spaceId: {
                type: Sequelize.INTEGER,
            },
            postId: {
                type: Sequelize.INTEGER,
            },
            parentCommentId: {
                type: Sequelize.INTEGER,
            },
            text: {
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
            mmId: {
                type: Sequelize.INTEGER,
            },
            mmCommentNumber: {
                type: Sequelize.INTEGER,
            },
        })
    },
    down: (queryInterface, Sequelize) => {
        return queryInterface.dropTable('Comments')
    },
}
