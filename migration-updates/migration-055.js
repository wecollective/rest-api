module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'Users',
                    'mmId',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'mmId',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Comments',
                    'mmId',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeColumn('Users', 'mmId', { transaction: t }),
                queryInterface.removeColumn('Posts', 'mmId', { transaction: t }),
                queryInterface.removeColumn('Comments', 'mmId', { transaction: t }),
            ])
        })
    },
}
