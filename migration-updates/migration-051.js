module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameTable('VerticalHolonRelationships', 'SpaceParents'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameTable('SpaceParents', 'VerticalHolonRelationships'),
            ])
        })
    },
}
