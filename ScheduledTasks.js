const config = require('./Config')
const schedule = require('node-schedule')
const sequelize = require('sequelize')
const { Op } = sequelize
const { User, Event, UserEvent, Notification, Post, Weave } = require('./models')
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

function scheduleEventNotification(data) {
    const { type, postId, eventId, userEventId, startTime, userId, userName, userEmail } = data
    // calculate reminder time
    const offset = 1000 * 60 * 15 // 15 minutes
    const reminderTime = new Date(new Date(startTime).getTime() - offset)
    // schedule jobs
    schedule.scheduleJob(reminderTime, async () => {
        // check event still exists and user still going or interested
        const event = await Event.findOne({ where: { id: eventId, state: 'active' } })
        const userEvent = await UserEvent.findOne({ where: { id: userEventId, state: 'active' } })
        if (event && userEvent) {
            // create notification
            Notification.create({
                ownerId: userId,
                type: `event-${type}-reminder`,
                seen: false,
                postId,
            })
            // send email
            const typeText = type === 'going' ? 'going to' : 'interested in'
            sgMail.send({
                to: userEmail,
                from: { email: 'admin@weco.io', name: 'we { collective }' },
                subject: 'New notification',
                text: `
                    Hi ${userName}, an event you marked yourself as ${typeText} is starting in 15 minutes:
                    http://${config.appURL}/p/${postId}
                `,
                html: `
                    <p>
                        Hi ${userName},
                        <br/>
                        <br/>
                        An <a href='${config.appURL}/p/${postId}'>event</a> you marked yourself as ${typeText} is starting in 15 minutes.
                    </p>
                `,
            })
        }
    })
}

async function scheduleWeaveMoveJobs(postId, player, moveTimeWindow) {
    const deadline = new Date(new Date().getTime() + moveTimeWindow * 60 * 1000)
    const reminderTime = new Date(deadline.getTime() - 15 * 60 * 1000) // 15 minutes before
    // schedule reminder
    schedule.scheduleJob(reminderTime, async () => {
        const post = await Post.findOne({
            where: { id: postId, state: 'visible' },
            include: [
                {
                    model: Weave,
                    attributes: ['state'],
                },
            ],
        })
        if (post && post.Weave.state === 'active') {
            // create notification
            Notification.create({
                ownerId: player.id,
                type: 'weave-move-reminder',
                seen: false,
                postId,
            })
            // send email
            sgMail.send({
                to: player.email,
                from: { email: 'admin@weco.io', name: 'we { collective }' },
                subject: 'New notification',
                text: `
                    Hi ${player.name}, you have 15 minutes left to complete your move on this Weave:
                    http://${config.appURL}/p/${postId}
                    If you fail to do this, the game ends!
                `,
                html: `
                    <p>
                        Hi ${player.name},
                        <br/>
                        <br/>
                        You have 15 minutes left to complete your move on <a href='${config.appURL}/p/${postId}'>this Weave</a>.
                        <br/>
                        <br/>
                        If you fail to do this, the game ends!
                    </p>
                `,
            })
        }
    })
    // schedule deadline
    schedule.scheduleJob(deadline, async () => {
        const post = await Post.findOne({
            where: { id: postId, state: 'visible' },
            include: [
                {
                    model: Weave,
                    attributes: ['state'],
                },
                {
                    model: User,
                    as: 'StringPlayers',
                    attributes: ['id', 'name', 'email'],
                    through: {
                        where: { type: 'weave' },
                        attributes: ['index'],
                    },
                },
                {
                    model: Post,
                    as: 'StringPosts',
                    required: false,
                    through: {
                        where: { state: 'visible' },
                        attributes: ['index'],
                    },
                    include: [
                        {
                            model: User,
                            as: 'Creator',
                            attributes: ['id', 'handle', 'name', 'flagImagePath'],
                        },
                    ],
                },
            ],
        })
        if (post && post.Weave.state === 'active') {
            const beads = post.StringPosts.sort((a, b) => a.Link.index - b.Link.index)
            // check if last bead was taken by player
            if (!beads.length || beads[beads.length].Creator.id !== player.id) {
                // if move not taken, cancel game and notify other players
                const updateWeaveState = await Weave.update(
                    { state: 'cancelled' },
                    { where: { postId } }
                )
                const notifyPlayers = await Promise.all[
                    post.StringPlayers.map(
                        (p) =>
                            new Promise(async (resolve) => {
                                const createNotification = await Notification.create({
                                    ownerId: p.id,
                                    type: 'weave-cancelled',
                                    userId: player.id,
                                    postId,
                                    seen: false,
                                })
                                const name = p.id === player.id ? 'You' : player.name
                                const sendEmail = await sgMail.send({
                                    to: p.email,
                                    from: { email: 'admin@weco.io', name: 'we { collective }' },
                                    subject: 'New notification',
                                    text: `
                                    Hi ${p.name}, ${name} failed to make their move in time on this Weave:
                                    http://${config.appURL}/p/${postId}
                                    The game has now ended!
                                `,
                                    html: `
                                    <p>
                                        Hi ${p.name},
                                        <br/>
                                        <br/>
                                        ${name} failed to make their move in time on <a href='${config.appURL}/p/${postId}'>this Weave</a>.
                                        <br/>
                                        <br/>
                                        The game has now ended!
                                    </p>
                                `,
                                })
                                Promise.all([createNotification, sendEmail])
                                    .then(() => resolve())
                                    .catch(() => resolve())
                            })
                    )
                ]
                Promise.all([updateWeaveState, notifyPlayers])
            }
        }
    })
}

