module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('Events', 'eventStartTime', 'startTime'),
                queryInterface.renameColumn('Events', 'eventEndTime', 'endTime'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('Events', 'startTime', 'eventStartTime'),
                queryInterface.renameColumn('Events', 'endTime', 'eventEndTime'),
            ])
        })
    },
}
