require("dotenv").config()
const config = require('../Config')
const express = require('express')
const router = express.Router()
const sequelize = require('sequelize')
const Op = sequelize.Op
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const ScheduledTasks = require('../ScheduledTasks')
const puppeteer = require('puppeteer')
const aws = require('aws-sdk')
const multer = require('multer')
const multerS3 = require('multer-s3')
aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1'
})
const s3 = new aws.S3({})
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
ffmpeg.setFfmpegPath(ffmpegPath)
const authenticateToken = require('../middleware/authenticateToken')
const { postAttributes, asyncForEach } = require('../GlobalConstants')
const {
    Holon,
    PostHolon,
    User,
    Post,
    Comment,
    Reaction,
    Event,
    UserEvent,
    PollAnswer,
    Prism,
    PrismUser,
    PlotGraph,
    Link,
    Notification,
    GlassBeadGame,
    GlassBeadGameComment,
    GlassBead,
    PostImage,
    MultiplayerString,
    UserPost,
} = require('../models')

// GET
router.get('/post-data', (req, res) => {
    const { accountId, postId } = req.query
    let attributes = [
        ...postAttributes,
        [sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Reactions
            AS Reaction
            WHERE Reaction.postId = Post.id
            AND Reaction.userId = ${accountId}
            AND Reaction.type = 'like'
            AND Reaction.state = 'active'
            )`),'accountLike'
        ],
        [sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Reactions
            AS Reaction
            WHERE Reaction.postId = Post.id
            AND Reaction.userId = ${accountId}
            AND Reaction.type = 'rating'
            AND Reaction.state = 'active'
            )`),'accountRating'
        ],
        [sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM PostHolons
            AS PostHolon
            WHERE  PostHolon.postId = Post.id
            AND PostHolon.creatorId = ${accountId}
            AND PostHolon.type = 'repost'
            AND PostHolon.relationship = 'direct'
            )`),'accountRepost'
        ],
        [sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Links
            AS Link
            WHERE Link.state = 'visible'
            AND Link.type != 'string-post'
            AND Link.creatorId = ${accountId}
            AND (Link.itemAId = Post.id OR Link.itemBId = Post.id)
            )`),'accountLink'
        ],
    ]
    Post.findOne({ 
        where: { id: postId, state: 'visible' },
        attributes: attributes,
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
            {
                model: Holon,
                as: 'DirectSpaces',
                attributes: ['id', 'handle', 'state', 'flagImagePath'],
                through: { where: { relationship: 'direct' }, attributes: ['type'] },
            },
            {
                model: Holon,
                as: 'IndirectSpaces',
                attributes: ['id', 'handle', 'state'],
                through: { where: { relationship: 'indirect' }, attributes: ['type'] },
            },
            { 
                model: Reaction,
                where: { state: 'active' },
                required: false,
                attributes: ['id', 'type', 'value'],
                include: [
                    {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'handle', 'name', 'flagImagePath']
                    },
                    {
                        model: Holon,
                        as: 'Space',
                        attributes: ['id', 'handle', 'name', 'flagImagePath']
                    },
                ]
            },
            {
                model: Link,
                as: 'OutgoingLinks',
                where: { state: 'visible', type: { [Op.not]: 'string-post' } },
                required: false,
                attributes: ['id'],
                include: [
                    { 
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    },
                    { 
                        model: Post,
                        as: 'PostB',
                        attributes: ['id'],
                        include: [
                            { 
                                model: User,
                                as: 'Creator',
                                attributes: ['handle', 'name', 'flagImagePath'],
                            }
                        ]
                    },
                ]
            },
            {
                model: Link,
                as: 'IncomingLinks',
                where: { state: 'visible' },
                required: false,
                attributes: ['id'],
                include: [
                    { 
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    },
                    { 
                        model: Post,
                        as: 'PostA',
                        attributes: ['id'],
                        include: [
                            { 
                                model: User,
                                as: 'Creator',
                                attributes: ['handle', 'name', 'flagImagePath'],
                            }
                        ]
                    },
                ]
            },
            {
                model: PostImage,
                required: false,
            },
            {
                model: Event,
                include: [
                    {
                        model: User,
                        as: 'Going',
                        through: { where: { relationship: 'going', state: 'active' } },
                    },
                    {
                        model: User,
                        as: 'Interested',
                        through: { where: { relationship: 'interested', state: 'active' } },
                    }
                ]
            },
            {
                model: GlassBeadGame,
                attributes: ['topic', 'topicGroup', 'topicImage'],
                include: [{ 
                    model: GlassBead,
                    where: { state: 'visible' },
                    required: false,
                    include: [{
                        model: User,
                        as: 'user',
                        attributes: ['handle', 'name', 'flagImagePath']
                    }]
                }]
            },
            {
                model: Post,
                as: 'StringPosts',
                through: { where: { state: 'visible' } },
                required: false,
                include: [{ 
                    model: PostImage,
                    required: false
                }]
            },
            {
                model: MultiplayerString,
                attributes: ['numberOfTurns', 'moveDuration', 'allowedPostTypes', 'privacy'],
                required: false
            },
            {
                model: User,
                as: 'StringPlayers',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
                through: { where: { type: 'multiplayer-string' }, attributes: ['index', 'state'] },
                required: false
            },
        ]
    })
    .then(post => {
        post.DirectSpaces.forEach(space => {
            space.setDataValue('type', space.dataValues.PostHolon.type)
            delete space.dataValues.PostHolon
        })
        post.IndirectSpaces.forEach(space => {
            space.setDataValue('type', space.dataValues.PostHolon.type)
            delete space.dataValues.PostHolon
        })
        // convert SQL numeric booleans to JS booleans
        post.setDataValue('accountLike', !!post.dataValues.accountLike)
        post.setDataValue('accountRating', !!post.dataValues.accountRating)
        post.setDataValue('accountRepost', !!post.dataValues.accountRepost)
        post.setDataValue('accountLink', !!post.dataValues.accountLink)
        res.json(post)
    })
    .catch(err => console.log(err))
})

router.get('/post-comments', (req, res) => {
    const { postId } = req.query

    Comment.findAll({ 
        where: {
            postId,
            state: 'visible',
            parentCommentId: null,
        },
        order: [['createdAt', 'ASC']],
        attributes: ['id', 'parentCommentId', 'text', 'createdAt'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath']
            },
            {
                model: Comment,
                as: 'Replies',
                separate: true,
                where: { state: 'visible' },
                order: [['createdAt', 'ASC']],
                attributes: ['id', 'creatorId', 'parentCommentId', 'postId', 'text', 'createdAt'],
                include: [
                    {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'handle', 'name', 'flagImagePath']
                    }
                ]
            },
        ]
    })
    .then(comments => { res.json(comments) })
    .catch(err => console.log(err))
})

