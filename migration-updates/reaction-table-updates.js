module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'Reactions',
                    'itemType',
                    {
                        type: Sequelize.DataTypes.STRING,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Reactions',
                    'itemId',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Reactions',
                    'parentItemId',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.renameColumn('Reactions', 'userId', 'creatorId'),
                queryInterface.changeColumn(
                    'Reactions',
                    'value',
                    {
                        type: Sequelize.INTEGER,
                    },
                    { transaction: t }
                ),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeColumn('Reactions', 'itemType', { transaction: t }),
                queryInterface.removeColumn('Reactions', 'itemId', { transaction: t }),
                queryInterface.renameColumn('Reactions', 'creatorId', 'userId'),
                queryInterface.changeColumn(
                    'Reactions',
                    'value',
                    {
                        type: Sequelize.STRING,
                    },
                    { transaction: t }
                ),
            ])
        })
    },
}
