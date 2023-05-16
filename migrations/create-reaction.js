'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('Reactions', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            type: {
                type: Sequelize.STRING,
            },
            value: {
                type: Sequelize.INTEGER,
            },
            state: {
                type: Sequelize.STRING,
            },
            spaceId: {
                type: Sequelize.INTEGER,
            },
            creatorId: {
                type: Sequelize.INTEGER,
            },
            // postId: {
            //     type: Sequelize.INTEGER,
            // },
            // commentId: {
            //     type: Sequelize.INTEGER,
            // },
            // pollAnswerId: {
            //     type: Sequelize.INTEGER,
            // },
            // linkId: {
            //     type: Sequelize.INTEGER,
            // },
            itemType: {
                type: Sequelize.STRING,
            },
            itemId: {
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
        return queryInterface.dropTable('Reactions')
    },
}