router.get('/poll-votes', (req, res) => {
    Reaction.findAll({ 
        where: { type: 'vote', postId: req.query.postId },
        attributes: ['pollAnswerId', 'value', 'createdAt']
    })
    .then(labels => {
        labels.forEach(label => {
            label.setDataValue("parsedCreatedAt", Date.parse(label.createdAt))
            delete label.dataValues.createdAt
        })
        return labels
    })
    .then(labels => { res.json(labels) })
})

router.get('/prism-data', (req, res) => {
    const { postId } = req.query
    Prism.findOne({ 
        where: { postId: postId },
        include: [
            { 
                model: User,
                attributes: ['handle', 'name', 'flagImagePath'],
                through: { attributes: [] }
            }
        ]
    })
    .then(prism => { res.json(prism) })
    .catch(err => console.log(err))
})

router.get('/plot-graph-data', (req, res) => {
    const { postId } = req.query
    PlotGraph.findOne({ 
        where: { postId: postId },
        // include: [
        //     { 
        //         model: User,
        //         attributes: ['handle', 'name', 'flagImagePath'],
        //         through: { attributes: [] }
        //     }
        // ]
    })
    .then(plotGraph => { res.json(plotGraph) })
    .catch(err => console.log(err))
})

router.get('/scrape-url', async (req, res) => {
    const { url } = req.query

    try {
        const browser = await puppeteer.launch() // { headless: false })
        const page = await browser.newPage()
        await page.goto(url, { waitUntil: 'domcontentloaded' }) // { timeout: 60000 }, { waitUntil: 'load', 'domcontentloaded', 'networkidle0', 'networkidle2' }
        await page.evaluate(async() => {
            const youtubeCookieConsent = await document.querySelector('base[href="https://consent.youtube.com/"]')
            if (youtubeCookieConsent) {
                const rejectButton = await document.querySelector('button[aria-label="Reject all"]')
                rejectButton.click()
                return
            } else {
                return
            }
        })
        await page.waitForSelector('title')
        const urlData = await page.evaluate(async() => {
            let data = {
                title: document.title || null,
                description: null,
                domain: null,
                image: null,
            }

            // description
            const ogDescription = document.querySelector('meta[property="og:description"]')
            if (ogDescription) data.description = ogDescription.content
            else {
                const nameDescription = document.querySelector('meta[name="description"]')
                if (nameDescription) data.description = nameDescription.content
            }

            // domain
            const ogSiteName = document.querySelector('meta[property="og:site_name"]')
            if (ogSiteName) data.domain = ogSiteName.content

            // image
            const metaImage = document.querySelector('meta[property="og:image"]')
            if (metaImage) data.image = metaImage.content
            else {
                const firstImage = document.querySelector('body div img')
                if (firstImage) data.image = firstImage.src
            }

            return data
        })
        if (!urlData.domain) urlData.domain = url.split('://')[1].split('/')[0].toUpperCase()
        res.send(urlData)
        await browser.close()
    } catch(e) {
        console.log('error: ', e)
        res.send({
            title: null,
            description: null,
            domain: null,
            image: null
        })
    }
})

router.get('/glass-bead-game-data', (req, res) => {
    const { postId } = req.query
    GlassBeadGame.findOne({ 
        where: { postId },
        attributes: [
            'id',
            'topic',
            'topicGroup',
            'topicImage',
            'backgroundImage',
            'backgroundVideo',
            'backgroundVideoStartTime',
            'numberOfTurns',
            'moveDuration',
            'introDuration',
            'intervalDuration',
            'outroDuration',
            'locked'
        ],
        order: [
            [GlassBeadGameComment, 'createdAt', 'ASC'],
            [GlassBead, 'createdAt', 'DESC'],
        ],
        include: [
            { 
                model: GlassBead,
                where: { state: 'visible' },
                required: false,
                include: [{
                    model: User,
                    as: 'user',
                    attributes: ['handle', 'name', 'flagImagePath']
                }]
            },
            {
                model: GlassBeadGameComment,
                required: false,
                include: [{
                    model: User,
                    required: false,
                    as: 'user',
                    attributes: ['handle', 'name', 'flagImagePath']
                }]
            },

        ]
    })
    .then(post => res.json(post))
    .catch(err => console.log(err))
})


