'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('Spaces', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            state: {
                type: Sequelize.STRING,
            },
            privacy: {
                type: Sequelize.STRING,
            },
            creatorId: {
                type: Sequelize.INTEGER,
            },
            handle: {
                type: Sequelize.STRING,
                //unique: true
            },
            name: {
                type: Sequelize.STRING,
            },
            description: {
                type: Sequelize.TEXT,
            },
            flagImagePath: {
                type: Sequelize.TEXT,
            },
            coverImagePath: {
                type: Sequelize.TEXT,
            },
            inviteToken: {
                type: Sequelize.TEXT,
            },
            totalPostLikes: {
                type: Sequelize.INTEGER,
            },
            totalPosts: {
                type: Sequelize.INTEGER,
            },
            totalComments: {
                type: Sequelize.INTEGER,
            },
            totalFollowers: {
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
        return queryInterface.dropTable('Spaces')
    },
}
