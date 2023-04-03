module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'Posts',
                    'title',
                    {
                        type: Sequelize.DataTypes.TEXT,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'totalLikes',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'totalComments',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'totalLinks',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'totalReposts',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'totalRatings',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'totalGlassBeadGames',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'lastActivity',
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
                queryInterface.removeColumn('Posts', 'title', { transaction: t }),
                queryInterface.removeColumn('Posts', 'totalLikes', { transaction: t }),
                queryInterface.removeColumn('Posts', 'totalComments', { transaction: t }),
                queryInterface.removeColumn('Posts', 'totalLinks', { transaction: t }),
                queryInterface.removeColumn('Posts', 'totalReposts', { transaction: t }),
                queryInterface.removeColumn('Posts', 'totalRatings', { transaction: t }),
                queryInterface.removeColumn('Posts', 'totalGlassBeadGames', { transaction: t }),
                queryInterface.removeColumn('Posts', 'lastActivity', { transaction: t }),
            ])
        })
    },
}
