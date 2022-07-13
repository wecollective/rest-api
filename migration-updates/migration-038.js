module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'Weaves',
                    'state',
                    {
                        type: Sequelize.DataTypes.STRING,
                    },
                    { transaction: t }
                ),
                queryInterface.removeColumn('Weaves', 'fixedPlayerColors', { transaction: t }),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeColumn('Weaves', 'state', { transaction: t }),
                queryInterface.addColumn(
                    'Weaves',
                    'fixedPlayerColors',
                    {
                        type: Sequelize.DataTypes.BOOLEAN,
                    },
                    { transaction: t }
                ),
            ])
        })
    },
}
