// Sample migration file demonstrating the different sequilize table transactions
// Add new file to 'migrations' folder when complete and run `npx sequelize-cli db:migrate` to migrate changes
// Table names are pluralised versions of their respective model names

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addIndex('Posts', ['createdAt']),
                queryInterface.addIndex('Posts', ['totalLikes']),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeIndex('Posts', ['createdAt']),
                queryInterface.removeIndex('Posts', ['totalLikes']),
            ])
        })
    },
}
