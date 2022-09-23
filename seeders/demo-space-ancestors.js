'use strict'

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.bulkInsert('SpaceAncestors', [
            // space A contains space B
            // todo: remove as should be necissary for same space
            {
                id: 1,
                state: 'open',
                spaceAId: 1,
                spaceBId: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ])
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.bulkDelete('SpaceAncestors', null, {})
    },
}