module.exports = {
    initialize: async () => {
        // events
        const upcomingEvents = await Event.findAll({
            where: { startTime: { [Op.gte]: new Date() }, state: 'active' },
            include: [
                {
                    model: User,
                    as: 'Going',
                    attributes: ['id', 'handle', 'name', 'email'],
                    through: {
                        where: { relationship: 'going', state: 'active' },
                        attributes: ['id'],
                    },
                },
                {
                    model: User,
                    as: 'Interested',
                    attributes: ['id', 'handle', 'name', 'email'],
                    through: {
                        where: { relationship: 'interested', state: 'active' },
                        attributes: ['id'],
                    },
                },
            ],
        })
        upcomingEvents.forEach((event) => {
            event.Going.forEach((user) =>
                scheduleEventNotification({
                    type: 'going',
                    postId: event.postId,
                    eventId: event.id,
                    userEventId: user.UserEvent.id,
                    startTime: event.startTime,
                    userId: user.id,
                    userName: user.name,
                    userEmail: user.email,
                })
            )
            event.Interested.forEach((user) =>
                scheduleEventNotification({
                    type: 'interested',
                    postId: event.postId,
                    eventId: event.id,
                    userEventId: user.UserEvent.id,
                    startTime: event.startTime,
                    userId: user.id,
                    userName: user.name,
                    userEmail: user.email,
                })
            )
        })
        // weave moves
        const weavePosts = await Post.findAll({
            where: { state: 'visible', type: 'weave' },
            attributes: ['id'],
            include: [
                {
                    model: Weave,
                    attributes: ['state', 'moveTimeWindow', 'numberOfTurns'],
                },
                {
                    model: User,
                    as: 'StringPlayers',
                    attributes: ['id', 'name', 'email'],
                    through: {
                        where: { type: 'weave' },
                        attributes: ['index'],
                    },
                },
                {
                    model: Post,
                    as: 'StringPosts',
                    required: false,
                    through: {
                        where: { state: 'visible' },
                        attributes: [],
                    },
                },
            ],
        })
        weavePosts.forEach((weavePost) => {
            const { id, StringPosts, StringPlayers } = weavePost
            const { privacy, state, numberOfTurns, moveTimeWindow } = weavePost.Weave
            if (privacy === 'only-selected-users' && state === 'active') {
                StringPlayers.sort((a, b) => a.UserPost.index - b.UserPost.index)
                const activePlayerId =
                    StringPosts.length + 1 < StringPlayers.length * numberOfTurns
                        ? StringPlayers[(StringPosts.length + 1) % StringPlayers.length].id
                        : null
                const activePlayer = StringPlayers.find((p) => p.id === activePlayerId)
                scheduleWeaveMoveJobs(id, activePlayer, moveTimeWindow)
            }
        })
    },
    scheduleEventNotification,
    scheduleWeaveMoveJobs,
}
