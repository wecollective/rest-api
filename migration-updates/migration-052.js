module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('SpaceParents', 'holonAId', 'spaceAId'),
                queryInterface.renameColumn('SpaceParents', 'holonBId', 'spaceBId'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('SpaceParents', 'spaceAId', 'holonAId'),
                queryInterface.renameColumn('SpaceParents', 'spaceBId', 'holonBId'),
            ])
        })
    },
}
