module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeColumn('Reactions', 'postId', { transaction: t }),
                queryInterface.removeColumn('Reactions', 'commentId', { transaction: t }),
                queryInterface.removeColumn('Reactions', 'pollAnswerId', { transaction: t }),
                queryInterface.removeColumn('Reactions', 'linkId', { transaction: t }),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'Reactions',
                    'postId',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Reactions',
                    'commentId',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Reactions',
                    'pollAnswerId',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Reactions',
                    'linkId',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
            ])
        })
    },
}
