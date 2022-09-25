module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([queryInterface.renameColumn('SpacePosts', 'holonId', 'spaceId')])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([queryInterface.renameColumn('SpacePosts', 'spaceId', 'holonId')])
        })
    },
}
