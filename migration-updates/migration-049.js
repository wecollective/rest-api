module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([queryInterface.renameColumn('SpaceUsers', 'holonId', 'spaceId')])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([queryInterface.renameColumn('SpaceUsers', 'spaceId', 'holonId')])
        })
    },
}
