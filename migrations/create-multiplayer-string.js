'use strict';
module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('MultiplayerStrings', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            postId: {
                type: Sequelize.INTEGER
            },
            numberOfTurns: {
                type: Sequelize.INTEGER
            },
            moveDuration: {
                type: Sequelize.INTEGER
            },
            allowedPostTypes: {
                type: Sequelize.STRING
            },
            privacy: {
                type: Sequelize.STRING
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });
    },
    down: (queryInterface, Sequelize) => {
        return queryInterface.dropTable('MultiplayerStrings');
    }
};