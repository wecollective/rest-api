// Sample migration file demonstrating the different sequilize table transactions
// Add new file to 'migrations' folder when complete and run `npx sequelize-cli db:migrate` to migrate changes
// Table names are pluralised versions of their respective model names

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'Links',
                    'totalLikes',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Links',
                    'totalComments',
                    {
                        type: Sequelize.DataTypes.INTEGER,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Links',
                    'totalRatings',
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
                queryInterface.removeColumn('Links', 'totalLikes', { transaction: t }),
                queryInterface.removeColumn('Links', 'totalComments', { transaction: t }),
                queryInterface.removeColumn('Links', 'totalRatings', { transaction: t }),
            ])
        })
    },
}
