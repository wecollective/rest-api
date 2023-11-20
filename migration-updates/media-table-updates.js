// Sample migration file demonstrating the different sequilize table transactions
// Add new file to 'migrations' folder when complete and run `npx sequelize-cli db:migrate` to migrate changes
// Table names are pluralised versions of their respective model names

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeColumn('Urls', 'type', { transaction: t }),
                queryInterface.renameColumn('Urls', 'itemId', 'postId'),
                queryInterface.removeColumn('Images', 'type', { transaction: t }),
                queryInterface.renameColumn('Images', 'itemId', 'postId'),
                queryInterface.removeColumn('Audios', 'type', { transaction: t }),
                queryInterface.renameColumn('Audios', 'itemId', 'postId'),
                queryInterface.removeColumn('GlassBeadGames', 'oldGameId', { transaction: t }),
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
