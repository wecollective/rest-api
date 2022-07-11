module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'GlassBeadGames',
                    'backgroundVideo',
                    {
                        type: Sequelize.DataTypes.TEXT,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'GlassBeadGames',
                    'backgroundVideoStartTime',
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
                queryInterface.removeColumn('GlassBeadGames', 'backgroundVideo', {
                    transaction: t,
                }),
                queryInterface.removeColumn('GlassBeadGames', 'backgroundVideoStartTime', {
                    transaction: t,
                }),
            ])
        })
    },
}
