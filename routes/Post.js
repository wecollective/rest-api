require('dotenv').config()
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
    region: 'eu-west-1',
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
    Weave,
    UserPost,
    Inquiry,
    InquiryAnswer,
} = require('../models')

// GET
router.get('/post-data', (req, res) => {
    const { accountId, postId } = req.query
    let attributes = [
        ...postAttributes,
        [
            sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Reactions
            AS Reaction
            WHERE Reaction.postId = Post.id
            AND Reaction.userId = ${accountId}
            AND Reaction.type = 'like'
            AND Reaction.state = 'active'
            )`),
            'accountLike',
        ],
        [
            sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Reactions
            AS Reaction
            WHERE Reaction.postId = Post.id
            AND Reaction.userId = ${accountId}
            AND Reaction.type = 'rating'
            AND Reaction.state = 'active'
            )`),
            'accountRating',
        ],
        [
            sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM PostHolons
            AS PostHolon
            WHERE  PostHolon.postId = Post.id
            AND PostHolon.creatorId = ${accountId}
            AND PostHolon.type = 'repost'
            AND PostHolon.relationship = 'direct'
            )`),
            'accountRepost',
        ],
        [
            sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Links
            AS Link
            WHERE Link.state = 'visible'
            AND Link.type != 'string-post'
            AND Link.creatorId = ${accountId}
            AND (Link.itemAId = Post.id OR Link.itemBId = Post.id)
            )`),
            'accountLink',
        ],
    ]
    Post.findOne({
        where: { id: postId },
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
                attributes: ['id', 'handle', 'name', 'state', 'flagImagePath'],
                through: { where: { relationship: 'direct' }, attributes: ['type'] },
            },
            {
                model: Holon,
                as: 'IndirectSpaces',
                attributes: ['id', 'handle', 'name', 'state', 'flagImagePath'],
                through: { where: { relationship: 'indirect' }, attributes: ['type'] },
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
                    },
                ],
            },
            {
                model: Inquiry,
                required: false,
                include: [
                    {
                        model: InquiryAnswer,
                        required: false,
                        attributes: [
                            'id',
                            'text',
                            'createdAt',
                            // [
                            //     sequelize.literal(`(
                            // SELECT COUNT(*)
                            // FROM Reactions
                            // AS Reaction
                            // WHERE Reaction.state = 'active'
                            // AND Reaction.inquiryAnswerId = InquiryAnswer.id
                            // )`),
                            //     'totalVotes',
                            // ],
                        ],
                        include: [
                            {
                                model: User,
                                as: 'Creator',
                                attributes: ['handle', 'name', 'flagImagePath'],
                            },
                            {
                                model: Reaction,
                                attributes: [
                                    'value',
                                    'state',
                                    'inquiryAnswerId',
                                    'createdAt',
                                    'updatedAt',
                                ],
                                required: false,
                                include: [
                                    {
                                        model: User,
                                        as: 'Creator',
                                        attributes: ['id', 'handle', 'name', 'flagImagePath'],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                model: GlassBeadGame,
                attributes: ['topic', 'topicGroup', 'topicImage'],
                include: [
                    {
                        model: GlassBead,
                        where: { state: 'visible' },
                        required: false,
                        include: [
                            {
                                model: User,
                                as: 'user',
                                attributes: ['handle', 'name', 'flagImagePath'],
                            },
                        ],
                    },
                ],
            },
            {
                model: Post,
                as: 'StringPosts',
                attributes: [
                    'id',
                    'type',
                    'color',
                    'text',
                    'url',
                    'urlTitle',
                    'urlImage',
                    'urlDomain',
                    'urlDescription',
                    [
                        sequelize.literal(
                            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = StringPosts.id AND Reaction.type = 'like' AND Reaction.state = 'active')`
                        ),
                        'totalLikes',
                    ],
                    [
                        sequelize.literal(
                            `(SELECT COUNT(*) FROM Comments AS Comment WHERE Comment.state = 'visible' AND Comment.postId = StringPosts.id)`
                        ),
                        'totalComments',
                    ],
                    [
                        sequelize.literal(
                            `(SELECT COUNT(*) FROM Links AS Link WHERE Link.state = 'visible' AND Link.type != 'string-post' AND (Link.itemAId = StringPosts.id OR Link.itemBId = StringPosts.id))`
                        ),
                        'totalLinks',
                    ],
                    [
                        sequelize.literal(`(
                        SELECT COUNT(*) > 0
                        FROM Reactions
                        AS Reaction
                        WHERE Reaction.postId = StringPosts.id
                        AND Reaction.userId = ${accountId}
                        AND Reaction.type = 'like'
                        AND Reaction.state = 'active'
                        )`),
                        'accountLike',
                    ],
                    // todo: add account comment when set up
                    [
                        sequelize.literal(`(
                        SELECT COUNT(*) > 0
                        FROM Links
                        AS Link
                        WHERE Link.state = 'visible'
                        AND Link.type != 'string-post'
                        AND Link.creatorId = ${accountId}
                        AND (Link.itemAId = StringPosts.id OR Link.itemBId = StringPosts.id)
                        )`),
                        'accountLink',
                    ],
                ],
                through: {
                    where: { state: 'visible', type: 'string-post' },
                    attributes: ['index', 'relationship'],
                },
                required: false,
                include: [
                    {
                        model: User,
                        as: 'Creator',
                        attributes: ['handle', 'name', 'flagImagePath'],
                    },
                    {
                        model: PostImage,
                        required: false,
                        attributes: ['caption', 'createdAt', 'id', 'index', 'url'],
                    },
                ],
            },
            {
                model: Weave,
                attributes: [
                    'numberOfMoves',
                    'numberOfTurns',
                    'allowedBeadTypes',
                    'moveTimeWindow',
                    'nextMoveDeadline',
                    'audioTimeLimit',
                    'characterLimit',
                    'state',
                    'privacy',
                ],
                required: false,
            },
            {
                model: User,
                as: 'StringPlayers',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
                through: { where: { type: 'weave' }, attributes: ['index', 'state', 'color'] },
                required: false,
            },
        ],
    })
        .then((post) => {
            if (!post) res.status(404).json({ message: 'Post not found' })
            else if (post.state === 'deleted') res.status(401).json({ message: 'Post deleted' })
            else {
                post.DirectSpaces.forEach((space) => {
                    space.setDataValue('type', space.dataValues.PostHolon.type)
                    delete space.dataValues.PostHolon
                })
                post.IndirectSpaces.forEach((space) => {
                    space.setDataValue('type', space.dataValues.PostHolon.type)
                    delete space.dataValues.PostHolon
                })
                // convert SQL numeric booleans to JS booleans
                post.setDataValue('accountLike', !!post.dataValues.accountLike)
                post.setDataValue('accountRating', !!post.dataValues.accountRating)
                post.setDataValue('accountRepost', !!post.dataValues.accountRepost)
                post.setDataValue('accountLink', !!post.dataValues.accountLink)
                res.json(post)
            }
        })
        .catch((err) => console.log(err))
})

router.get('/post-likes', async (req, res) => {
    const { postId } = req.query

    Reaction.findAll({
        where: { postId, type: 'like', state: 'active' },
        attributes: ['id'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
    })
        .then((likes) => res.status(200).json(likes))
        .catch((error) => console.log(error))
})

router.get('/post-reposts', async (req, res) => {
    const { postId } = req.query

    Reaction.findAll({
        where: { postId, type: 'repost', state: 'active' },
        attributes: ['id'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
            {
                model: Holon,
                as: 'Space',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
    })
        .then((likes) => res.status(200).json(likes))
        .catch((error) => console.log(error))
})

router.get('/post-ratings', async (req, res) => {
    const { postId } = req.query

    Reaction.findAll({
        where: { postId, type: 'rating', state: 'active' },
        attributes: ['id', 'value'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
    })
        .then((likes) => res.status(200).json(likes))
        .catch((error) => console.log(error))
})

router.get('/post-links', async (req, res) => {
    const { postId } = req.query

    Post.findOne({
        where: { id: postId },
        attributes: [],
        include: [
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
                            },
                        ],
                    },
                ],
            },
            {
                model: Link,
                as: 'IncomingLinks',
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
                        as: 'PostA',
                        attributes: ['id'],
                        include: [
                            {
                                model: User,
                                as: 'Creator',
                                attributes: ['handle', 'name', 'flagImagePath'],
                            },
                        ],
                    },
                ],
            },
        ],
    })
        .then((post) => res.status(200).json(post))
        .catch((error) => console.log(error))
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
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
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
                        attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    },
                ],
            },
        ],
    })
        .then((comments) => {
            res.json(comments)
        })
        .catch((err) => console.log(err))
})

router.get('/poll-votes', (req, res) => {
    Reaction.findAll({
        where: { type: 'inquiry-vote', state: 'active', postId: req.query.postId },
        attributes: ['inquiryAnswerId', 'value', 'createdAt'],
    })
        .then((labels) => {
            labels.forEach((label) => {
                label.setDataValue('parsedCreatedAt', Date.parse(label.createdAt))
                delete label.dataValues.createdAt
            })
            return labels
        })
        .then((labels) => {
            res.json(labels)
        })
})

router.get('/prism-data', (req, res) => {
    const { postId } = req.query
    Prism.findOne({
        where: { postId: postId },
        include: [
            {
                model: User,
                attributes: ['handle', 'name', 'flagImagePath'],
                through: { attributes: [] },
            },
        ],
    })
        .then((prism) => {
            res.json(prism)
        })
        .catch((err) => console.log(err))
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
        .then((plotGraph) => {
            res.json(plotGraph)
        })
        .catch((err) => console.log(err))
})

router.get('/scrape-url', async (req, res) => {
    const { url } = req.query

    const browser = await puppeteer.launch() // { headless: false })
    try {
        const page = await browser.newPage()
        await page.goto(url, { waitUntil: 'domcontentloaded' }) // { timeout: 60000 }, { waitUntil: 'load', 'domcontentloaded', 'networkidle0', 'networkidle2' }
        await page.evaluate(async () => {
            const youtubeCookieConsent = await document.querySelector(
                'base[href="https://consent.youtube.com/"]'
            )
            if (youtubeCookieConsent) {
                const rejectButton = await document.querySelector('button[aria-label="Reject all"]')
                rejectButton.click()
                return
            } else {
                return
            }
        })
        await page.waitForSelector('title')
        const urlData = await page.evaluate(async () => {
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
    } catch (e) {
        console.log('error: ', e)
        res.send({
            title: null,
            description: null,
            domain: null,
            image: null,
        })
    } finally {
        await browser.close()
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
            'locked',
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
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['handle', 'name', 'flagImagePath'],
                    },
                ],
            },
            {
                model: GlassBeadGameComment,
                required: false,
                include: [
                    {
                        model: User,
                        required: false,
                        as: 'user',
                        attributes: ['handle', 'name', 'flagImagePath'],
                    },
                ],
            },
        ],
    })
        .then((post) => res.json(post))
        .catch((err) => console.log(err))
})

// POST
router.post('/create-post', authenticateToken, (req, res) => {
    const accountId = req.user.id
    const { uploadType } = req.query
    const audioMBLimit = 5
    const imageMBLimit = 2

    function createPost(postData, files, imageData, stringData) {
        const {
            creatorName,
            creatorHandle,
            type,
            spaceIds,
            mentions,
            text,
            url,
            // urls
            urlImage,
            urlDomain,
            urlTitle,
            urlDescription,
            // events
            title,
            startTime,
            endTime,
            // inquiries
            inquiryTitle,
            inquiryEndTime,
            answersLocked,
            inquiryType,
            inquiryAnswers,
            // glass bead games
            topic,
            topicGroup,
            topicImage,
            // weaves
            privacy,
            playerData,
            numberOfMoves,
            numberOfTurns,
            allowedBeadTypes,
            characterLimit,
            audioTimeLimit,
            moveTimeWindow,
            // strings and weaves
            sourcePostId,
            sourceCreatorId,
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
        }).then(async (post) => {
            const indirectSpaceIds = await new Promise((resolve) => {
                Holon.findAll({
                    where: { id: spaceIds, state: 'active' },
                    attributes: [],
                    include: [
                        {
                            model: Holon,
                            as: 'HolonHandles',
                            attributes: ['id'],
                            through: { where: { state: 'open' }, attributes: [] },
                        },
                    ],
                })
                    .then((spaces) => {
                        // todo: include space handles and flag images
                        const ids = []
                        spaces.forEach((space) =>
                            ids.push(...space.HolonHandles.map((holon) => holon.id))
                        )
                        const filteredIds = [...new Set(ids)].filter((id) => !spaceIds.includes(id))
                        resolve(filteredIds)
                    })
                    .catch(() => resolve([]))
            })

            const createDirectRelationships = await Promise.all(
                spaceIds.map((id) =>
                    PostHolon.create({
                        type: 'post',
                        relationship: 'direct',
                        creatorId: accountId,
                        postId: post.id,
                        holonId: id,
                    })
                )
            )

            const createIndirectRelationships = await Promise.all(
                indirectSpaceIds.map((id) =>
                    PostHolon.create({
                        type: 'post',
                        relationship: 'indirect',
                        creatorId: accountId,
                        postId: post.id,
                        holonId: id,
                    })
                )
            )

            const notifyMentions = await new Promise((resolve) => {
                User.findAll({
                    where: { handle: mentions, state: 'active' },
                    attributes: ['id', 'name', 'email'],
                })
                    .then((users) => {
                        Promise.all(
                            users.map(
                                (user) =>
                                    new Promise(async (reso) => {
                                        const sendNotification = await Notification.create({
                                            ownerId: user.id,
                                            type: 'post-mention',
                                            seen: false,
                                            userId: accountId,
                                            postId: post.id,
                                        })

                                        const sendEmail = await sgMail.send({
                                            to: user.email,
                                            from: {
                                                email: 'admin@weco.io',
                                                name: 'we { collective }',
                                            },
                                            subject: 'New notification',
                                            text: `
                                                Hi ${user.name}, ${creatorName} just mentioned you in a post on weco:
                                                http://${config.appURL}/p/${post.id}
                                            `,
                                            html: `
                                                <p>
                                                    Hi ${user.name},
                                                    <br/>
                                                    <a href='${config.appURL}/u/${creatorHandle}'>${creatorName}</a>
                                                    just mentioned you in a 
                                                    <a href='${config.appURL}/p/${post.id}'>post</a>
                                                    on weco
                                                </p>
                                            `,
                                        })

                                        Promise.all([sendNotification, sendEmail])
                                            .then(() => reso())
                                            .catch((error) => reso(error))
                                    })
                            )
                        )
                            .then((data) => resolve(data))
                            .catch((error) => resolve(data, error))
                    })
                    .catch((error) => resolve(error))
            })

            const createEvent =
                type === 'event' || (type === 'glass-bead-game' && startTime)
                    ? await Event.create({
                          postId: post.id,
                          state: 'active',
                          title,
                          startTime,
                          endTime,
                      })
                    : null

            const createInquiry =
                type === 'inquiry'
                    ? await new Promise(async (resolve) => {
                          Inquiry.create({
                              postId: post.id,
                              type: inquiryType,
                              title: inquiryTitle,
                              answersLocked,
                              endTime: inquiryEndTime || null,
                          }).then((inquiry) => {
                              const answers = JSON.parse(inquiryAnswers)
                              Promise.all(
                                  answers.map((answer) =>
                                      InquiryAnswer.create({
                                          inquiryId: inquiry.id,
                                          creatorId: accountId,
                                          text: answer.text,
                                      })
                                  )
                              ).then((data) => resolve(data))
                          })
                      })
                    : null

            const createGBG =
                type === 'glass-bead-game'
                    ? await GlassBeadGame.create({
                          postId: post.id,
                          topic,
                          topicGroup,
                          topicImage,
                          locked: false,
                      })
                    : null

            const createImages =
                type === 'image'
                    ? await Promise.all(
                          imageData.map((image, index) =>
                              PostImage.create({
                                  postId: post.id,
                                  creatorId: accountId,
                                  index,
                                  url:
                                      image.url ||
                                      files.find((file) => file.index === index).location,
                                  caption: image.caption,
                              })
                          )
                      )
                    : null

            const createStringPosts =
                type === 'string'
                    ? await new Promise(async (resolve) => {
                          const linkSourceBead = sourcePostId
                              ? await Link.create({
                                    state: 'visible',
                                    type: 'string-post',
                                    index: 0,
                                    relationship: 'source',
                                    creatorId: accountId,
                                    itemAId: post.id,
                                    itemBId: sourcePostId,
                                })
                              : null
                          const notifySourcePlayer =
                              sourcePostId && sourceCreatorId !== accountId
                                  ? await new Promise(async (Resolve) => {
                                        const sourceCreator = await User.findOne({
                                            where: { id: sourceCreatorId },
                                            attributes: ['name', 'email'],
                                        })
                                        const notifyCreator = await Notification.create({
                                            type: 'new-string-from-your-post',
                                            ownerId: sourceCreatorId,
                                            userId: accountId,
                                            postId: post.id,
                                            seen: false,
                                        })
                                        const emailCreator = await sgMail.send({
                                            to: sourceCreator.email,
                                            from: {
                                                email: 'admin@weco.io',
                                                name: 'we { collective }',
                                            },
                                            subject: 'New notification',
                                            text: `
                                                Hi ${sourceCreator.name}, ${creatorName} just created a string from your post on Weco: https://${config.appURL}/p/${post.id}
                                            `,
                                            html: `
                                                <p>
                                                    Hi ${sourceCreator.name},
                                                    <br/>
                                                    <a href='${config.appURL}/u/${creatorHandle}'>${creatorName}</a>
                                                    just created a <a href='${config.appURL}/p/${post.id}'>string</a> from your post on Weco.
                                                </p>
                                            `,
                                        })
                                        Promise.all([notifyCreator, emailCreator])
                                            .then(() => Resolve())
                                            .catch((error) => Resolve(error))
                                    })
                                  : null
                          const createNormalBeads = await Promise.all(
                              stringData.map(
                                  (bead, index) =>
                                      new Promise((Resolve, reject) => {
                                          Post.create({
                                              type: `string-${bead.type}`,
                                              state: 'visible',
                                              creatorId: accountId,
                                              color: bead.color,
                                              text: bead.text,
                                              url:
                                                  bead.type === 'audio'
                                                      ? files.find(
                                                            (file) => file.beadIndex === index
                                                        ).location
                                                      : bead.url,
                                              urlImage:
                                                  bead.type === 'url' ? bead.urlData.image : null,
                                              urlDomain:
                                                  bead.type === 'url' ? bead.urlData.domain : null,
                                              urlTitle:
                                                  bead.type === 'url' ? bead.urlData.title : null,
                                              urlDescription:
                                                  bead.type === 'url'
                                                      ? bead.urlData.description
                                                      : null,
                                              state: 'visible',
                                          }).then(async (stringPost) => {
                                              const createPostImages =
                                                  bead.type === 'image'
                                                      ? await Promise.all(
                                                            bead.images.map((image, i) =>
                                                                PostImage.create({
                                                                    postId: stringPost.id,
                                                                    creatorId: accountId,
                                                                    index: i,
                                                                    url:
                                                                        image.url ||
                                                                        files.find(
                                                                            (file) =>
                                                                                file.beadIndex ===
                                                                                    index &&
                                                                                file.imageIndex ===
                                                                                    i
                                                                        ).location,
                                                                    caption: image.caption,
                                                                })
                                                            )
                                                        )
                                                      : null

                                              const createStringLink = await Link.create({
                                                  state: 'visible',
                                                  type: 'string-post',
                                                  index: index + 1,
                                                  creatorId: accountId,
                                                  itemAId: post.id,
                                                  itemBId: stringPost.id,
                                              })

                                              Promise.all([
                                                  createPostImages,
                                                  createStringLink,
                                              ]).then((data) =>
                                                  Resolve({
                                                      stringPost,
                                                      imageData: data[0],
                                                      linkData: data[1],
                                                  })
                                              )
                                          })
                                      })
                              )
                          )
                          Promise.all([linkSourceBead, notifySourcePlayer, createNormalBeads])
                              .then((data) => resolve(data[2]))
                              .catch((error) => resolve(error))
                      })
                    : null

            const createWeave =
                type === 'weave'
                    ? new Promise((resolve, reject) => {
                          const players = JSON.parse(playerData)
                          Weave.create({
                              state: privacy === 'all-users-allowed' ? 'active' : 'pending',
                              numberOfMoves,
                              numberOfTurns,
                              allowedBeadTypes,
                              characterLimit,
                              audioTimeLimit,
                              moveTimeWindow,
                              privacy,
                              postId: post.id,
                          }).then(async () => {
                              if (privacy === 'all-users-allowed') resolve()
                              else {
                                  const playerAccounts = await User.findAll({
                                      where: { id: players.map((p) => p.id) },
                                      attributes: ['id', 'name', 'handle', 'email'],
                                  })
                                  const creatorAccount = playerAccounts.find(
                                      (p) => p.id === accountId
                                  )
                                  Promise.all(
                                      players.map((player, index) => {
                                          return UserPost.create({
                                              userId: player.id,
                                              postId: post.id,
                                              type: 'weave',
                                              relationship: 'player',
                                              index: index + 1,
                                              color: player.color,
                                              state:
                                                  player.id === accountId ? 'accepted' : 'pending',
                                          }).then(() => {
                                              if (player.id !== accountId) {
                                                  // const moveTimeWindow = ''
                                                  // send invite notification and email
                                                  Notification.create({
                                                      type: 'weave-invitation',
                                                      ownerId: player.id,
                                                      userId: accountId,
                                                      postId: post.id,
                                                      seen: false,
                                                      state: 'pending',
                                                  })
                                                  const playerAccount = playerAccounts.find(
                                                      (pa) => pa.id === player.id
                                                  )
                                                  sgMail.send({
                                                      to: playerAccount.email,
                                                      from: {
                                                          email: 'admin@weco.io',
                                                          name: 'we { collective }',
                                                      },
                                                      subject: 'New notification',
                                                      text: `
                                                Hi ${playerAccount.name}, ${creatorAccount.name} just invited you to join a Weave on weco: https://${config.appURL}/p/${post.id}
                                                Log in and go to your notifications to accept or reject the invitation: https://${config.appURL}/u/${playerAccount.handle}/notifications
                                            `,
                                                      html: `
                                                <p>
                                                    Hi ${playerAccount.name},
                                                    <br/>
                                                    <a href='${config.appURL}/u/${
                                                          creatorAccount.handle
                                                      }'>${creatorAccount.name}</a>
                                                    just invited you to join a <a href='${
                                                        config.appURL
                                                    }/p/${post.id}'>Weave</a> on weco.
                                                    <br/>
                                                    Log in and go to your <a href='${
                                                        config.appURL
                                                    }/u/${
                                                          playerAccount.handle
                                                      }/notifications'>notifications</a> to accept or reject the invitation.
                                                    <br/>
                                                    <br/>
                                                    Weave settings:
                                                    <br/>
                                                    <br/>
                                                    Player order: ${playerAccounts
                                                        .map((p) => p.name)
                                                        .join(' → ')}
                                                    <br/>
                                                    Turns (moves per player): ${numberOfTurns}
                                                    <br/>
                                                    Allowed bead types: ${allowedBeadTypes}
                                                    <br/>
                                                    Time window for moves: ${
                                                        moveTimeWindow
                                                            ? `${moveTimeWindow} minutes`
                                                            : 'Off'
                                                    }
                                                    <br/>
                                                    Character limit: ${
                                                        characterLimit
                                                            ? `${characterLimit} characters`
                                                            : 'Off'
                                                    }
                                                    <br/>
                                                    Audio time limit: ${
                                                        audioTimeLimit
                                                            ? `${audioTimeLimit} seconds`
                                                            : 'Off'
                                                    }
                                                    <br/>
                                                </p>
                                            `,
                                                  })
                                              }
                                          })
                                      })
                                  ).then(() => resolve(playerAccounts))
                              }
                          })
                      })
                    : null

            Promise.all([
                createDirectRelationships,
                createIndirectRelationships,
                notifyMentions,
                createEvent,
                createInquiry,
                createGBG,
                createImages,
                createStringPosts,
                createWeave,
            ]).then((data) => {
                res.status(200).json({
                    post,
                    indirectRelationships: data[1],
                    event: data[3],
                    inquiryAnswers: data[4],
                    images: data[6],
                    string: data[7],
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
                contentType: function (req, file, cb) {
                    cb(null, file.mimetype)
                },
                metadata: function (req, file, cb) {
                    cb(null, { mimetype: file.mimetype })
                },
                key: function (req, file, cb) {
                    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                    const date = Date.now().toString()
                    const fileName = `post-image-upload-${accountId}-${name}-${date}`
                    cb(null, fileName)
                },
            }),
        }).any('file')(req, res, (error) => {
            const { files, body } = req
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE')
                    res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                createPost(
                    JSON.parse(body.postData),
                    files.map((file) => {
                        return { location: file.location, index: Number(file.originalname) }
                    }),
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
                },
            }),
        }).single('file')(req, res, (error) => {
            const { file, body } = req
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE')
                    res.status(413).send({ message: 'File size too large' })
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
                if (error.code === 'LIMIT_FILE_SIZE')
                    res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                // convert raw audio to mp3
                ffmpeg(file.path)
                    .output(`audio/mp3/${file.filename}.mp3`)
                    .on('end', function () {
                        // upload new mp3 file to s3 bucket
                        fs.readFile(`audio/mp3/${file.filename}.mp3`, function (err, data) {
                            if (!err) {
                                const name = file.originalname
                                    .replace(/[^A-Za-z0-9]/g, '-')
                                    .substring(0, 30)
                                const date = Date.now().toString()
                                const fileName = `post-audio-recording-${accountId}-${name}-${date}.mp3`
                                console.log('fileName: ', fileName)
                                s3.putObject(
                                    {
                                        Bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                                        ACL: 'public-read',
                                        Key: fileName,
                                        Body: data,
                                        Metadata: { mimetype: file.mimetype },
                                    },
                                    (err) => {
                                        if (err) console.log(err)
                                        else {
                                            // delete old files
                                            fs.unlink(`audio/raw/${file.filename}`, (err) => {
                                                if (err) console.log(err)
                                            })
                                            fs.unlink(`audio/mp3/${file.filename}.mp3`, (err) => {
                                                if (err) console.log(err)
                                            })
                                            // create post
                                            createPost(JSON.parse(body.postData), [
                                                {
                                                    location: `https://weco-${process.env.NODE_ENV}-post-audio.s3.eu-west-1.amazonaws.com/${fileName}`,
                                                },
                                            ])
                                        }
                                    }
                                )
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
            Promise.all(
                files.map(
                    (file) =>
                        new Promise((resolve) => {
                            if (file.fieldname === 'audioFile') {
                                fs.readFile(`stringData/${file.filename}`, function (err, data) {
                                    s3.putObject(
                                        {
                                            Bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                                            ACL: 'public-read',
                                            Key: file.filename,
                                            Body: data,
                                            Metadata: { mimetype: file.mimetype },
                                        },
                                        (err) => {
                                            if (err) console.log(err)
                                            else {
                                                resolve({
                                                    fieldname: file.fieldname,
                                                    beadIndex: +file.originalname,
                                                    location: `${baseUrl}post-audio${s3Url}/${file.filename}`,
                                                })
                                                fs.unlink(`stringData/${file.filename}`, (err) => {
                                                    if (err) console.log(err)
                                                })
                                            }
                                        }
                                    )
                                })
                            } else if (file.fieldname === 'audioRecording') {
                                // convert audio blob to mp3
                                ffmpeg(file.path)
                                    .output(`audio/mp3/${file.filename}.mp3`)
                                    .on('end', () => {
                                        // upload mp3 to s3 bucket
                                        fs.readFile(
                                            `audio/mp3/${file.filename}.mp3`,
                                            function (err, data) {
                                                if (!err) {
                                                    const name = file.originalname
                                                        .replace(/[^A-Za-z0-9]/g, '-')
                                                        .substring(0, 30)
                                                    const date = Date.now().toString()
                                                    const fileName = `post-audio-recording-${accountId}-${name}-${date}.mp3`
                                                    s3.putObject(
                                                        {
                                                            Bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                                                            ACL: 'public-read',
                                                            Key: fileName,
                                                            Body: data,
                                                            Metadata: { mimetype: file.mimetype },
                                                        },
                                                        (err) => {
                                                            if (err) console.log(err)
                                                            else {
                                                                resolve({
                                                                    fieldname: file.fieldname,
                                                                    beadIndex: +file.originalname,
                                                                    location: `${baseUrl}post-audio${s3Url}/${fileName}`,
                                                                })
                                                                console.log('delete files!!!!!!!')
                                                                fs.unlink(
                                                                    `stringData/${file.filename}`,
                                                                    (err) => {
                                                                        if (err) console.log(err)
                                                                    }
                                                                )
                                                                fs.unlink(
                                                                    `audio/mp3/${file.filename}.mp3`,
                                                                    (err) => {
                                                                        if (err) console.log(err)
                                                                    }
                                                                )
                                                            }
                                                        }
                                                    )
                                                }
                                            }
                                        )
                                    })
                                    .run()
                            } else if (file.fieldname === 'image') {
                                fs.readFile(`stringData/${file.filename}`, function (err, data) {
                                    s3.putObject(
                                        {
                                            Bucket: `weco-${process.env.NODE_ENV}-post-images`,
                                            ACL: 'public-read',
                                            Key: file.filename,
                                            Body: data,
                                            ContentType: file.mimetype,
                                            Metadata: { mimetype: file.mimetype },
                                        },
                                        (err, response) => {
                                            if (err) console.log(err)
                                            else {
                                                const indexes = file.originalname.split('-')
                                                resolve({
                                                    fieldname: file.fieldname,
                                                    beadIndex: +indexes[0],
                                                    imageIndex: +indexes[1],
                                                    location: `${baseUrl}post-images${s3Url}/${file.filename}`,
                                                })
                                                fs.unlink(`stringData/${file.filename}`, (err) => {
                                                    if (err) console.log(err)
                                                })
                                            }
                                        }
                                    )
                                })
                            } else resolve(null)
                        })
                )
            ).then((data) => {
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
            creatorName,
            creatorHandle,
            postId,
            beadIndex,
            mentions,
            privacy,
            nextPlayerId,
            type,
            color,
            text,
            url,
            urlData,
        } = beadData

        Post.create({
            type: `string-${type}`,
            state: 'visible',
            creatorId: accountId,
            color,
            text,
            url: type === 'audio' ? files[0].location : url,
            urlImage: urlData ? urlData.image : null,
            urlDomain: urlData ? urlData.domain : null,
            urlTitle: urlData ? urlData.title : null,
            urlDescription: urlData ? urlData.description : null,
        }).then(async (bead) => {
            const createImages =
                type === 'image'
                    ? await Promise.all(
                          imageData.map((image, index) =>
                              PostImage.create({
                                  postId: bead.id,
                                  creatorId: accountId,
                                  index,
                                  url:
                                      image.url ||
                                      files.find((file) => file.index === index).location,
                                  caption: image.caption,
                              })
                          )
                      )
                    : null

            const createStringLink = await Link.create({
                state: 'visible',
                type: 'string-post',
                index: beadIndex,
                creatorId: accountId,
                itemAId: postId,
                itemBId: bead.id,
            })

            const post = await Post.findOne({
                where: { id: postId, state: 'visible' },
                include: [
                    {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'name', 'handle', 'email'],
                    },
                    {
                        model: Weave,
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
                                attributes: ['id', 'name', 'handle', 'email'],
                            },
                        ],
                    },
                ],
            })

            const updateWeaveStateAndNotifyPlayers = await new Promise(async (resolve) => {
                const openGameFinished =
                    privacy === 'all-users-allowed' &&
                    post.StringPosts.length === post.Weave.numberOfMoves
                const privateGameFinished = privacy === 'only-selected-users' && !nextPlayerId
                if (openGameFinished) {
                    // find open game players
                    const openGamePlayers = []
                    post.StringPosts.forEach((bead) => {
                        if (!openGamePlayers.find((p) => p.id === bead.Creator.id))
                            openGamePlayers.push(bead.Creator)
                    })
                    const updateWeaveState = await Weave.update(
                        { state: 'ended' },
                        { where: { postId } }
                    )
                    const notifyPlayers = await Promise.all(
                        openGamePlayers.map(
                            (p) =>
                                new Promise(async (Resolve) => {
                                    const notifyPlayer = await Notification.create({
                                        type: 'weave-ended',
                                        ownerId: p.id,
                                        postId: postId,
                                        seen: false,
                                    })
                                    const emailPlayer = await sgMail.send({
                                        to: p.email,
                                        from: {
                                            email: 'admin@weco.io',
                                            name: 'we { collective }',
                                        },
                                        subject: 'New notification',
                                        text: `
                                            Hi ${p.name}, a weave you participated in has now finished.
                                            https://${config.appURL}/p/${postId}
                                        `,
                                        html: `
                                            <p>
                                                Hi ${p.name},
                                                <br/>
                                                A <a href='${config.appURL}/p/${postId}'>weave</a> you participated in has now finished.
                                            </p>
                                        `,
                                    })
                                    Promise.all([notifyPlayer, emailPlayer])
                                        .then(() => Resolve())
                                        .catch((error) => Resolve(error))
                                })
                        )
                    )
                    Promise.all([updateWeaveState, notifyPlayers])
                        .then(() => resolve())
                        .catch(() => resolve())
                } else if (privateGameFinished) {
                    const updateWeaveState = await Weave.update(
                        { state: 'ended' },
                        { where: { postId } }
                    )
                    // todo: add notification
                    const notifyPlayers = await Promise.all(
                        post.StringPlayers.map(
                            (p) =>
                                new Promise(async (Resolve) => {
                                    const notifyPlayer = await Notification.create({
                                        type: 'weave-ended',
                                        ownerId: p.id,
                                        postId: postId,
                                        seen: false,
                                    })
                                    const emailPlayer = await sgMail.send({
                                        to: p.email,
                                        from: {
                                            email: 'admin@weco.io',
                                            name: 'we { collective }',
                                        },
                                        subject: 'New notification',
                                        text: `
                                        Hi ${p.name}, a weave you participated in has now finished.
                                        https://${config.appURL}/p/${postId}
                                    `,
                                        html: `
                                        <p>
                                            Hi ${p.name},
                                            <br/>
                                            A <a href='${config.appURL}/p/${postId}'>weave</a> you participated in has now finished.
                                        </p>
                                    `,
                                    })
                                    Promise.all([notifyPlayer, emailPlayer])
                                        .then(() => Resolve())
                                        .catch((error) => Resolve(error))
                                })
                        )
                    )
                    Promise.all([updateWeaveState, notifyPlayers])
                        .then(() => resolve())
                        .catch(() => resolve())
                } else if (privacy === 'only-selected-users') {
                    // update next move deadline
                    const deadline = post.Weave.moveTimeWindow
                        ? new Date(new Date().getTime() + post.Weave.moveTimeWindow * 60 * 1000)
                        : null
                    const updateWeaveState = deadline
                        ? await Weave.update({ nextMoveDeadline: deadline }, { where: { postId } })
                        : null
                    // notify next player in private game
                    const nextPlayer = post.StringPlayers.find((p) => p.id === nextPlayerId)
                    const nextMoveNumber = post.StringPosts.length + 1
                    const createMoveNotification = await Notification.create({
                        type: 'weave-move',
                        ownerId: nextPlayerId,
                        postId: postId,
                        seen: false,
                    })
                    const sendMoveEmail = await sgMail.send({
                        to: nextPlayer.email,
                        from: {
                            email: 'admin@weco.io',
                            name: 'we { collective }',
                        },
                        subject: 'New notification',
                        text: `
                            Hi ${nextPlayer.name}, it's your move!
                            Add a new bead to the Weave on weco: https://${config.appURL}/p/${postId}
                        `,
                        html: `
                            <p>
                                Hi ${nextPlayer.name},
                                <br/>
                                It's your move!
                                <br/>
                                Add a new bead to the <a href='${config.appURL}/p/${postId}'>Weave</a> on weco.
                            </p>
                        `,
                    })
                    const scheduleWeaveMoveJobs = ScheduledTasks.scheduleWeaveMoveJobs(
                        postId,
                        nextPlayer,
                        nextMoveNumber,
                        deadline
                    )
                    Promise.all([
                        updateWeaveState,
                        createMoveNotification,
                        sendMoveEmail,
                        scheduleWeaveMoveJobs,
                    ])
                        .then(() => resolve(deadline))
                        .catch(() => resolve())
                } else {
                    // find open game players
                    const openGamePlayers = []
                    post.StringPosts.forEach((bead) => {
                        // filter out game creator and existing records
                        if (
                            bead.Creator.id !== post.Creator.id &&
                            !openGamePlayers.find((p) => p.id === bead.Creator.id)
                        )
                            openGamePlayers.push(bead.Creator)
                    })
                    const notifyGameCreator =
                        post.Creator.id === accountId
                            ? null
                            : await new Promise(async (Resolve) => {
                                  const respondingPlayer = openGamePlayers.find(
                                      (p) => p.id === accountId
                                  )
                                  const notifyCreator = await Notification.create({
                                      type: 'weave-creator-move-from-other-player',
                                      ownerId: post.Creator.id,
                                      postId: postId,
                                      userId: accountId,
                                      seen: false,
                                  })
                                  const emailCreator = await sgMail.send({
                                      to: post.Creator.email,
                                      from: {
                                          email: 'admin@weco.io',
                                          name: 'we { collective }',
                                      },
                                      subject: 'New notification',
                                      text: `
                                Hi ${post.Creator.name}, ${respondingPlayer.name} just added a new bead to a weave you created.
                                https://${config.appURL}/p/${postId}
                            `,
                                      html: `
                                <p>
                                    Hi ${post.Creator.name},
                                    <br/>
                                    <a href='${config.appURL}/u/${respondingPlayer.handle}'>${respondingPlayer.name}</a> just added a new bead to a
                                    <a href='${config.appURL}/p/${postId}'>Weave</a> you created.
                                </p>
                            `,
                                  })
                                  Promise.all([notifyCreator, emailCreator])
                                      .then(() => Resolve())
                                      .catch((error) => Resolve(error))
                              })
                    const notifyOtherPlayers = await Promise.all(
                        openGamePlayers.map(
                            (p) =>
                                new Promise(async (Resolve) => {
                                    if (p.id !== accountId) {
                                        const respondingPlayer =
                                            openGamePlayers.find((p) => p.id === accountId) ||
                                            post.Creator
                                        const notifyPlayer = await Notification.create({
                                            type: 'weave-move-from-other-player',
                                            ownerId: p.id,
                                            postId: postId,
                                            userId: accountId,
                                            seen: false,
                                        })
                                        const emailPlayer = await sgMail.send({
                                            to: p.email,
                                            from: {
                                                email: 'admin@weco.io',
                                                name: 'we { collective }',
                                            },
                                            subject: 'New notification',
                                            text: `
                                                Hi ${p.name}, ${respondingPlayer.name} just added a new bead to a weave you participated in.
                                                https://${config.appURL}/p/${postId}
                                            `,
                                            html: `
                                                <p>
                                                    Hi ${p.name},
                                                    <br/>
                                                    <a href='${config.appURL}/u/${respondingPlayer.handle}'>${respondingPlayer.name}</a> just added a new bead to a
                                                    <a href='${config.appURL}/p/${postId}'>Weave</a> you participated in.
                                                </p>
                                            `,
                                        })
                                        Promise.all([notifyPlayer, emailPlayer])
                                            .then(() => Resolve())
                                            .catch((error) => Resolve(error))
                                    } else Resolve()
                                })
                        )
                    )
                    Promise.all([notifyGameCreator, notifyOtherPlayers])
                        .then(() => resolve())
                        .catch((error) => resolve(error))
                }
            })

            const notifyMentions = await new Promise((resolve) => {
                User.findAll({
                    where: { handle: mentions, state: 'active' },
                    attributes: ['id', 'name', 'email'],
                })
                    .then((users) => {
                        Promise.all(
                            users.map(
                                (user) =>
                                    new Promise(async (reso) => {
                                        const sendNotification = await Notification.create({
                                            ownerId: user.id,
                                            type: 'bead-mention',
                                            seen: false,
                                            userId: accountId,
                                            postId: bead.id,
                                        })

                                        const sendEmail = await sgMail.send({
                                            to: user.email,
                                            from: {
                                                email: 'admin@weco.io',
                                                name: 'we { collective }',
                                            },
                                            subject: 'New notification',
                                            text: `
                                                Hi ${user.name}, ${creatorName} just mentioned you in a bead on weco:
                                                http://${config.appURL}/p/${bead.id}
                                            `,
                                            html: `
                                                <p>
                                                    Hi ${user.name},
                                                    <br/>
                                                    <a href='${config.appURL}/u/${creatorHandle}'>${creatorName}</a>
                                                    just mentioned you in a 
                                                    <a href='${config.appURL}/p/${bead.id}'>bead</a>
                                                    on weco
                                                </p>
                                            `,
                                        })

                                        Promise.all([sendNotification, sendEmail])
                                            .then(() => reso())
                                            .catch((error) => reso(error))
                                    })
                            )
                        )
                            .then((data) => resolve(data))
                            .catch((error) => resolve(data, error))
                    })
                    .catch((error) => resolve(error))
            })

            Promise.all([
                createImages,
                createStringLink,
                updateWeaveStateAndNotifyPlayers,
                notifyMentions,
            ])
                .then((data) =>
                    res
                        .status(200)
                        .json({ bead, imageData: data[0], linkData: data[1], newDeadline: data[2] })
                )
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
                contentType: function (req, file, cb) {
                    cb(null, file.mimetype)
                },
                metadata: function (req, file, cb) {
                    cb(null, { mimetype: file.mimetype })
                },
                key: function (req, file, cb) {
                    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                    const date = Date.now().toString()
                    const fileName = `post-image-upload-${accountId}-${name}-${date}`
                    cb(null, fileName)
                },
            }),
        }).any('file')(req, res, (error) => {
            const { files, body } = req
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE')
                    res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                createBead(
                    JSON.parse(body.beadData),
                    files.map((file) => {
                        return { location: file.location, index: Number(file.originalname) }
                    }),
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
                },
            }),
        }).single('file')(req, res, (error) => {
            const { file, body } = req
            if (error instanceof multer.MulterError) {
                if (error.code === 'LIMIT_FILE_SIZE')
                    res.status(413).send({ message: 'File size too large' })
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
                if (error.code === 'LIMIT_FILE_SIZE')
                    res.status(413).send({ message: 'File size too large' })
                else res.status(500).send(error)
            } else if (error) {
                res.status(500).send(error)
            } else {
                // convert raw audio to mp3
                ffmpeg(file.path)
                    .output(`audio/mp3/${file.filename}.mp3`)
                    .on('end', function () {
                        // upload new mp3 file to s3 bucket
                        fs.readFile(`audio/mp3/${file.filename}.mp3`, function (err, data) {
                            if (!err) {
                                const name = file.originalname
                                    .replace(/[^A-Za-z0-9]/g, '-')
                                    .substring(0, 30)
                                const date = Date.now().toString()
                                const fileName = `post-audio-recording-${accountId}-${name}-${date}.mp3`
                                console.log('fileName: ', fileName)
                                s3.putObject(
                                    {
                                        Bucket: `weco-${process.env.NODE_ENV}-post-audio`,
                                        ACL: 'public-read',
                                        Key: fileName,
                                        Body: data,
                                        Metadata: { mimetype: file.mimetype },
                                    },
                                    (err) => {
                                        if (err) console.log(err)
                                        else {
                                            // delete old files
                                            fs.unlink(`audio/raw/${file.filename}`, (err) => {
                                                if (err) console.log(err)
                                            })
                                            fs.unlink(`audio/mp3/${file.filename}.mp3`, (err) => {
                                                if (err) console.log(err)
                                            })
                                            // create post
                                            createBead(JSON.parse(body.beadData), [
                                                {
                                                    location: `https://weco-${process.env.NODE_ENV}-post-audio.s3.eu-west-1.amazonaws.com/${fileName}`,
                                                },
                                            ])
                                        }
                                    }
                                )
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
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'name', 'email'],
            },
        ],
    })

    const isOwnPost = post.Creator.id === accountId

    const sendNotification = isOwnPost
        ? null
        : await Notification.create({
              ownerId: post.Creator.id,
              type: 'post-repost',
              seen: false,
              holonAId: spaceId,
              userId: accountId,
              postId,
          })

    const sendEmail = isOwnPost
        ? null
        : await sgMail.send({
              to: post.Creator.email,
              from: {
                  email: 'admin@weco.io',
                  name: 'we { collective }',
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

    const createReactions = Promise.all(
        selectedSpaceIds.map((id) =>
            Reaction.create({
                type: 'repost',
                state: 'active',
                holonId: id,
                userId: accountId,
                postId: postId,
            })
        )
    )

    const createDirectRelationships = Promise.all(
        selectedSpaceIds.map((id) =>
            PostHolon.create({
                type: 'repost',
                relationship: 'direct',
                creatorId: accountId,
                postId: postId,
                holonId: id,
            })
        )
    )

    const indirectSpaceIds = await new Promise((resolve, reject) => {
        Promise.all(
            selectedSpaceIds.map((id) =>
                Holon.findOne({
                    where: { id, state: 'active' },
                    attributes: [],
                    include: [
                        {
                            model: Holon,
                            as: 'HolonHandles',
                            attributes: ['id'],
                            through: { where: { state: 'open' }, attributes: [] },
                        },
                    ],
                })
            )
        ).then((spaces) => {
            const ids = []
            spaces.forEach((space) => ids.push(...space.HolonHandles.map((holon) => holon.id)))
            const filteredIds = [...new Set(ids)].filter((id) => !selectedSpaceIds.includes(id))
            resolve(filteredIds)
        })
    })

    const createIndirectRelationships = Promise.all(
        indirectSpaceIds.map((id) => {
            return new Promise((resolve, reject) => {
                PostHolon.findOne({ where: { postId, holonId: id } }).then((postHolon) => {
                    if (!postHolon) {
                        PostHolon.create({
                            type: 'repost',
                            relationship: 'indirect',
                            // state: 'active',
                            creatorId: accountId,
                            postId: postId,
                            holonId: id,
                        }).then(() => resolve(id))
                    } else resolve()
                })
            })
        })
    )

    Promise.all([
        sendNotification,
        sendEmail,
        createReactions,
        createDirectRelationships,
        createIndirectRelationships,
    ])
        .then((data) =>
            res.status(200).json({ message: 'Success', indirectRelationships: data[4] })
        )
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/add-like', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { accountHandle, accountName, postId, holonId } = req.body

    const post = await Post.findOne({
        where: { id: postId },
        attributes: [],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        ],
    })

    const createReaction = await Reaction.create({
        type: 'like',
        value: null,
        state: 'active',
        holonId,
        userId: accountId,
        postId,
    })

    const isOwnPost = post.Creator.id === accountId

    const createNotification = isOwnPost
        ? null
        : await Notification.create({
              ownerId: post.Creator.id,
              type: 'post-like',
              seen: false,
              holonAId: holonId,
              userId: accountId,
              postId,
          })

    const sendEmail = isOwnPost
        ? null
        : await sgMail.send({
              to: post.Creator.email,
              from: {
                  email: 'admin@weco.io',
                  name: 'we { collective }',
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

    Promise.all([createReaction, createNotification, sendEmail])
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/remove-like', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { postId } = req.body
    Reaction.update(
        { state: 'removed' },
        {
            where: {
                type: 'like',
                state: 'active',
                postId,
                userId: accountId,
            },
        }
    )
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/add-rating', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { accountHandle, accountName, postId, spaceId, newRating } = req.body

    const post = await Post.findOne({
        where: { id: postId },
        attributes: [],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        ],
    })

    const isOwnPost = post.Creator.id === accountId

    const createReaction = await Reaction.create({
        type: 'rating',
        value: newRating,
        state: 'active',
        holonId: spaceId,
        userId: accountId,
        postId,
    })

    const sendNotification = isOwnPost
        ? null
        : await Notification.create({
              ownerId: post.Creator.id,
              type: 'post-rating',
              seen: false,
              holonAId: spaceId,
              userId: accountId,
              postId,
          })

    const sendEmail = isOwnPost
        ? null
        : await sgMail.send({
              to: post.Creator.email,
              from: {
                  email: 'admin@weco.io',
                  name: 'we { collective }',
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

    Promise.all([createReaction, sendNotification, sendEmail])
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/remove-rating', authenticateToken, (req, res) => {
    const accountId = req.user.id
    const { postId, spaceId } = req.body
    Reaction.update(
        { state: 'removed' },
        {
            where: {
                type: 'rating',
                state: 'active',
                userId: accountId,
                postId,
            },
        }
    )
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

router.post('/add-link', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { accountHandle, accountName, spaceId, description, itemAId, itemBId } = req.body

    const itemB = await Post.findOne({ where: { id: itemBId } })
    if (!itemB) res.status(404).send({ message: 'Item B not found' })
    else {
        const createLink = await Link.create({
            state: 'visible',
            type: 'post-post',
            creatorId: accountId,
            description,
            itemAId,
            itemBId,
        })

        const itemA = await Post.findOne({
            where: { id: itemAId },
            attributes: [],
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
                },
            ],
        })

        const itemB = await Post.findOne({
            where: { id: itemBId },
            attributes: ['id'],
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
                },
            ],
        })

        const isOwnPost = post.Creator.id === accountId

        // todo: also send notification to itemB owner, and include itemB info in email
        const sendNotification = isOwnPost
            ? null
            : await Notification.create({
                  ownerId: itemA.Creator.id,
                  type: 'post-link',
                  seen: false,
                  holonAId: spaceId,
                  userId: accountId,
                  postId: itemAId,
              })

        const sendEmail = isOwnPost
            ? null
            : await sgMail.send({
                  to: itemA.Creator.email,
                  from: {
                      email: 'admin@weco.io',
                      name: 'we { collective }',
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

        Promise.all([createLink, sendNotification, sendEmail])
            .then((data) => res.status(200).json({ itemB, link: data[0], message: 'Success' }))
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
    const { text, postId, parentCommentId, spaceId, accountHandle, accountName, mentions } =
        req.body

    const post = await Post.findOne({
        where: { id: postId },
        attributes: [],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        ],
    })

    const parentComment = parentCommentId
        ? await Comment.findOne({
              where: { id: parentCommentId },
              attributes: [],
              include: [
                  {
                      model: User,
                      as: 'Creator',
                      attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
                  },
              ],
          })
        : null

    const createComment = await Comment.create({
        state: 'visible',
        creatorId: accountId,
        holonId: spaceId,
        postId,
        parentCommentId,
        text,
    })

    const notifyPostOwner =
        post.Creator.id !== accountId
            ? new Promise((resolve) => {
                  const createNotification = Notification.create({
                      ownerId: post.Creator.id,
                      type: 'post-comment',
                      seen: false,
                      holonAId: spaceId,
                      userId: accountId,
                      postId,
                      commentId: createComment.id,
                  })
                  const sendEmail = sgMail.send({
                      to: post.Creator.email,
                      from: {
                          email: 'admin@weco.io',
                          name: 'we { collective }',
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
                  Promise.all([createNotification, sendEmail])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })
            : null

    const notifyParentCommentOwner =
        parentComment && parentComment.Creator.id !== accountId
            ? new Promise((resolve) => {
                  const createNotification = Notification.create({
                      ownerId: parentComment.Creator.id,
                      type: 'comment-reply',
                      seen: false,
                      holonAId: spaceId,
                      userId: accountId,
                      postId,
                      commentId: createComment.id,
                  })
                  const sendEmail = sgMail.send({
                      to: parentComment.Creator.email,
                      from: {
                          email: 'admin@weco.io',
                          name: 'we { collective }',
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
                  Promise.all([createNotification, sendEmail])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })
            : null

    const notifyMentions = await new Promise((resolve) => {
        User.findAll({
            where: { handle: mentions, state: 'active' },
            attributes: ['id', 'name', 'email'],
        })
            .then((users) => {
                Promise.all(
                    users.map(
                        (user) =>
                            new Promise(async (reso) => {
                                const sendNotification = await Notification.create({
                                    ownerId: user.id,
                                    type: 'comment-mention',
                                    seen: false,
                                    userId: accountId,
                                    postId,
                                    commentId: createComment.id,
                                })

                                const sendEmail = await sgMail.send({
                                    to: user.email,
                                    from: {
                                        email: 'admin@weco.io',
                                        name: 'we { collective }',
                                    },
                                    subject: 'New notification',
                                    text: `
                                            Hi ${user.name}, ${accountName} just mentioned you in a comment on weco:
                                            http://${config.appURL}/p/${postId}
                                        `,
                                    html: `
                                            <p>
                                                Hi ${user.name},
                                                <br/>
                                                <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                                                just mentioned you in a 
                                                <a href='${config.appURL}/p/${postId}'>comment</a>
                                                on weco
                                            </p>
                                        `,
                                })

                                Promise.all([sendNotification, sendEmail])
                                    .then(() => reso())
                                    .catch((error) => reso(error))
                            })
                    )
                )
                    .then((data) => resolve(data))
                    .catch((error) => resolve(data, error))
            })
            .catch((error) => resolve(error))
    })

    Promise.all([createComment, notifyPostOwner, notifyParentCommentOwner, notifyMentions])
        .then((data) => res.status(200).json(data[0]))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
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
        attributes: ['id'],
    }).then((userEvent) => {
        if (userEvent) {
            // if matching event, remove event
            UserEvent.update({ state: 'removed' }, { where: { id: userEvent.id } }).then(() =>
                res.status(200).send({ message: 'UserEvent removed' })
            )
        } else {
            // else remove other responses to event if present
            UserEvent.update(
                { state: 'removed' },
                {
                    where: {
                        userId: accountId,
                        eventId,
                        relationship: response === 'going' ? 'interested' : 'going',
                        state: 'active',
                    },
                }
            ).then(() => {
                // then create new user event
                UserEvent.create({
                    userId: accountId,
                    eventId,
                    relationship: response,
                    state: 'active',
                }).then((userEvent) => {
                    // schedule reminder notifications
                    ScheduledTasks.scheduleEventNotification({
                        type: response,
                        postId,
                        eventId,
                        userEventId: userEvent.id,
                        startTime,
                        userId: accountId,
                        userName,
                        userEmail,
                    })
                    res.status(200).send({ message: 'UserEvent added' })
                })
            })
        }
    })
})

router.post('/vote-on-inquiry', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { userName, userHandle, spaceId, postId, voteData } = req.body

    const post = await Post.findOne({
        where: { id: postId },
        attributes: [],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        ],
    })

    const removeOldReactions = await Reaction.update(
        { state: 'removed' },
        { where: { state: 'active', userId: accountId, postId } }
    )

    const createNewReactions = await Promise.all(
        voteData.map((answer) =>
            Reaction.create({
                type: 'inquiry-vote',
                value: answer.value || null,
                state: 'active',
                holonId: spaceId,
                userId: accountId,
                postId,
                inquiryAnswerId: answer.id,
            })
        )
    )

    const createNotification =
        post.Creator.id !== accountId
            ? await Notification.create({
                  ownerId: post.Creator.id,
                  type: 'inquiry-vote',
                  seen: false,
                  userId: accountId,
                  postId,
              })
            : null

    const sendEmail =
        post.Creator.id !== accountId
            ? await sgMail.send({
                  to: post.Creator.email,
                  from: {
                      email: 'admin@weco.io',
                      name: 'we { collective }',
                  },
                  subject: 'New notification',
                  text: `
            Hi ${post.Creator.name}, ${userName} just voted on your Inquiry:
            http://${config.appURL}/p/${postId}
        `,
                  html: `
            <p>
                Hi ${post.Creator.name},
                <br/>
                <a href='${config.appURL}/u/${userHandle}'>${userName}</a>
                just voted on your
                <a href='${config.appURL}/p/${postId}'>Inquiry</a>
            </p>
        `,
              })
            : null

    Promise.all([removeOldReactions, createNewReactions, createNotification, sendEmail])
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch(() => res.status(500).json({ message: 'Error' }))
})

// todo: add authenticateToken to all endpoints below
router.post('/save-glass-bead-game', (req, res) => {
    const { gameId, beads } = req.body

    GlassBeadGame.update({ locked: true }, { where: { id: gameId, locked: false } }).then(() => {
        beads.forEach((bead) => {
            GlassBead.create({
                gameId,
                index: bead.index,
                userId: bead.user.id,
                beadUrl: bead.beadUrl,
                state: 'visible',
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
        text,
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

    GlassBeadGame.update(
        {
            playerOrder,
            introDuration,
            numberOfTurns,
            moveDuration,
            intervalDuration,
            outroDuration,
        },
        { where: { id: gameId } }
    )
        .then(res.status(200).send({ message: 'Success' }))
        .catch((error) => console.log(error))
})

router.post('/save-gbg-topic', (req, res) => {
    const { gameId, newTopic } = req.body

    GlassBeadGame.update({ topic: newTopic, topicGroup: null }, { where: { id: gameId } })
        .then(res.status(200).send({ message: 'Success' }))
        .catch((error) => console.log(error))
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
    }).then((spaces) => res.send(spaces))
})

router.post('/delete-post', authenticateToken, async (req, res) => {
    const accountId = req.user.id
    const { postId } = req.body

    const post = await Post.findOne({
        where: { id: postId, creatorId: accountId },
        include: [
            {
                model: Event,
                attributes: ['id'],
                required: false,
            },
        ],
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
    Comment.update({ state: 'deleted' }, { where: { id: commentId, creatorId: accountId } })
        .then(res.status(200).json({ message: 'Comment deleted' }))
        .catch((error) => console.log(error))
})

module.exports = router
