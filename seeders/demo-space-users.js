'use strict'

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.bulkInsert('SpaceUsers', [
            {
                id: 1,
                relationship: 'moderator',
                state: 'active',
                spaceId: 1,
                userId: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ])
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.bulkDelete('SpaceUsers', null, {})
    },
}
