module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction(t => {
            return Promise.all([
                queryInterface.addColumn('GlassBeadGames', 'topicGroup', {
                    type: Sequelize.DataTypes.STRING
                }, { transaction: t }),
                queryInterface.addColumn('GlassBeadGames', 'topicImage', {
                    type: Sequelize.DataTypes.TEXT
                }, { transaction: t }),
                queryInterface.addColumn('GlassBeadGames', 'backgroundImage', {
                    type: Sequelize.DataTypes.TEXT
                }, { transaction: t }),
            ]);
        });
    },
    
    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction(t => {
            return Promise.all([
                queryInterface.removeColumn('GlassBeadGames', 'topicGroup', { transaction: t }),
                queryInterface.removeColumn('GlassBeadGames', 'topicImage', { transaction: t }),
                queryInterface.removeColumn('GlassBeadGames', 'backgroundImage', { transaction: t }),
            ]);
        });
    }
};