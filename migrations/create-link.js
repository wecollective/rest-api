'use strict'
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('Links', {
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
            itemAType: {
                type: Sequelize.STRING,
            },
            itemBType: {
                type: Sequelize.STRING,
            },
            itemAId: {
                type: Sequelize.INTEGER,
            },
            itemBId: {
                type: Sequelize.INTEGER,
            },
            relationship: {
                type: Sequelize.STRING,
            },
            role: {
                type: Sequelize.STRING,
            },
            description: {
                type: Sequelize.TEXT,
            },
            state: {
                type: Sequelize.STRING,
            },
            // todo: remove index when ordered by date
            index: {
                type: Sequelize.INTEGER,
            },
            totalLikes: {
                type: Sequelize.INTEGER,
            },
            totalComments: {
                type: Sequelize.INTEGER,
            },
            totalRatings: {
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
        return queryInterface.dropTable('Links')
    },
}
