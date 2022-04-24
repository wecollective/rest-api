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
    PostImage
} = require('../models')

// GET
router.get('/post-data', (req, res) => {
    const { accountId, postId } = req.query
    let attributes = [
        ...postAttributes,
        [sequelize.literal(`(
            SELECT COUNT(*)
            FROM Reactions
            AS Reaction
            WHERE Reaction.postId = Post.id
            AND Reaction.userId = ${accountId}
            AND Reaction.type = 'like'
            AND Reaction.state = 'active'
            )`),'accountLike'
        ],
        [sequelize.literal(`(
            SELECT COUNT(*)
            FROM Reactions
            AS Reaction
            WHERE Reaction.postId = Post.id
            AND Reaction.userId = ${accountId}
            AND Reaction.type = 'rating'
            AND Reaction.state = 'active'
            )`),'accountRating'
        ],
        [sequelize.literal(`(
            SELECT COUNT(*)
            FROM PostHolons
            AS PostHolon
            WHERE  PostHolon.postId = Post.id
            AND PostHolon.creatorId = ${accountId}
            AND PostHolon.type = 'repost'
            AND PostHolon.relationship = 'direct'
            )`),'accountRepost'
        ],
        [sequelize.literal(`(
            SELECT COUNT(*)
            FROM Links
            AS Link
            WHERE Link.itemAId = Post.id
            AND Link.state = 'visible'
            AND Link.creatorId = ${accountId}
            )`),'accountLink'
        ]
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
            }
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
        // title, description, domain, image
        const browser = await puppeteer.launch() //{ headless: false })
        const page = await browser.newPage()
        await page.goto(url, { waitUntil: 'networkidle0' }) // load, domcontentloaded, networkidle0, networkidle2
        await page.evaluate(async() => {
            const youtubeCookieConsent = await document.querySelector('base[href="https://consent.youtube.com/"]')
            if (youtubeCookieConsent) {
                const acceptButton = await document.querySelector('button[aria-label="Agree to the use of cookies and other data for the purposes described"]')
                acceptButton.click()
                return
            } else {
                return
            }
        })
        await page.waitForSelector('title')
        const data = await page.evaluate(async() => {
            let title = await document.title
            // let title = await document.querySelector('meta[property="og:title"]')
            // if (!title) title = await document.querySelector('title').innerHTML
            // else title = title.content

            let description = await document.querySelector('meta[property="og:description"]')
            if (description) description = description.content
            // else description = await document.querySelector('p').innerHTML
            const domain = await document.querySelector('meta[property="og:site_name"]') // site_name, url
            const image = await document.querySelector('meta[property="og:image"]')
            return {
                title: title || null,
                description: description || null,
                domain: domain ? domain.content : null,
                image: image ? image.content : null
            }
        })
        res.send(data)
        await browser.close()
    } catch(e) {
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

    function createPost(postData, files, imageData) {
        const {
            type,
            text,
            title,
            startTime,
            endTime,
            url,
            urlImage,
            urlDomain,
            urlTitle,
            urlDescription,
            topic,
            topicGroup,
            topicImage,
            spaceIds,
        } = postData

        async function findIndirectSpaceIds() {
            const indirectSpaceIds = []
            // find inherited space ids for each space
            await asyncForEach(spaceIds, async(id) => {
                await Holon.findOne({
                    where: { id, state: 'active' },
                    attributes: [],
                    include: [{
                        model: Holon,
                        as: 'HolonHandles',
                        attributes: ['id'],
                        through: { where: { state: 'open' }, attributes: [] }
                    }]
                })
                .then(holon => indirectSpaceIds.push(...holon.HolonHandles.map(holon => holon.id)))
            })
            // remove duplicates and filter out direct space ids
            return [...new Set(indirectSpaceIds)].filter(id => !spaceIds.includes(id))
        }

        Post.create({
            type,
            state: 'visible',
            creatorId: accountId,
            text,
            url: type === 'Audio' ? files[0].location : url,
            urlImage,
            urlDomain,
            urlTitle,
            urlDescription,
            state: 'visible'
        }).then(async post => {
            // create direct post-space relationships
            spaceIds.forEach(id => {
                PostHolon.create({
                    type: 'post',
                    relationship: 'direct',
                    creatorId: accountId,
                    postId: post.id,
                    holonId: id
                })
            })
            // create indirect post-space relationships
            const indirectSpaceIds = await findIndirectSpaceIds()
            indirectSpaceIds.forEach(id => {
                PostHolon.create({
                    type: 'post',
                    relationship: 'indirect',
                    creatorId: accountId,
                    postId: post.id,
                    holonId: id
                })
            })
            // create event if required
            const createEvent = (type === 'event' || (type === 'glass-bead-game' && startTime))
                ? await Event.create({
                    postId: post.id,
                    state: 'active',
                    title,
                    startTime,
                    endTime,
                })
                : null
            // create glass bead game if required
            const createGBG = (type === 'glass-bead-game')
                ? GlassBeadGame.create({
                    postId: post.id,
                    topic,
                    topicGroup,
                    topicImage,
                    locked: false,
                })
                : null
            // create images if required
            const createImages = (type === 'image')
                ? await asyncForEach(imageData, (image, index) => {
                    PostImage.create({
                        postId: post.id,
                        creatorId: accountId,
                        index,
                        url: image.url || files.find((file) => file.index === index).location,
                        caption: image.caption,
                    })
                })
                : null

            Promise.all([createEvent, createGBG, createImages]).then((data) => {
                res.status(200).json({ post, event: data[0], data })
            })
        })
    }
    
    if (uploadType === 'image-files') {
        console.log('image file upload')
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
                    console.log('fileName: ', fileName)
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
                if (files.length)
                    createPost(
                        JSON.parse(body.postData),
                        files.map((file) => { return { location: file.location, index: Number(file.originalname) } }),
                        JSON.parse(body.imageData)
                    )
                else res.status(500).json({ message: 'Failed', error: err })
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
                else res.status(500).json({ message: 'Failed', error: err })
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
                                        createPost(JSON.parse(body.postData), [{ location: `https://${bucket}.s3.eu-west-1.amazonaws.com/${fileName}` }])
                                    }
                                })
                            }
                        })
                    })
                    .run()
            }
        })
    } else {
        createPost(req.body)
    }
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

    const createReactionsAndPostSpaceRelationships = await Holon.findAll({
        where: { id: selectedSpaceIds },
        attributes: ['id'],
        include: [{
            model: Holon,
            as: 'HolonHandles', // SpaceIds or SpaceDNA
            attributes: ['id'],
            through: { attributes: [] }
        }]
    }).then(spaces => {
        spaces.forEach((space) => {
            Reaction.create({
                type: 'repost',
                state: 'active',
                holonId: space.id,
                userId: accountId,
                postId: postId
            })
            PostHolon.create({
                type: 'repost',
                relationship: 'direct',
                creatorId: accountId,
                postId: postId,
                holonId: space.id
            })
            // loop through SpaceIds ('HolonHandles' for now) to create indirect post spaces ('PostSpaceRelationships' ?)
            space.HolonHandles.map(item => item.id).forEach(spaceId => {
                if (spaceId !== space.id) {
                    // todo: check for 'active' state when set up in db
                    PostHolon
                        .findOne({ where: { postId: postId, holonId: spaceId } })
                        .then(postHolon => {
                            if (!postHolon) {
                                PostHolon.create({
                                    type: 'repost',
                                    relationship: 'indirect',
                                    // state: 'active',
                                    creatorId: accountId,
                                    postId: postId,
                                    holonId: spaceId
                                })
                            }
                        })
                }
            })
        })
    })

    Promise
        .all([sendNotification, sendEmail, createReactionsAndPostSpaceRelationships])
        .then(() => res.status(200).json({ message: 'Success' }))
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

router.post('/viable-post-spaces', (req, res) => {
    const { query, blacklist } = req.body
    Holon.findAll({
        limit: 20,
        where: {
            state: 'active',
            [Op.not]: [{ id: blacklist }],
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