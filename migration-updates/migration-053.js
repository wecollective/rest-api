module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('Notifications', 'holonAId', 'spaceAId'),
                queryInterface.renameColumn('Notifications', 'holonBId', 'spaceBId'),
                queryInterface.renameColumn('SpaceNotifications', 'holonAId', 'spaceAId'),
                queryInterface.renameColumn('SpaceNotifications', 'holonBId', 'spaceBId'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('Notifications', 'spaceAId', 'holonAId'),
                queryInterface.renameColumn('Notifications', 'spaceBId', 'holonBId'),
                queryInterface.renameColumn('SpaceNotifications', 'spaceAId', 'holonAId'),
                queryInterface.renameColumn('SpaceNotifications', 'spaceBId', 'holonBId'),
            ])
        })
    },
}
