module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'Images',
                    'type',
                    {
                        type: Sequelize.DataTypes.STRING,
                    },
                    { transaction: t }
                ),
                queryInterface.renameColumn('Images', 'postId', 'itemId'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeColumn('Images', 'type', { transaction: t }),
                queryInterface.renameColumn('Images', 'itemId', 'postId'),
            ])
        })
    },
}
