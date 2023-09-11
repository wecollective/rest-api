// Sample migration file demonstrating the different sequilize table transactions
// Add new file to 'migrations' folder when complete and run `npx sequelize-cli db:migrate` to migrate changes
// Table names are pluralised versions of their respective model names

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeColumn('Users', 'mmId', { transaction: t }),
                queryInterface.removeColumn('Users', 'facebookId', { transaction: t }),
                queryInterface.removeColumn('Comments', 'mmId', { transaction: t }),
                queryInterface.removeColumn('Comments', 'mmCommentNumber', { transaction: t }),
                queryInterface.removeColumn('Posts', 'mmId', { transaction: t }),
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
