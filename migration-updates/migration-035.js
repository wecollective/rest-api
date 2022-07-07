module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction(t => {
            return Promise.all([
                queryInterface.addColumn('Weaves', 'moveTimeWindow', {
                    type: Sequelize.DataTypes.INTEGER
                }, { transaction: t }),
                queryInterface.addColumn('Weaves', 'audioTimeLimit', {
                    type: Sequelize.DataTypes.INTEGER
                }, { transaction: t }),
                queryInterface.addColumn('Weaves', 'characterLimit', {
                    type: Sequelize.DataTypes.INTEGER
                }, { transaction: t }),
                queryInterface.addColumn('Weaves', 'fixedPlayerColors', {
                    type: Sequelize.DataTypes.BOOLEAN
                }, { transaction: t }),
                queryInterface.removeColumn('Weaves', 'moveDuration', { transaction: t }),
                queryInterface.renameColumn('Weaves', 'allowedPostTypes', 'allowedBeadTypes'),
            ]);
        });
    },
    
    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction(t => {
            return Promise.all([
                queryInterface.removeColumn('Weaves', 'moveTimeWindow', { transaction: t }),
                queryInterface.removeColumn('Weaves', 'audioTimeLimit', { transaction: t }),
                queryInterface.removeColumn('Weaves', 'characterLimit', { transaction: t }),
                queryInterface.removeColumn('Weaves', 'fixedPlayerColors', { transaction: t }),
                queryInterface.addColumn('Weaves', 'moveDuration', {
                    type: Sequelize.DataTypes.INTEGER
                }, { transaction: t }),
                queryInterface.renameColumn('Weaves', 'allowedBeadTypes', 'allowedPostTypes'),
            ]);
        });
    }
};