// POST
router.post('/create-post', authenticateToken, (req, res) => {
    const accountId = req.user.id
    const { uploadType } = req.query
    const audioMBLimit = 5
    const imageMBLimit = 2

    function createPost(postData, files, imageData, stringData) {
        const {
            type,
            text,
            spaceIds,
            url,
            // url posts
            urlImage,
            urlDomain,
            urlTitle,
            urlDescription,
            // event posts
            title,
            startTime,
            endTime,
            // glass bead games
            topic,
            topicGroup,
            topicImage,
            // multiplayer strings
            privacy,
            userIds,
            numberOfTurns
        } = postData

        Post.create({
            type,
            state: 'visible',
            creatorId: accountId,
            text,
            url: type === 'audio' ? files[0].location : url,
            urlImage,
            urlDomain,
            urlTitle,
            urlDescription,
        }).then(async post => {
            const indirectSpaceIds = await new Promise((resolve, reject) => {
                Promise.all(spaceIds.map((id) => Holon.findOne({
                    where: { id, state: 'active' },
                    attributes: [],
                    include: [{
                        model: Holon,
                        as: 'HolonHandles',
                        attributes: ['id'],
                        through: { where: { state: 'open' }, attributes: [] }
                    }]
                }))).then((spaces) => {
                    const ids = []
                    spaces.forEach((space) => ids.push(...space.HolonHandles.map(holon => holon.id)))
                    const filteredIds = [...new Set(ids)].filter(id => !spaceIds.includes(id))
                    resolve(filteredIds)
                })
            })

            const createDirectRelationships = Promise.all(spaceIds.map((id) => PostHolon.create({
                type: 'post',
                relationship: 'direct',
                creatorId: accountId,
                postId: post.id,
                holonId: id
            })))

            const createIndirectRelationships = Promise.all(indirectSpaceIds.map((id) => PostHolon.create({
                type: 'post',
                relationship: 'indirect',
                creatorId: accountId,
                postId: post.id,
                holonId: id
            })))

            const createEvent = (type === 'event' || (type === 'glass-bead-game' && startTime))
                ? Event.create({
                    postId: post.id,
                    state: 'active',
                    title,
                    startTime,
                    endTime,
                })
                : null

            const createGBG = (type === 'glass-bead-game')
                ? GlassBeadGame.create({
                    postId: post.id,
                    topic,
                    topicGroup,
                    topicImage,
                    locked: false,
                })
                : null

            const createImages = (type === 'image')
                ? Promise.all(imageData.map((image, index) => PostImage.create({
                    postId: post.id,
                    creatorId: accountId,
                    index,
                    url: image.url || files.find((file) => file.index === index).location,
                    caption: image.caption,
                })))
                : null


            const createStringPosts = (type === 'string')
                ? Promise.all(stringData.map((bead, index) => 
                    new Promise((resolve, reject) => {
                        Post.create({
                            type: `string-${bead.type}`,
                            state: 'visible',
                            creatorId: accountId,
                            text: bead.text,
                            url: bead.type === 'audio' ? files.find((file) => file.beadIndex === index).location : bead.url,
                            urlImage: bead.type === 'url' ? bead.urlData.image : null,
                            urlDomain: bead.type === 'url' ? bead.urlData.domain : null,
                            urlTitle: bead.type === 'url' ? bead.urlData.title : null,
                            urlDescription: bead.type === 'url' ? bead.urlData.description : null,
                            state: 'visible'
                        }).then((stringPost) => {
                            const createPostImages = (bead.type === 'image')
                                ? Promise.all(bead.images.map((image, i) => PostImage.create({
                                    postId: stringPost.id,
                                    creatorId: accountId,
                                    index: i,
                                    url: image.url || files.find((file) => file.beadIndex === index && file.imageIndex === i).location,
                                    caption: image.caption,
                                })))
                                : null

                            const createStringLink = Link.create({
                                state: 'visible',
                                type: 'string-post',
                                index,
                                creatorId: accountId,
                                itemAId: post.id,
                                itemBId: stringPost.id,
                            })

                            Promise
                                .all([createPostImages, createStringLink])
                                .then((data) => resolve({ stringPost, imageData: data[0], linkData: data[1] }))
                        })
                    })
                ))
                : null

            const createMultiplayerString = (type === 'multiplayer-string')
                ? new Promise((resolve, reject) => {
                    MultiplayerString.create({
                        numberOfTurns,
                        // moveDuration,
                        // allowedPostTypes,
                        privacy,
                        postId: post.id
                    }).then(async() => {
                        if (privacy === 'all-users-allowed') resolve()
                        else {
                            const users = await User.findAll({
                                where: { id: userIds },
                                attributes: ['id', 'name', 'handle', 'email'],
                                order: [['createdAt', 'DESC']],
                                limit: 3
                            })
                            const accountUser = users.find((user) => user.id === accountId)
                            Promise.all(users.map((user, index) => 
                                UserPost.create({
                                    userId: user.id,
                                    postId: post.id,
                                    type: 'multiplayer-string',
                                    relationship: 'player',
                                    index: index + 1,
                                    state: user.id === accountId ? 'accepted' : 'pending'
                                }).then(() => {
                                    if (user.id !== accountId) {
                                        // create notification
                                        Notification.create({
                                            type: 'multiplayer-string-invitation',
                                            ownerId: user.id,
                                            userId: accountId,
                                            postId: post.id,
                                            seen: false,
                                            state: 'pending',
                                        })
                                        // send email
                                        sgMail.send({
                                            to: user.email,
                                            from: {
                                                email: 'admin@weco.io',
                                                name: 'we { collective }'
                                            },
                                            subject: 'New notification',
                                            text: `
                                                Hi ${user.name}, ${accountUser.name} just invited you to join a multiplayer string game on weco.
                                                Navigate here to accept or reject the invitation: https://${config.appURL}/p/${post.id}
                                            `,
                                            html: `
                                                <p>
                                                    Hi ${user.name},
                                                    <br/>
                                                    <a href='${config.appURL}/u/${accountUser.handle}'>${accountUser.name}</a>
                                                    just invited you to join a multiplayer string game on weco.
                                                    <br/>
                                                    Navigate <a href='${config.appURL}/p/${post.id}'>here</a> to accept or reject the invitation.
                                                </p>
                                            `,
                                        })
                                    }
                                })
                            )).then(() => resolve(users))
                        }
                    })
                })
                : null

            Promise.all([
                createDirectRelationships,
                createIndirectRelationships,
                createEvent,
                createGBG,
                createImages,
                createStringPosts,
                createMultiplayerString
            ]).then((data) => {
                res.status(200).json({
                    post,
                    indirectRelationships: data[1],
                    event: data[2],
                    images: data[4],
                    string: data[5],
                    multiplayerStringUsers: data[6]
                })
            })
        })
    }

    const baseUrl = `https://weco-${process.env.NODE_ENV}-`
    const s3Url = '.s3.eu-west-1.amazonaws.com'
    
    if (uploadType === 'image-post') {
        multer({
            limits: { fileSize: imageMBLimit * 1024 * 1024 },
            storage: multerS3({
                s3: s3,
                bucket: `weco-${process.env.NODE_ENV}-post-images`,
                acl: 'public-read',
                metadata: function (req, file, cb) {
                    cb(null, { mimetype: file.mimetype })
                },
                key: function (req, file, cb) {
                    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                    const date = Date.now().toString()
                    const fileName = `post-image-upload-${accountId}-${name}-${date}`
                    cb(null, fileName)
                }
            })
        }).any('file')(req, res, (error) => {
            const { files, body } = req
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                createPost(
                    JSON.parse(body.postData),
                    files.map((file) => { return { location: file.location, index: Number(file.originalname) } }),
                    JSON.parse(body.imageData)
                )
            }
        })
    } else if (uploadType === 'audio-file') {
        multer({
            limits: { fileSize: audioMBLimit * 1024 * 1024 },
            storage: multerS3({
                s3: s3,
                bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                acl: 'public-read',
                metadata: function (req, file, cb) {
                    cb(null, { mimetype: file.mimetype })
                },
                key: function (req, file, cb) {
                    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                    const date = Date.now().toString()
                    const fileName = `post-audio-upload-${accountId}-${name}-${date}.mp3`
                    console.log('fileName: ', fileName)
                    cb(null, fileName)
                }
            })
        }).single('file')(req, res, (error) => {
            const { file, body } = req
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                if (file) createPost(JSON.parse(body.postData), [file])
                else res.status(500).json({ message: 'Failed', error })
            }
        })
    } else if (uploadType === 'audio-blob') {
        multer({
            fileFilter: (req, file, cb) => {
                if (file.mimetype === 'audio/mpeg-3') cb(null, true)
                else {
                    cb(null, false)
                    cb(new Error('Only audio/mpeg-3 files allowed'))
                }
            },
            limits: { fileSize: audioMBLimit * 1024 * 1024 },
            dest: './audio/raw',
        }).single('file')(req, res, (error) => {
            const { file, body } = req
            // handle errors
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                // convert raw audio to mp3
                ffmpeg(file.path)
                    .output(`audio/mp3/${file.filename}.mp3`)
                    .on('end', function() {
                        // upload new mp3 file to s3 bucket
                        fs.readFile(`audio/mp3/${file.filename}.mp3`, function (err, data) {
                            if (!err) {
                                const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                                const date = Date.now().toString()
                                const fileName = `post-audio-recording-${accountId}-${name}-${date}.mp3`
                                console.log('fileName: ', fileName)
                                s3.putObject({
                                    Bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                                    ACL: 'public-read',
                                    Key: fileName,
                                    Body: data,
                                    Metadata: { mimetype: file.mimetype }
                                }, (err) => {
                                    if (err) console.log(err)
                                    else {
                                        // delete old files
                                        fs.unlink(`audio/raw/${file.filename}`, (err => {
                                            if (err) console.log(err)
                                        }))
                                        fs.unlink(`audio/mp3/${file.filename}.mp3`, (err => {
                                            if (err) console.log(err)
                                        }))
                                        // create post
                                        createPost(
                                            JSON.parse(body.postData),
                                            [{ location: `https://weco-${process.env.NODE_ENV}-post-audio.s3.eu-west-1.amazonaws.com/${fileName}` }]
                                        )
                                    }
                                })
                            }
                        })
                    })
                    .run()
            }
        })
    } else if (uploadType === 'string') {
        multer({
            limits: { fileSize: audioMBLimit * 1024 * 1024 },
            dest: './stringData',
        }).any()(req, res, (error) => {
            const { files, body } = req
            Promise.all(files.map((file) => new Promise((resolve, reject) => {
                if (file.fieldname === 'audioFile') {
                    fs.readFile(`stringData/${file.filename}`, function (err, data) {
                        s3.putObject({
                            Bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                            ACL: 'public-read',
                            Key: file.filename,
                            Body: data,
                            Metadata: { mimetype: file.mimetype }
                        }, (err) => {
                            if (err) console.log(err)
                            else {
                                resolve({
                                    fieldname: file.fieldname,
                                    beadIndex: +file.originalname,
                                    location: `${baseUrl}post-audio${s3Url}/${file.filename}`
                                })
                                fs.unlink(`stringData/${file.filename}`, (err => {
                                    if (err) console.log(err)
                                }))
                            }
                        })
                    })
                } else if (file.fieldname === 'audioRecording') {
                    // convert audio blob to mp3
                    ffmpeg(file.path)
                        .output(`audio/mp3/${file.filename}.mp3`)
                        .on('end', () => {
                            // upload mp3 to s3 bucket
                            fs.readFile(`audio/mp3/${file.filename}.mp3`, function (err, data) {
                                if (!err) {
                                    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                                    const date = Date.now().toString()
                                    const fileName = `post-audio-recording-${accountId}-${name}-${date}.mp3`
                                    s3.putObject({
                                        Bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                                        ACL: 'public-read',
                                        Key: fileName,
                                        Body: data,
                                        Metadata: { mimetype: file.mimetype }
                                    }, (err) => {
                                        if (err) console.log(err)
                                        else {
                                            resolve({
                                                fieldname: file.fieldname,
                                                beadIndex: +file.originalname,
                                                location: `${baseUrl}post-audio${s3Url}/${fileName}`
                                            })
                                            console.log('delete files!!!!!!!')
                                            fs.unlink(`stringData/${file.filename}`, (err => {
                                                if (err) console.log(err)
                                            }))
                                            fs.unlink(`audio/mp3/${file.filename}.mp3`, (err => {
                                                if (err) console.log(err)
                                            }))
                                        }
                                    })
                                }
                            })
                        })
                        .run()
                } else if (file.fieldname === 'image') {
                    fs.readFile(`stringData/${file.filename}`, function (err, data) {
                        s3.putObject({
                            Bucket: `weco-${process.env.NODE_ENV}-post-images`,
                            ACL: 'public-read',
                            Key: file.filename,
                            Body: data,
                            Metadata: { mimetype: file.mimetype }
                        }, (err, response) => {
                            if (err) console.log(err)
                            else {
                                const indexes = file.originalname.split('-')
                                resolve({
                                    fieldname: file.fieldname,
                                    beadIndex: +indexes[0],
                                    imageIndex: +indexes[1],
                                    location: `${baseUrl}post-images${s3Url}/${file.filename}`
                                })
                                fs.unlink(`stringData/${file.filename}`, (err => {
                                    if (err) console.log(err)
                                }))
                            }
                        })
                    })
                } else resolve(null)
            }))).then((data) => {
                createPost(JSON.parse(body.postData), data, null, JSON.parse(body.stringData))
            })
        })
    } else {
        createPost(req.body)
    }
})

