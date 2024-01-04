'use strict'
const fs = require('fs')
const path = require('path')
const Sequelize = require('sequelize')
const basename = path.basename(__filename)
const config = require('../Config.js')
const db = {}

const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    // pool setting may need increasing for long database operations
    pool: {
        acquire: 1440000, // (24 mins) default: 60000 (1 min)
        idle: 1440000, // (24 mins) default: 10000 (10 secs)
    },
})

fs.readdirSync(__dirname)
    .filter((file) => {
        return file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js'
    })
    .forEach((file) => {
        const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes)
        db[model.name] = model
    })

Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) db[modelName].associate(db)
})

db.sequelize = sequelize
db.Sequelize = Sequelize

module.exports = db
