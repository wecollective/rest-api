require('dotenv').config()
const { NODE_ENV, APP_ENV } = process.env
const apiEnv = NODE_ENV.toUpperCase()
const appEnv = APP_ENV.toUpperCase()

module.exports = {
    // database connection
    username: process.env[`${apiEnv}_DB_USER`],
    password: process.env[`${apiEnv}_DB_PASSWORD`],
    database: process.env[`${apiEnv}_DB_NAME`],
    host: process.env[`${apiEnv}_DB_HOST`],
    port: process.env[`${apiEnv}_DB_PORT`],
    dialect: 'mysql',
    // urls and keys
    appURL: process.env[`${appEnv}_APP_URL`],
    appURL2: process.env[`${appEnv}_APP_URL2`],
    apiUrl: process.env[`${apiEnv}_API_URL`],
    recaptchaSecretKey: process.env[`RECAPTCHA_SECRET_KEY_${appEnv}`],
}