router.post('/create-next-weave-bead', authenticateToken, (req, res) => {
    const accountId = req.user.id
    const { uploadType } = req.query
    const audioMBLimit = 5
    const imageMBLimit = 2

    function createBead(beadData, files, imageData) {
        const {
            postId,
            beadIndex,
            type,
            text,
            url,
            urlData,
        } = beadData

        Post.create({
            type: `string-${type}`,
            state: 'visible',
            creatorId: accountId,
            text,
            url: type === 'audio' ? files[0].location : url,
            urlImage: urlData ? urlData.image : null,
            urlDomain: urlData ? urlData.domain : null,
            urlTitle: urlData ? urlData.title : null,
            urlDescription: urlData ? urlData.description : null,
        }).then(async post => {
            const createImages = (type === 'image')
                ? Promise.all(imageData.map((image, index) => PostImage.create({
                    postId: post.id,
                    creatorId: accountId,
                    index,
                    url: image.url || files.find((file) => file.index === index).location,
                    caption: image.caption,
                })))
                : null

            const createStringLink = Link.create({
                state: 'visible',
                type: 'string-post',
                index: beadIndex,
                creatorId: accountId,
                itemAId: postId,
                itemBId: post.id,
            })

            Promise
                .all([createImages, createStringLink])
                .then((data) => res.status(200).json({ bead: post, imageData: data[0], linkData: data[1] }))
                .catch((error) => console.log(error))
        })

    }

    if (uploadType === 'image-post') {
        multer({
            limits: { fileSize: imageMBLimit * 1024 * 1024 },
            storage: multerS3({
                s3: s3,
                bucket: `weco-${process.env.NODE_ENV}-post-images`,
                acl: 'public-read',
                metadata: function (req, file, cb) {
                    cb(null, { mimetype: file.mimetype })
                },
                key: function (req, file, cb) {
                    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                    const date = Date.now().toString()
                    const fileName = `post-image-upload-${accountId}-${name}-${date}`
                    cb(null, fileName)
                }
            })
        }).any('file')(req, res, (error) => {
            const { files, body } = req
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                createBead(
                    JSON.parse(body.beadData),
                    files.map((file) => { return { location: file.location, index: Number(file.originalname) } }),
                    JSON.parse(body.imageData)
                )
            }
        })
    } else if (uploadType === 'audio-file') {
        multer({
            limits: { fileSize: audioMBLimit * 1024 * 1024 },
            storage: multerS3({
                s3: s3,
                bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                acl: 'public-read',
                metadata: function (req, file, cb) {
                    cb(null, { mimetype: file.mimetype })
                },
                key: function (req, file, cb) {
                    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                    const date = Date.now().toString()
                    const fileName = `post-audio-upload-${accountId}-${name}-${date}.mp3`
                    console.log('fileName: ', fileName)
                    cb(null, fileName)
                }
            })
        }).single('file')(req, res, (error) => {
            const { file, body } = req
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                if (file) createBead(JSON.parse(body.beadData), [file])
                else res.status(500).json({ message: 'Failed', error })
            }
        })
    } else if (uploadType === 'audio-blob') {
        multer({
            fileFilter: (req, file, cb) => {
                if (file.mimetype === 'audio/mpeg-3') cb(null, true)
                else {
                    cb(null, false)
                    cb(new Error('Only audio/mpeg-3 files allowed'))
                }
            },
            limits: { fileSize: audioMBLimit * 1024 * 1024 },
            dest: './audio/raw',
        }).single('file')(req, res, (error) => {
            const { file, body } = req
            // handle errors
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE') res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                // convert raw audio to mp3
                ffmpeg(file.path)
                    .output(`audio/mp3/${file.filename}.mp3`)
                    .on('end', function() {
                        // upload new mp3 file to s3 bucket
                        fs.readFile(`audio/mp3/${file.filename}.mp3`, function (err, data) {
                            if (!err) {
                                const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                                const date = Date.now().toString()
                                const fileName = `post-audio-recording-${accountId}-${name}-${date}.mp3`
                                console.log('fileName: ', fileName)
                                s3.putObject({
                                    Bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                                    ACL: 'public-read',
                                    Key: fileName,
                                    Body: data,
                                    Metadata: { mimetype: file.mimetype }
                                }, (err) => {
                                    if (err) console.log(err)
                                    else {
                                        // delete old files
                                        fs.unlink(`audio/raw/${file.filename}`, (err => {
                                            if (err) console.log(err)
                                        }))
                                        fs.unlink(`audio/mp3/${file.filename}.mp3`, (err => {
                                            if (err) console.log(err)
                                        }))
                                        // create post
                                        createBead(
                                            JSON.parse(body.beadData),
                                            [{ location: `https://weco-${process.env.NODE_ENV}-post-audio.s3.eu-west-1.amazonaws.com/${fileName}` }]
                                        )
                                    }
                                })
                            }
                        })
                    })
                    .run()
            }
        })
    } else createBead(req.body)
})

