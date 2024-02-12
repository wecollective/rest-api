'use strict'
const { Model } = require('sequelize')
module.exports = (sequelize, DataTypes) => {
    class WebPushSubscriptions extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
        }
    }
    WebPushSubscriptions.init(
        {
            userId: DataTypes.INTEGER,
            endpoint: DataTypes.TEXT,
            p256dhKey: DataTypes.STRING,
            authKey: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: 'WebPushSubscriptions',
        }
    )
    return WebPushSubscriptions
}
