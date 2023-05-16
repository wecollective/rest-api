// Sample migration file demonstrating the different sequilize table transactions
// Add new file to 'migrations' folder when complete and run `npx sequelize-cli db:migrate` to migrate changes
// Table names are pluralised versions of their respective model names

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('Comments', 'type', 'itemType'),
                queryInterface.addColumn(
                    'Comments',
                    'totalLikes',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Comments',
                    'totalLinks',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Comments',
                    'totalReposts',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Comments',
                    'totalRatings',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Comments',
                    'totalGlassBeadGames',
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
                // include reverse transations here to enable undo: `npx sequelize-cli db:migrate:undo:all`
            ])
        })
    },
}