router.post('/repost-post', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { accountHandle, accountName, postId, spaceId, selectedSpaceIds } = req.body

    const post = await Post.findOne({
        where: { id: postId },
        attributes: [],
        include: [{ 
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'email']
        }]
    })

    const sendNotification = await Notification.create({
        ownerId: post.Creator.id,
        type: 'post-repost',
        seen: false,
        holonAId: spaceId,
        userId: accountId,
        postId,
    })

    const sendEmail = await sgMail.send({
        to: post.Creator.email,
        from: {
            email: 'admin@weco.io',
            name: 'we { collective }'
        },
        subject: 'New notification',
        text: `
            Hi ${post.Creator.name}, ${accountName} just reposted your post on weco:
            http://${config.appURL}/p/${postId}
        `,
        html: `
            <p>
                Hi ${post.Creator.name},
                <br/>
                <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                just reposted your
                <a href='${config.appURL}/p/${postId}'>post</a>
                on weco
            </p>
        `,
    })

    const createReactions = Promise.all(selectedSpaceIds.map((id) => Reaction.create({
        type: 'repost',
        state: 'active',
        holonId: id,
        userId: accountId,
        postId: postId
    })))

    const createDirectRelationships = Promise.all(selectedSpaceIds.map((id) => PostHolon.create({
        type: 'repost',
        relationship: 'direct',
        creatorId: accountId,
        postId: postId,
        holonId: id
    })))

    const indirectSpaceIds = await new Promise((resolve, reject) => {
        Promise.all(selectedSpaceIds.map((id) => Holon.findOne({
            where: { id, state: 'active' },
            attributes: [],
            include: [{
                model: Holon,
                as: 'HolonHandles',
                attributes: ['id'],
                through: { where: { state: 'open' }, attributes: [] }
            }]
        }))).then((spaces) => {
            const ids = []
            spaces.forEach((space) => ids.push(...space.HolonHandles.map(holon => holon.id)))
            const filteredIds = [...new Set(ids)].filter(id => !selectedSpaceIds.includes(id))
            resolve(filteredIds)
        })
    })

    const createIndirectRelationships = Promise.all(indirectSpaceIds.map((id) => {
            return new Promise((resolve, reject) => {
                PostHolon
                    .findOne({ where: { postId, holonId: id } })
                    .then(postHolon => {
                        if (!postHolon) {
                            PostHolon
                                .create({
                                    type: 'repost',
                                    relationship: 'indirect',
                                    // state: 'active',
                                    creatorId: accountId,
                                    postId: postId,
                                    holonId: id
                                })
                                .then(() => resolve(id))
                                
                        }
                        else resolve()
                    })
            })
    }))

    Promise
        .all([
            sendNotification,
            sendEmail,
            createReactions,
            createDirectRelationships,
            createIndirectRelationships
        ])
        .then((data) => res.status(200).json({ message: 'Success', indirectRelationships: data[4] }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/add-like', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { accountHandle, accountName, postId, holonId } = req.body

    const post = await Post.findOne({
        where: { id: postId },
        attributes: [],
        include: [{ 
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'email']
        }]
    })

    const createReaction = await Reaction.create({ 
        type: 'like',
        value: null,
        state: 'active',
        holonId,
        userId: accountId,
        postId,
        commentId: null,
    })

    const createNotification = await Notification.create({
        ownerId: post.Creator.id,
        type: 'post-like',
        seen: false,
        holonAId: holonId,
        userId: accountId,
        postId,
        commentId: null
    })

    const sendEmail = await sgMail.send({
        to: post.Creator.email,
        from: {
            email: 'admin@weco.io',
            name: 'we { collective }'
        },
        subject: 'New notification',
        text: `
            Hi ${post.Creator.name}, ${accountName} just liked your post on weco:
            http://${config.appURL}/p/${postId}
        `,
        html: `
            <p>
                Hi ${post.Creator.name},
                <br/>
                <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                just liked your
                <a href='${config.appURL}/p/${postId}'>post</a>
                on weco
            </p>
        `,
    })

    Promise
        .all([createReaction, createNotification, sendEmail])
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/remove-like', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { postId } = req.body
    Reaction
        .update({ state: 'removed' }, { where: { 
            type: 'like',
            state: 'active',
            postId,
            userId: accountId
        }})
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/add-rating', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { accountHandle, accountName, postId, spaceId, newRating } = req.body

    const post = await Post.findOne({
        where: { id: postId },
        attributes: [],
        include: [{ 
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'email']
        }]
    })

    const createReaction = await Reaction.create({ 
        type: 'rating',
        value: newRating,
        state: 'active',
        holonId: spaceId,
        userId: accountId,
        postId,
    })

    const sendNotification = await Notification.create({
        ownerId: post.Creator.id,
        type: 'post-rating',
        seen: false,
        holonAId: spaceId,
        userId: accountId,
        postId,
    })

    const sendEmail = await sgMail.send({
        to: post.Creator.email,
        from: {
            email: 'admin@weco.io',
            name: 'we { collective }'
        },
        subject: 'New notification',
        text: `
            Hi ${post.Creator.name}, ${accountName} just rated your post on weco:
            http://${config.appURL}/p/${postId}
        `,
        html: `
            <p>
                Hi ${post.Creator.name},
                <br/>
                <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                just rated your
                <a href='${config.appURL}/p/${postId}'>post</a>
                on weco
            </p>
        `,
    })

    Promise
        .all([createReaction, sendNotification, sendEmail])
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/remove-rating', authenticateToken, (req, res) => {
    const accountId = req.user.id
    const { postId, spaceId } = req.body
    Reaction
        .update({ state: 'removed' }, {
            where: { 
                type: 'rating',
                state: 'active',
                userId: accountId,
                postId
            }
        })
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/add-link', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { accountHandle, accountName, spaceId, description, itemAId, itemBId } = req.body

    const itemB = await Post.findOne({ where: { id: itemBId } })
    if (!itemB) res.status(404).send({ message: 'Item B not found' })
    else {
        const itemA = await Post.findOne({
            where: { id: itemAId },
            attributes: [],
            include: [{ 
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email']
            }]
        })

        const createLink = await Link.create({
            state: 'visible',
            type: 'post-post',
            creatorId: accountId,
            description,
            itemAId,
            itemBId
        })

        // todo: also send notification to itemB owner, and include itemB info in email
        const sendNotification = await Notification.create({
            ownerId: itemA.Creator.id,
            type: 'post-link',
            seen: false,
            holonAId: spaceId,
            userId: accountId,
            postId: itemAId,
        })

        const sendEmail = await sgMail.send({
            to: itemA.Creator.email,
            from: {
                email: 'admin@weco.io',
                name: 'we { collective }'
            },
            subject: 'New notification',
            text: `
                Hi ${itemA.Creator.name}, ${accountName} just linked your post to another post on weco:
                http://${config.appURL}/p/${itemAId}
            `,
            html: `
                <p>
                    Hi ${itemA.Creator.name},
                    <br/>
                    <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                    just linked your
                    <a href='${config.appURL}/p/${itemAId}'>post</a>
                    to another post on weco
                </p>
            `,
        })
            
        Promise
            .all([createLink, sendNotification, sendEmail])
            .then((data) => res.status(200).json({ link: data[0], message: 'Success' }))
            .catch(() => res.status(500).json({ message: 'Error' }))
    }
})

