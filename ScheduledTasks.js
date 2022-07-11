const config = require('./Config')
const schedule = require('node-schedule')
const sequelize = require('sequelize')
const { Op } = sequelize
const { User, Event, UserEvent, Notification } = require('./models')
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

function scheduleNotification(data) {
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

module.exports = {
    initialize: async () => {
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
                scheduleNotification({
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
                scheduleNotification({
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
    },
    scheduleNotification,
}
