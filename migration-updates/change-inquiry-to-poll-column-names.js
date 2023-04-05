module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('PollAnswers', 'inquiryId', 'pollId'),
                queryInterface.renameColumn('Reactions', 'inquiryAnswerId', 'pollAnswerId'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameColumn('PollAnswers', 'pollId', 'inquiryId'),
                queryInterface.renameColumn('Reactions', 'pollAnswerId', 'inquiryAnswerId'),
            ])
        })
    },
}