router.post('/remove-link', authenticateToken, (req, res) => {
    const accountId = req.user.id
    let { linkId } = req.body
    Link.update({ state: 'hidden' }, { where: { id: linkId } })
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/submit-comment', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { text, postId, parentCommentId, spaceId, accountHandle, accountName } = req.body

    // find post owner
    const post = await Post.findOne({
        where: { id: postId },
        attributes: [],
        include: [{ 
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'email']
        }]
    })
    // create comment
    Comment.create({
        state: 'visible',
        creatorId: accountId,
        holonId: spaceId,
        postId,
        parentCommentId,
        text
    }).then(async comment => {
        if (parentCommentId) {
            // find parent comment owner
            const parentComment = await Comment.findOne({
                where: { id: parentCommentId },
                attributes: [],
                include: [{ 
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'flagImagePath', 'email']
                }]
            })
            // create notfication for parent comment owner
            Notification.create({
                ownerId: parentComment.Creator.id,
                type: 'comment-reply',
                seen: false,
                holonAId: spaceId,
                userId: accountId,
                postId,
                commentId: comment.id
            })
            // send email to parent comment owner
            sgMail.send({
                to: parentComment.Creator.email,
                from: {
                    email: 'admin@weco.io',
                    name: 'we { collective }'
                },
                subject: 'New notification',
                text: `
                    Hi ${parentComment.Creator.name}, ${accountName} just replied to your comment on weco:
                    http://${config.appURL}/p/${postId}
                `,
                html: `
                    <p>
                        Hi ${parentComment.Creator.name},
                        <br/>
                        <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                        just replied to your
                        <a href='${config.appURL}/p/${postId}'>comment</a>
                        on weco
                    </p>
                `,
            })
        }
        // create notificaton for post owner
        Notification.create({
            ownerId: post.Creator.id,
            type: 'post-comment',
            seen: false,
            holonAId: spaceId,
            userId: accountId,
            postId,
            commentId: comment.id
        })
        // send email to post owner
        sgMail.send({
            to: post.Creator.email,
            from: {
                email: 'admin@weco.io',
                name: 'we { collective }'
            },
            subject: 'New notification',
            text: `
                Hi ${post.Creator.name}, ${accountName} just commented on your post on weco:
                http://${config.appURL}/p/${postId}
            `,
            html: `
                <p>
                    Hi ${post.Creator.name},
                    <br/>
                    <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                    just commented on your
                    <a href='${config.appURL}/p/${postId}'>post</a>
                    on weco
                </p>
            `,
        })
        .then(() => res.status(200).json(comment))
        .catch(() => res.status(500).json({ message: 'Error' }))
    })
})

