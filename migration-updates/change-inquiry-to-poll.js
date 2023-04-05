// Sample migration file demonstrating the different sequilize table transactions
// Add new file to 'migrations' folder when complete and run `npx sequelize-cli db:migrate` to migrate changes
// Table names are pluralised versions of their respective model names

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameTable('Inquiries', 'Polls'),
                queryInterface.renameTable('InquiryAnswers', 'PollAnswers'),
            ])
        })
    },

    down: (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction((t) => {
            return Promise.all([
                queryInterface.renameTable('Polls', 'Inquiries'),
                queryInterface.renameTable('PollAnswers', 'InquiryAnswers'),
            ])
        })
    },
}
