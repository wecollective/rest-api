module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'Weaves',
                    'nextMoveDeadline',
                    {
                        type: Sequelize.DataTypes.DATE,
                    },
                    { transaction: t }
                ),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeColumn('Weaves', 'nextMoveDeadline', { transaction: t }),
            ])
        })
    },
}