router.post('/respond-to-event', authenticateToken, (req, res) => {
    const accountId = req.user.id
    const { userName, userEmail, postId, eventId, startTime, response } = req.body

    // check for matching user events
    UserEvent.findOne({
        where: {
            userId: accountId,
            eventId,
            relationship: response,
            state: 'active',
        },
        attributes: ['id']
    }).then((userEvent) => {
        if (userEvent) {
            // if matching event, remove event
            UserEvent
                .update({ state: 'removed' }, { where: { id: userEvent.id } })
                .then(() => res.status(200).send({ message: 'UserEvent removed' }))
        } else {
            // else remove other responses to event if present
            UserEvent
                .update({ state: 'removed' }, { where: {
                    userId: accountId,
                    eventId,
                    relationship: response === 'going' ? 'interested' : 'going',
                    state: 'active',
                }})
                .then(() => {
                    // then create new user event
                    UserEvent.create({
                        userId: accountId,
                        eventId,
                        relationship: response,
                        state: 'active',
                    }).then((userEvent) => {
                        // schedule reminder notifications
                        ScheduledTasks.scheduleNotification({
                            type: response,
                            postId,
                            eventId,
                            userEventId: userEvent.id,
                            startTime,
                            userId: accountId,
                            userName,
                            userEmail
                        })
                        res.status(200).send({ message: 'UserEvent added' })
                    })
                })
        }
    })
})

// todo: add authenticateToken to all endpoints below
router.post('/save-glass-bead-game', (req, res) => {
    const {
        gameId,
        beads
    } = req.body

    GlassBeadGame
        .update({ locked: true }, { where: { id: gameId, locked: false }})
        .then(() => {
            beads.forEach((bead) => {
                GlassBead.create({
                    gameId,
                    index: bead.index,
                    userId: bead.user.id,
                    beadUrl: bead.beadUrl,
                    state: 'visible'
                })
            })
            res.status(200).send({ message: 'Game saved' })
        })
})

router.post('/glass-bead-game-comment', (req, res) => {
    const { gameId, userId, text } = req.body
    GlassBeadGameComment.create({
        gameId,
        userId,
        text
    }).then(res.status(200).send({ message: 'Success' }))
})

router.post('/save-glass-bead-game-settings', (req, res) => {
    const {
        gameId,
        playerOrder,
        introDuration,
        numberOfTurns,
        moveDuration,
        intervalDuration,
        outroDuration,
    } = req.body

    GlassBeadGame
        .update({
            playerOrder,
            introDuration,
            numberOfTurns,
            moveDuration,
            intervalDuration,
            outroDuration,
        }, { where: { id: gameId }})
        .then(res.status(200).send({ message: 'Success' }))
        .catch(error => console.log(error))
})

router.post('/save-gbg-topic', (req, res) => {
    const {
        gameId,
        newTopic,
    } = req.body

    GlassBeadGame
        .update({ topic: newTopic, topicGroup: null }, { where: { id: gameId }})
        .then(res.status(200).send({ message: 'Success' }))
        .catch(error => console.log(error))
})

router.post('/find-spaces', (req, res) => {
    const { query, blacklist } = req.body
    Holon.findAll({
        limit: 20,
        where: {
            state: 'active',
            [Op.not]: [{ id: [0, ...blacklist] }],
            [Op.or]: [
                { handle: { [Op.like]: `%${query}%` } },
                { name: { [Op.like]: `%${query}%` } },
            ],
        },
        attributes: ['id', 'handle', 'name', 'flagImagePath'],
    })
    .then(spaces => res.send(spaces))
})

router.post('/delete-post', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { postId } = req.body

    const post = await Post.findOne({
        where: { id: postId, creatorId: accountId },
        include: [{
            model: Event,
            attributes: ['id'],
            required: false,
        }]
    })
    if (post) {
        post.update({ state: 'deleted' }).then(() => {
            if (post.Event) Event.update({ state: 'deleted' }, { where: { id: post.Event.id } })
            res.status(200).json({ message: 'Post deleted' })
        })
    }
})

router.post('/delete-comment', authenticateToken, (req, res) => {
    const accountId = req.user.id
    const { commentId } = req.body
    Comment
        .update({ state: 'deleted' }, { where: { id: commentId, creatorId: accountId } })
        .then(res.status(200).json({ message: 'Comment deleted' }))
        .catch(error => console.log(error))
})

module.exports = router

// old create post
// router.post('/create-post', authenticateToken, (req, res) => {
//     const accountId = req.user.id
//     const {
//         type,
//         subType,
//         state,
//         text,
//         url,
//         urlImage,
//         urlDomain,
//         urlTitle,
//         urlDescription,
//         topic,
//         spaceHandles,
//         // pollAnswers,
//         // numberOfPrismPlayers,
//         // prismDuration,
//         // prismPrivacy,
//         // numberOfPlotGraphAxes,
//         // axis1Left,
//         // axis1Right,
//         // axis2Top,
//         // axis2Bottom,
//         // // createPostFromTurnData,
//         // GBGTopic,
//         // GBGCustomTopic,
//     } = req.body

//     let directHandleIds = []
//     let indirectHandleIds = []

//     // todo: pull in from global constants
//     async function asyncForEach(array, callback) {
//         for (let index = 0; index < array.length; index++) {
//             await callback(array[index], index, array)
//         }
//     }

//     function findDirectHandleIds() {
//         Holon.findAll({
//             where: { handle: spaceHandles, state: 'active' },
//             attributes: ['id']
//         })
//         .then(holons => {
//             directHandleIds.push(...holons.map(holon => holon.id))
//         })
//     }

//     async function findIndirectHandleIds(handle) {
//         await Holon.findOne({
//             where: { handle: handle, state: 'active' },
//             include: [{
//                 model: Holon,
//                 as: 'HolonHandles',
//                 attributes: ['id'],
//                 through: { where: { state: 'open' }, attributes: [] }
//             }]
//         })
//         .then(holon => {
//             indirectHandleIds.push(...holon.HolonHandles.map(holon => holon.id))
//         })
//     }

