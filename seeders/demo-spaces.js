'use strict'

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.bulkInsert('Spaces', [
            {
                id: 1,
                state: 'active',
                creatorId: 1,
                handle: 'all',
                name: 'All',
                description: 'This is the root space...',
                flagImagePath: null,
                coverImagePath: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ])
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.bulkDelete('Spaces', null, {})
    },
}
