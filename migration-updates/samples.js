// Sample migration file demonstrating the different sequilize table transactions
// Add new file to 'migrations' folder when complete and run `npx sequelize-cli db:migrate` to migrate changes
// Table names are pluralised versions of their respective model names

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.createTable('Posts', {
                    id: {
                        allowNull: false,
                        autoIncrement: true,
                        primaryKey: true,
                        type: Sequelize.INTEGER,
                    },
                    text: {
                        type: Sequelize.STRING,
                    },
                    createdAt: {
                        allowNull: false,
                        type: Sequelize.DATE,
                    },
                    updatedAt: {
                        allowNull: false,
                        type: Sequelize.DATE,
                    },
                }),
                queryInterface.dropTable('Posts'),
                queryInterface.renameTable('Posts', 'NewPosts'),
                queryInterface.addColumn(
                    'Posts',
                    'columnName',
                    {
                        type: Sequelize.DataTypes.TEXT,
                    },
                    { transaction: t }
                ),
                queryInterface.removeColumn('Posts', 'columnName', { transaction: t }),
                queryInterface.renameColumn('Posts', 'currentName', 'newName'),
                queryInterface.changeColumn(
                    'Posts',
                    'columnName',
                    {
                        type: Sequelize.TEXT,
                        allowNull: true,
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