//     async function findHandleIds() {
//         findDirectHandleIds()
//         await asyncForEach(spaceHandles, async(handle) => {
//             await findIndirectHandleIds(handle)
//         })
//         // remove duplicates from indirect handle ids
//         indirectHandleIds = [...new Set(indirectHandleIds)]
//         // remove ids already included in direct handle ids from indirect handle ids
//         indirectHandleIds = indirectHandleIds.filter(id => !directHandleIds.includes(id))
//     }

//     function createNewPostHolons(post) {
//         directHandleIds.forEach(id => {
//             PostHolon.create({
//                 type: 'post',
//                 relationship: 'direct',
//                 creatorId: accountId,
//                 postId: post.id,
//                 holonId: id
//             })
//         })
//         indirectHandleIds.forEach(id => {
//             PostHolon.create({
//                 type: 'post',
//                 relationship: 'indirect',
//                 creatorId: accountId,
//                 postId: post.id,
//                 holonId: id
//             })
//         })
//     }

//     // function createNewPollAnswers(post) {
//     //     pollAnswers.forEach(answer => PollAnswer.create({ text: answer, postId: post.id }))
//     // }

//     // function createPrism(post) {
//     //     Prism.create({
//     //         postId: post.id,
//     //         numberOfPlayers: numberOfPrismPlayers,
//     //         duration: prismDuration,
//     //         privacy: prismPrivacy
//     //     })
//     //     .then(prism => {
//     //         PrismUser.create({
//     //             prismId: prism.id,
//     //             userId: accountId
//     //         })
//     //     })
//     // }

//     // function createPlotGraph(post) {
//     //     PlotGraph.create({
//     //         postId: post.id,
//     //         numberOfPlotGraphAxes,
//     //         axis1Left,
//     //         axis1Right,
//     //         axis2Top,
//     //         axis2Bottom
//     //     })
//     // }

//     // function createTurnLink(post) {
//     //     Link.create({
//     //         state: 'visible',
//     //         creatorId: accountId,
//     //         type: 'post-post',
//     //         relationship: 'turn',
//     //         itemAId: createPostFromTurnData.postId,
//     //         itemBId: post.id
//     //     })
//     // }

//     function createGlassBeadGame(post) {
//         GlassBeadGame.create({
//             postId: post.id,
//             topic: topic,
//             // saved: false
//         })
//     }

//     // let renamedSubType
//     // if (subType === 'Single Choice') { renamedSubType = 'single-choice' }
//     // if (subType === 'Multiple Choice') { renamedSubType = 'multiple-choice' }
//     // if (subType === 'Weighted Choice') { renamedSubType = 'weighted-choice' }

//     // function createPost() {
//         Promise.all([findHandleIds()]).then(() => {
//             Post.create({
//                 type,
//                 subType,
//                 state,
//                 creatorId: accountId,
//                 text,
//                 url,
//                 urlImage,
//                 urlDomain,
//                 urlTitle,
//                 urlDescription,
//                 state: 'visible'
//             })
//             .then(post => {
//                 createNewPostHolons(post)
//                 // if (type === 'poll') createNewPollAnswers(post)
//                 // if (type === 'prism') createPrism(post)
//                 // if (type === 'plot-graph') createPlotGraph(post)
//                 if (type === 'glass-bead-game') createGlassBeadGame(post)
//                 // if (type === 'glass-bead' && createPostFromTurnData.postId) createTurnLink(post)
//             })
//             .then(res.send('success'))
//         })
//     // }

//     // createPost()
// })

// router.get('/post-link-data', async (req, res) => {
//     const { postId } = req.query
//     let outgoingLinks = await Link.findAll({
//         where: { state: 'visible', itemAId: postId },
//         attributes: ['id'],
//         include: [
//             { 
//                 model: User,
//                 as: 'creator',
//                 attributes: ['id', 'handle', 'name', 'flagImagePath'],
//             },
//             { 
//                 model: Post,
//                 as: 'postB',
//                 //attributes: ['handle', 'name', 'flagImagePath'],
//                 include: [
//                     { 
//                         model: User,
//                         as: 'creator',
//                         attributes: ['handle', 'name', 'flagImagePath'],
//                     }
//                 ]
//             },
//         ]
//     })

//     let incomingLinks = await Link.findAll({
//         where: { state: 'visible', itemBId: postId },
//         attributes: ['id'],
//         include: [
//             { 
//                 model: User,
//                 as: 'creator',
//                 attributes: ['id', 'handle', 'name', 'flagImagePath'],
//             },
//             { 
//                 model: Post,
//                 as: 'postA',
//                 //attributes: ['handle', 'name', 'flagImagePath'],
//                 include: [
//                     { 
//                         model: User,
//                         as: 'creator',
//                         attributes: ['handle', 'name', 'flagImagePath'],
//                     }
//                 ]
//             },
//         ]
//     })

//     let links = {
//         outgoingLinks,
//         incomingLinks
//     }
//     // .then(links => {
//     //     res.json(links)
//     // })
//     res.json(links)
// })

// router.get('/post-reaction-data', (req, res) => {
//     const { postId } = req.query
//     Post.findOne({ 
//         where: { id: postId },
//         attributes: [],
//         include: [
//             { 
//                 model: Reaction,
//                 where: { state: 'active' },
//                 attributes: ['id', 'type', 'value'],
//                 include: [
//                     {
//                         model: User,
//                         as: 'creator',
//                         attributes: ['handle', 'name', 'flagImagePath']
//                     },
//                     // TODO: potentially change Reaction includes based on reaction type to reduce unused data
//                     // (most wouldn't need holon data)
//                     {
//                         model: Holon,
//                         as: 'space',
//                         attributes: ['handle', 'name', 'flagImagePath']
//                     }
//                 ]
//             },
//             // {
//             //     model: Holon,
//             //     as: 'Reposts',
//             //     attributes: ['handle'],
//             //     through: { where: { type: 'repost', relationship: 'direct' }, attributes: ['creatorId'] },
//             // },
//         ]
//     })
//     .then(post => { res.json(post) })
//     .catch(err => console.log(err))
// })

// router.post('/cast-vote', (req, res) => {
//     const { selectedPollAnswers, postId, pollType } = req.body.voteData
//     selectedPollAnswers.forEach((answer) => {
//         let value = 1
//         if (pollType === 'weighted-choice') { value = answer.value / 100}
//         Reaction.create({ 
//             type: 'vote',
//             value: value,
//             postId: postId,
//             pollAnswerId: answer.id
//         })
//     })
// })