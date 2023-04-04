module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.removeColumn('Posts', 'url', { transaction: t }),
                queryInterface.removeColumn('Posts', 'urlImage', { transaction: t }),
                queryInterface.removeColumn('Posts', 'urlDomain', { transaction: t }),
                queryInterface.removeColumn('Posts', 'urlTitle', { transaction: t }),
                queryInterface.removeColumn('Posts', 'urlDescription', { transaction: t }),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.addColumn(
                    'Posts',
                    'url',
                    {
                        type: Sequelize.DataTypes.STRING,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'urlDescription',
                    {
                        type: Sequelize.DataTypes.STRING,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'urlImage',
                    {
                        type: Sequelize.DataTypes.STRING,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'urlDomain',
                    {
                        type: Sequelize.DataTypes.STRING,
                    },
                    { transaction: t }
                ),
                queryInterface.addColumn(
                    'Posts',
                    'urlTitle',
                    {
                        type: Sequelize.DataTypes.STRING,
                    },
                    { transaction: t }
                ),
            ])
        })
    },
}
