module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('Comments', 'holonId', 'spaceId'),
                queryInterface.renameColumn('Reactions', 'holonId', 'spaceId'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('Comments', 'spaceId', 'holonId'),
                queryInterface.renameColumn('Reactions', 'spaceId', 'holonId'),
            ])
        })
    },
}
