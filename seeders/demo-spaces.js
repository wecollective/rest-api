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
                privacy: 'public',
                flagImagePath:
                    'https://weco-prod-space-flag-images.s3.eu-west-1.amazonaws.com/1614556880362',
                coverImagePath:
                    'https://weco-prod-space-cover-images.s3.eu-west-1.amazonaws.com/space-cover-image-1-1-Global-Brain-colored-jpg-1663802855887.jpeg',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ])
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.bulkDelete('Spaces', null, {})
    },
}
