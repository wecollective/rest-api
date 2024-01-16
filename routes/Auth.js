require('dotenv').config()
const express = require('express')
const router = express.Router()
const { appURL, recaptchaSecretKey } = require('../Config')
const sequelize = require('sequelize')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const { User, Notification } = require('../models')
const Op = sequelize.Op

async function verifyRecaptch(reCaptchaToken) {
    const secret = recaptchaSecretKey
    const url = 'https://www.google.com/recaptcha/api/siteverify'
    const response = await axios.post(`${url}?secret=${secret}&response=${reCaptchaToken}`)
    return response.data.success && response.data.score > 0.3
}

// POST
router.post('/log-in', async (req, res) => {
    const { emailOrHandle, password } = req.body
    const user = await User.findOne({
        where: { [Op.or]: [{ email: emailOrHandle }, { handle: emailOrHandle }] },
        attributes: ['id', 'password', 'emailVerified', 'state'],
    })
    if (!user) res.status(404).json({ message: 'User not found' })
    else if (user.state === 'spam') res.status(403).json({ message: 'Spam account' })
    else if (!user.emailVerified)
        res.status(403).json({ userId: user.id, message: 'Email not yet verified' })
    else {
        // check password is correct
        bcrypt.compare(password, user.password, function (error, success) {
            if (!success) res.status(403).json({ message: 'Incorrect password' })
            else {
                // create access token
                const payload = { id: user.id }
                const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
                    expiresIn: '7d',
                })
                // const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' })
                res.status(200).send(accessToken)
            }
        })
    }
})

router.post('/register', async (req, res) => {
    const { reCaptchaToken, handle, name, email, password } = req.body
    // verify recaptcha
    const validRecaptcha = await verifyRecaptch(reCaptchaToken)
    if (!validRecaptcha) res.status(403).json({ message: 'Recaptcha failed' })
    else {
        // check if handle or email already taken
        const matchingHandle = await User.findOne({ where: { handle } })
        const matchingEmail = await User.findOne({ where: { email } })
        if (matchingHandle) res.status(403).json({ message: 'Handle taken' })
        else if (matchingEmail) res.status(403).json({ message: 'Email taken' })
        else {
            // create account and send verification email
            const hashedPassword = await bcrypt.hash(password, 10)
            const emailToken = crypto.randomBytes(64).toString('hex')
            const createUser = await User.create({
                handle,
                name,
                email,
                password: hashedPassword,
                emailVerified: false,
                emailToken,
                state: 'active',
            })
            const createNotification = await Notification.create({
                ownerId: createUser.id,
                type: 'welcome-message',
                seen: false,
            })
            const sendEmail = await sgMail.send({
                to: email,
                from: { email: 'admin@weco.io', name: 'we { collective }' },
                subject: 'Verify your email',
                text: `
                    Hi, thanks for creating an account on weco.
                    Please copy and paste the address below to verify your email address:
                    http://${appURL}?alert=verify-email&token=${emailToken}
                `,
                html: `
                    <h1>Hi</h1>
                    <p>Thanks for creating an account on weco.</p>
                    <p>Please click the link below to verify your account:</p>
                    <a href='${appURL}?alert=verify-email&token=${emailToken}'>Verfiy your account</a>
                `,
            })
            Promise.all([createUser, createNotification, sendEmail])
                .then(res.status(200).json({ message: 'Success' }))
                .catch((error) => console.log('error: ', error))
        }
    }
})

