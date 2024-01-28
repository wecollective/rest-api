require('dotenv').config()
console.log(`Node environment: ${process.env.NODE_ENV}`)
const config = require('./Config')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const path = require('path')
var morgan = require('morgan')
const express = require('express')
const app = express()
const { initializeScheduledTasks } = require('./ScheduledTasks')

// set up cors with url whitelist
const cors = require('cors')
const whitelist = [config.appURL]
if (process.env.APP_ENV === 'prod') whitelist.push(config.appURL2)
app.use(
    cors({
        origin: function (origin, callback) {
            if (whitelist.indexOf(origin) !== -1 || !origin) {
                callback(null, true)
            } else {
                callback(new Error('Not allowed by CORS'))
            }
        },
    })
)
// enable pre-flight requests
app.options('*', cors())

// set up morgan access logs with unique ids
app.enable('trust proxy')
morgan.token('id', function getId(req) {
    return req.id
})
function assignId(req, res, next) {
    req.id = uuidv4()
    next()
}
app.use(assignId)
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' })
const settings =
    ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
app.use(morgan(settings, { stream: accessLogStream }))

// use express bodyparser middleware
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.get('/', (req, res) => res.send("Welcome to weco.io's REST API"))

// import routes
app.use('/', require('./routes/Auth'))
app.use('/', require('./routes/Account'))
app.use('/', require('./routes/Post'))
app.use('/', require('./routes/Space'))
app.use('/', require('./routes/User'))
app.use('/', require('./routes/Upload'))

// initialize websockets
const io = require('./Socket')
app.set('socketio', io)

// set up scheduled tasks
initializeScheduledTasks()

const port = 5000
app.listen(port, () => console.log(`Listening on port ${port}`))
