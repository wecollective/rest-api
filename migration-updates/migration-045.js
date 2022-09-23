module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('SpaceAncestors', 'holonAId', 'spaceBId'),
                queryInterface.renameColumn('SpaceAncestors', 'holonBId', 'spaceAId'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('SpaceAncestors', 'spaceBId', 'holonAId'),
                queryInterface.renameColumn('SpaceAncestors', 'spaceAId', 'holonBId'),
            ])
        })
    },
}
