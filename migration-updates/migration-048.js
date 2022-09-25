module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([queryInterface.renameTable('HolonUsers', 'SpaceUsers')])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([queryInterface.renameTable('SpaceUsers', 'HolonUsers')])
        })
    },
}
