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
            color: {
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
            // todo: remove urls
            // url: {
            //     type: Sequelize.TEXT,
            // },
            // urlImage: {
            //     type: Sequelize.TEXT,
            // },
            // urlDomain: {
            //     type: Sequelize.TEXT,
            // },
            // urlTitle: {
            //     type: Sequelize.TEXT,
            // },
            // urlDescription: {
            //     type: Sequelize.TEXT,
            // },
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
            mmId: {
                type: Sequelize.INTEGER,
            },
        })
    },
    down: (queryInterface, Sequelize) => {
        return queryInterface.dropTable('Posts')
    },
}
