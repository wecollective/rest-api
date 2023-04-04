module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.dropTable('GlassBeadGames'),
                queryInterface.dropTable('GlassBeadGameComments'),
                queryInterface.dropTable('GlassBeads'),
                queryInterface.dropTable('Weaves'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all()
        })
    },
}