router.post('/reset-password-request', async (req, res) => {
    const { reCaptchaToken, email } = req.body
    const validRecaptcha = await verifyRecaptch(reCaptchaToken)
    if (!validRecaptcha) res.status(403).json({ message: 'Recaptcha failed' })
    else {
        const user = await User.findOne({ where: { email } })
        if (!user) res.status(404).send({ message: 'User not found' })
        else {
            const passwordResetToken = crypto.randomBytes(64).toString('hex')
            const createResetToken = await user.update({ passwordResetToken })
            const sendEmail = await sgMail.send({
                to: email,
                from: { email: 'admin@weco.io', name: 'we { collective }' },
                subject: 'Reset your password',
                text: `
                    Hi, we recieved a request to reset your password.
                    If that's correct, copy and paste the address below to set a new password:
                    http://${appURL}?alert=reset-password&token=${passwordResetToken}
                `,
                html: `
                    <p>Hi, we recieved a request to reset your password on weco.</p>
                    <p>If that's correct click the link below to set a new password:</p>
                    <a href='${appURL}?alert=reset-password&token=${passwordResetToken}'>Set new password</a>
                `,
            })

            Promise.all([createResetToken, sendEmail])
                .then(() => res.status(200).send({ message: 'Success' }))
                .catch((error) => res.status(500).send(error))
        }
    }
})

router.post('/reset-password', async (req, res) => {
    const { password, token } = req.body
    const user = await User.findOne({ where: { passwordResetToken: token } })
    if (!user) res.status(404).send({ message: 'Invalid token' })
    else {
        const hashedPassword = await bcrypt.hash(password, 10)
        user.update({ password: hashedPassword, passwordResetToken: null })
            .then(() => res.status(200).send({ message: 'Success' }))
            .catch((error) => res.status(500).send(error))
    }
})

router.post('/resend-verification-email', async (req, res) => {
    const { userId } = req.body
    const token = crypto.randomBytes(64).toString('hex')
    const user = await User.findOne({ where: { id: userId } })
    if (!user) res.status(404).send({ message: 'User not found' })
    else {
        const updateEmailToken = await user.update({ emailToken: token })
        const sendVerificationEmail = await sgMail.send({
            to: user.email,
            from: { email: 'admin@weco.io', name: 'we { collective }' },
            subject: 'Verify your email',
            text: `
                Hi, thanks for creating an account on weco.
                Please copy and paste the address below to verify your email address:
                http://${appURL}?alert=verify-email&token=${token}
            `,
            html: `
                <h1>Hi</h1>
                <p>Thanks for creating an account on weco.</p>
                <p>Please click the link below to verify your account:</p>
                <a href='${appURL}?alert=verify-email&token=${token}'>Verfiy your account</a>
            `,
        })

        Promise.all([updateEmailToken, sendVerificationEmail])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).send(error))
    }
})

router.post('/verify-email', async (req, res) => {
    const { token } = req.body
    const user = await User.findOne({ where: { emailToken: token } })
    if (!user) res.status(404).send({ message: 'Invalid token' })
    else {
        const markEmailVerified = await user.update({
            emailVerified: true,
            emailToken: null,
            state: 'active',
        })
        const createNotification = Notification.create({
            ownerId: user.id,
            type: 'email-verified',
            seen: false,
        })
        Promise.all([markEmailVerified, createNotification])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).send(error))
    }
})

router.post('/claim-account', async (req, res) => {
    const { email, password } = req.body
    const match = await User.findOne({ where: { email } })
    if (!match) res.status(403).send({ message: 'Account not found' })
    else if (match.state !== 'unclaimed')
        res.status(403).send({ message: 'Account already claimed' })
    else {
        const hashedPassword = await bcrypt.hash(password, 10)
        const emailToken = crypto.randomBytes(64).toString('hex')
        const updateAccount = await match.update({ password: hashedPassword, emailToken })
        const sendEmail = await sgMail.send({
            to: email,
            from: { email: 'admin@weco.io', name: 'we { collective }' },
            subject: 'Claim your account',
            text: `
                Hi, we've recieved a request to claim your account on weco.io.
                If this was you, copy and paste the address below to verify your email:
                http://${appURL}?alert=verify-email&token=${emailToken}
            `,
            html: `
                <h1>Hi</h1>
                <p>We've recieved a request to claim your account on weco.io.</p>
                <p>If this was you, click <a href='${appURL}?alert=verify-email&token=${emailToken}'>here</a> to verify your email.</p>
            `,
        })
        Promise.all([updateAccount, sendEmail])
            .then(() => res.status(200).send({ message: 'Success' }))
            .catch((error) => res.status(500).send(error))
    }
})

module.exports = router
