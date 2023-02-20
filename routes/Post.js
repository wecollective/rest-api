require('dotenv').config()
const config = require('../Config')
const express = require('express')
const router = express.Router()
const sequelize = require('sequelize')
const Op = sequelize.Op
const sgMail = require('@sendgrid/mail')
const ScheduledTasks = require('../ScheduledTasks')
const puppeteer = require('puppeteer')
const aws = require('aws-sdk')
const multer = require('multer')
const multerS3 = require('multer-s3')
const s3 = new aws.S3({})
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const authenticateToken = require('../middleware/authenticateToken')
const {
    imageMBLimit,
    audioMBLimit,
    findFullPostAttributes,
    findPostInclude,
    postAccess,
    totalUserPosts,
    totalUserComments,
    totalSpacePosts,
} = require('../Helpers')
const {
    Space,
    SpacePost,
    SpaceUser,
    SpaceParent,
    SpaceAncestor,
    User,
    Post,
    Comment,
    Reaction,
    Event,
    UserEvent,
    Prism,
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

// initialise
ffmpeg.setFfmpegPath(ffmpegPath)
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1',
})

// testing
router.get('/test', async (req, res) => {
    console.log('testing!')
})

// GET
router.get('/post-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.query
    const attributes = [postAccess(accountId), ...findFullPostAttributes('Post', accountId)]
    const include = findPostInclude(accountId)

    const post = await Post.findOne({
        where: { id: postId, state: 'visible' },
        attributes,
        include,
    })
    if (!post) res.status(404).json({ message: 'Post not found' })
    else if (!post.dataValues.access) res.status(401).json({ message: 'Access denied' })
    else if (post.state === 'deleted') res.status(401).json({ message: 'Post deleted' })
    else res.status(200).json(post)
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
        .then((reactions) => res.status(200).json(reactions))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
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
                model: Space,
                as: 'Space',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
    })
        .then((reactions) => res.status(200).json(reactions))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/post-indirect-spaces', async (req, res) => {
    const { postId } = req.query
    const post = await Post.findOne({
        where: { id: postId },
        include: [
            {
                model: Space,
                as: 'IndirectSpaces',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
                through: { where: { relationship: 'indirect' }, attributes: [] },
            },
        ],
    })
    res.status(200).json(post.IndirectSpaces)
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
        .then((reactions) => res.status(200).json(reactions))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
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
                                attributes: ['id', 'handle', 'name', 'flagImagePath'],
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
                                attributes: ['id', 'handle', 'name', 'flagImagePath'],
                            },
                        ],
                    },
                ],
            },
        ],
    })
        .then((post) => res.status(200).json(post))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/post-comments', (req, res) => {
    const { postId } = req.query

    Comment.findAll({
        where: { postId, parentCommentId: null },
        order: [['createdAt', 'ASC']],
        attributes: ['id', 'postId', 'text', 'state', 'createdAt', 'updatedAt'],
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
                attributes: [
                    'id',
                    'postId',
                    'parentCommentId',
                    'text',
                    'state',
                    'createdAt',
                    'updatedAt',
                ],
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
        .then((comments) => res.status(200).json(comments))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
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
        .then((prism) => res.status(200).json(prism))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/plot-graph-data', (req, res) => {
    const { postId } = req.query
    PlotGraph.findOne({ where: { postId: postId } })
        .then((plotGraph) => res.status(200).json(plotGraph))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
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
        if (urlData.image[0] === '/')
            urlData.image = `https://${new URL(url).hostname}${urlData.image}`
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
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['handle', 'name', 'flagImagePath'],
                    },
                ],
            },
        ],
    })
        .then((post) => res.json(post))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

// POST
router.post('/create-post', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { uploadType } = req.query

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
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
                text: text || null,
                url: type === 'audio' ? files[0].location : url,
                urlImage,
                urlDomain,
                urlTitle,
                urlDescription,
            }).then(async (post) => {
                const createDirectRelationships = await Promise.all(
                    spaceIds.map((spaceId) =>
                        SpacePost.create({
                            type: 'post',
                            relationship: 'direct',
                            creatorId: accountId,
                            postId: post.id,
                            spaceId,
                        })
                    )
                )

                const createIndirectRelationships = await new Promise(async (resolve) => {
                    const spaces = await Space.findAll({
                        where: { id: spaceIds, state: 'active' },
                        attributes: ['id'],
                        include: [
                            {
                                model: Space,
                                as: 'SpaceAncestors',
                                attributes: ['id'],
                                through: { where: { state: 'open' }, attributes: [] },
                            },
                        ],
                    })
                    // gather ancestor ids
                    const ids = []
                    spaces.forEach((space) =>
                        ids.push(...space.SpaceAncestors.map((space) => space.id))
                    )
                    // remove duplicates and direct spaces
                    const filteredIds = [...new Set(ids)].filter((id) => !spaceIds.includes(id))
                    Promise.all(
                        filteredIds.map((id) =>
                            SpacePost.create({
                                type: 'post',
                                relationship: 'indirect',
                                creatorId: accountId,
                                postId: post.id,
                                spaceId: id,
                            })
                        )
                    )
                        .then((data) => resolve(data))
                        .catch((error) => resolve(error))
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
                                                  text: bead.text || null,
                                                  url:
                                                      bead.type === 'audio'
                                                          ? files.find(
                                                                (file) => file.beadIndex === index
                                                            ).location
                                                          : bead.url,
                                                  urlImage:
                                                      bead.type === 'url'
                                                          ? bead.urlData.image
                                                          : null,
                                                  urlDomain:
                                                      bead.type === 'url'
                                                          ? bead.urlData.domain
                                                          : null,
                                                  urlTitle:
                                                      bead.type === 'url'
                                                          ? bead.urlData.title
                                                          : null,
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
                                                      player.id === accountId
                                                          ? 'accepted'
                                                          : 'pending',
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
                        const name = file.originalname
                            .replace(/[^A-Za-z0-9]/g, '-')
                            .substring(0, 30)
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
                        const name = file.originalname
                            .replace(/[^A-Za-z0-9]/g, '-')
                            .substring(0, 30)
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
                                                fs.unlink(
                                                    `audio/mp3/${file.filename}.mp3`,
                                                    (err) => {
                                                        if (err) console.log(err)
                                                    }
                                                )
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
                limits: { fileSize: imageMBLimit * 1024 * 1024 },
                dest: './stringData',
            }).any()(req, res, (error) => {
                const { files, body } = req
                Promise.all(
                    files.map(
                        (file) =>
                            new Promise((resolve) => {
                                if (file.fieldname === 'audioFile') {
                                    fs.readFile(
                                        `stringData/${file.filename}`,
                                        function (err, data) {
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
                                                        fs.unlink(
                                                            `stringData/${file.filename}`,
                                                            (err) => {
                                                                if (err) console.log(err)
                                                            }
                                                        )
                                                    }
                                                }
                                            )
                                        }
                                    )
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
                                                                Metadata: {
                                                                    mimetype: file.mimetype,
                                                                },
                                                            },
                                                            (err) => {
                                                                if (err) console.log(err)
                                                                else {
                                                                    resolve({
                                                                        fieldname: file.fieldname,
                                                                        beadIndex:
                                                                            +file.originalname,
                                                                        location: `${baseUrl}post-audio${s3Url}/${fileName}`,
                                                                    })
                                                                    console.log(
                                                                        'delete files!!!!!!!'
                                                                    )
                                                                    fs.unlink(
                                                                        `stringData/${file.filename}`,
                                                                        (err) => {
                                                                            if (err)
                                                                                console.log(err)
                                                                        }
                                                                    )
                                                                    fs.unlink(
                                                                        `audio/mp3/${file.filename}.mp3`,
                                                                        (err) => {
                                                                            if (err)
                                                                                console.log(err)
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
                                    fs.readFile(
                                        `stringData/${file.filename}`,
                                        function (err, data) {
                                            const name = file.originalname
                                                .replace(/[^A-Za-z0-9]/g, '-')
                                                .substring(0, 30)
                                            const date = Date.now().toString()
                                            const fileName = `post-image-upload-${accountId}-${name}-${date}`
                                            s3.putObject(
                                                {
                                                    Bucket: `weco-${process.env.NODE_ENV}-post-images`,
                                                    ACL: 'public-read',
                                                    Key: fileName,
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
                                                            location: `${baseUrl}post-images${s3Url}/${fileName}`,
                                                        })
                                                        fs.unlink(
                                                            `stringData/${file.filename}`,
                                                            (err) => {
                                                                if (err) console.log(err)
                                                            }
                                                        )
                                                    }
                                                }
                                            )
                                        }
                                    )
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
    }
})

router.post('/update-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, type, text, mentions, creatorName, creatorHandle } = req.body
    const mentionType = type.includes('string-') ? 'bead' : 'post'

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const updatePost = await Post.update(
            { text: text || null },
            { where: { id: postId, creatorId: accountId } }
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
                                        type: `${mentionType}-mention`,
                                        seen: false,
                                        userId: accountId,
                                        postId,
                                    })

                                    const sendEmail = await sgMail.send({
                                        to: user.email,
                                        from: {
                                            email: 'admin@weco.io',
                                            name: 'we { collective }',
                                        },
                                        subject: 'New notification',
                                        text: `
                                            Hi ${user.name}, ${creatorName} just mentioned you in a ${mentionType} on weco:
                                            http://${config.appURL}/p/${postId}
                                        `,
                                        html: `
                                            <p>
                                                Hi ${user.name},
                                                <br/>
                                                <a href='${config.appURL}/u/${creatorHandle}'>${creatorName}</a>
                                                just mentioned you in a 
                                                <a href='${config.appURL}/p/${postId}'>${mentionType}</a>
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

        Promise.all([updatePost, notifyMentions])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/create-next-weave-bead', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { uploadType } = req.query

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
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
                text: text || null,
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
                            ? await Weave.update(
                                  { nextMoveDeadline: deadline },
                                  { where: { postId } }
                              )
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
                        res.status(200).json({
                            bead,
                            imageData: data[0],
                            linkData: data[1],
                            newDeadline: data[2],
                        })
                    )
                    .catch((error) => res.status(500).json({ message: 'Error', error }))
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
                        const name = file.originalname
                            .replace(/[^A-Za-z0-9]/g, '-')
                            .substring(0, 30)
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
                        const name = file.originalname
                            .replace(/[^A-Za-z0-9]/g, '-')
                            .substring(0, 30)
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
                                                fs.unlink(
                                                    `audio/mp3/${file.filename}.mp3`,
                                                    (err) => {
                                                        if (err) console.log(err)
                                                    }
                                                )
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
    }
})

router.post('/repost-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, postId, spaceId, spaceIds } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
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
                  spaceAId: spaceId,
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

        const createReactions = await Promise.all(
            spaceIds.map((id) =>
                Reaction.create({
                    type: 'repost',
                    state: 'active',
                    spaceId: id,
                    userId: accountId,
                    postId,
                })
            )
        )

        const createDirectRelationships = await Promise.all(
            spaceIds.map((id) =>
                SpacePost.create({
                    type: 'repost',
                    relationship: 'direct',
                    creatorId: accountId,
                    postId,
                    spaceId: id,
                })
            )
        )

        const createIndirectRelationships = await new Promise(async (resolve) => {
            const spaces = await Space.findAll({
                where: { id: spaceIds, state: 'active' },
                attributes: ['id'],
                include: [
                    {
                        model: Space,
                        as: 'SpaceAncestors',
                        attributes: ['id'],
                        through: { where: { state: 'open' }, attributes: [] },
                    },
                ],
            })
            // gather ancestor ids
            const ancestorIds = []
            spaces.forEach((space) =>
                ancestorIds.push(...space.SpaceAncestors.map((space) => space.id))
            )
            // remove duplicates and direct spaces
            const filteredIds = [...new Set(ancestorIds)].filter((id) => !spaceIds.includes(id))
            Promise.all(
                filteredIds.map(
                    (id) =>
                        new Promise(async (reso) => {
                            // only create new relationship if none present
                            // todo: include 'state' value in search (so they can be removed or reinstated by mods)
                            const existingRelationship = await SpacePost.findOne({
                                where: { postId, spaceId: id },
                            })
                            if (existingRelationship) reso()
                            else {
                                SpacePost.create({
                                    type: 'repost',
                                    relationship: 'indirect',
                                    creatorId: accountId,
                                    postId,
                                    spaceId: id,
                                })
                                    .then(() => reso(id))
                                    .catch((error) => reso(error))
                            }
                        })
                )
            )
                .then((data) => resolve(data))
                .catch((error) => resolve(error))
        })

        Promise.all([
            sendNotification,
            sendEmail,
            createReactions,
            createDirectRelationships,
            createIndirectRelationships,
        ])
            .then((data) => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/add-like', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, postId, spaceId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
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
            state: 'active',
            spaceId,
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
                  spaceAId: spaceId,
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
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-like', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
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
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/add-rating', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, postId, spaceId, newRating } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
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
            spaceId,
            userId: accountId,
            postId,
        })

        const sendNotification = isOwnPost
            ? null
            : await Notification.create({
                  ownerId: post.Creator.id,
                  type: 'post-rating',
                  seen: false,
                  spaceAId: spaceId,
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
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-rating', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, spaceId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
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
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/add-link', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, spaceId, description, itemAId, itemBId } = req.body
    const itemB = await Post.findOne({ where: { id: itemBId } })

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else if (!itemB) res.status(404).send({ message: 'Item B not found' })
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

        const isOwnPost = itemA.Creator.id === accountId

        // todo: also send notification to itemB owner, and include itemB info in email
        const sendNotification = isOwnPost
            ? null
            : await Notification.create({
                  ownerId: itemA.Creator.id,
                  type: 'post-link',
                  seen: false,
                  spaceAId: spaceId,
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
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-link', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    let { linkId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Link.update({ state: 'hidden' }, { where: { id: linkId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/create-comment', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { text, postId, commentId, replyId, spaceId, mentions } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const account = await User.findOne({
            where: { id: accountId },
            attributes: ['name', 'handle'],
        })

        const post = await Post.findOne({
            where: { id: postId },
            attributes: [],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        })

        const comment = commentId
            ? await Comment.findOne({
                  where: { id: commentId },
                  attributes: [],
                  include: {
                      model: User,
                      as: 'Creator',
                      attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
                  },
              })
            : null

        const reply = replyId
            ? await Comment.findOne({
                  where: { id: replyId },
                  attributes: [],
                  include: {
                      model: User,
                      as: 'Creator',
                      attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
                  },
              })
            : null

        const mentionedUsers = await User.findAll({
            where: { handle: mentions, state: 'active' },
            attributes: ['id', 'name', 'email'],
        })

        const newComment = await Comment.create({
            state: 'visible',
            creatorId: accountId,
            text,
            postId,
            parentCommentId: commentId,
            spaceId,
        })

        // the following logic ensures only one notification/email is sent to each user and own account is always skipped
        const commentCreatorId = comment ? comment.Creator.id : null
        const replyCreatorId = reply ? reply.Creator.id : null
        const mentionedUsersIds = mentionedUsers.map((u) => u.id)
        // skip notifying post creator if own account, comment owner, reply owner, or in mentions
        const skipPostCreator = [
            accountId,
            commentCreatorId,
            replyCreatorId,
            ...mentionedUsersIds,
        ].includes(post.Creator.id)
        // skip notifying comment creator if no comment, own account, reply owner, or in mentions
        const skipCommentCreator =
            !comment ||
            [accountId, replyCreatorId, ...mentionedUsersIds].includes(comment.Creator.id)
        // skip notifying reply creator if no reply, own account, or in mentions
        const skipReplyCreator =
            !reply || [accountId, ...mentionedUsersIds].includes(reply.Creator.id)

        const notifyPostCreator = skipPostCreator
            ? null
            : new Promise((resolve) => {
                  const createNotification = Notification.create({
                      ownerId: post.Creator.id,
                      type: 'post-comment',
                      seen: false,
                      spaceAId: spaceId,
                      userId: accountId,
                      postId,
                      commentId: newComment.id,
                  })
                  const sendEmail = sgMail.send({
                      to: post.Creator.email,
                      from: { email: 'admin@weco.io', name: 'we { collective }' },
                      subject: 'New notification',
                      text: `
                            Hi ${post.Creator.name}, ${account.name} just commented on your post on weco:
                            http://${config.appURL}/p/${postId}?commentId=${newComment.id}
                        `,
                      html: `
                            <p>
                                Hi ${post.Creator.name},
                                <br/>
                                <a href='${config.appURL}/u/${account.handle}'>${account.name}</a>
                                just commented on your
                                <a href='${config.appURL}/p/${postId}?commentId=${newComment.id}'>post</a>
                                on weco
                            </p>
                        `,
                  })
                  Promise.all([createNotification, sendEmail])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })

        const notifyCommentCreator = skipCommentCreator
            ? null
            : new Promise((resolve) => {
                  const createNotification = Notification.create({
                      ownerId: comment.Creator.id,
                      type: 'comment-reply',
                      seen: false,
                      spaceAId: spaceId,
                      userId: accountId,
                      postId,
                      commentId: newComment.id,
                  })
                  const sendEmail = sgMail.send({
                      to: comment.Creator.email,
                      from: { email: 'admin@weco.io', name: 'we { collective }' },
                      subject: 'New notification',
                      text: `
                            Hi ${comment.Creator.name}, ${account.name} just replied to your comment on weco:
                            http://${config.appURL}/p/${postId}?commentId=${newComment.id}
                        `,
                      html: `
                            <p>
                                Hi ${comment.Creator.name},
                                <br/>
                                <a href='${config.appURL}/u/${account.handle}'>${account.name}</a>
                                just replied to your
                                <a href='${config.appURL}/p/${postId}?commentId=${newComment.id}'>comment</a>
                                on weco
                            </p>
                        `,
                  })
                  Promise.all([createNotification, sendEmail])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })

        const notifyReplyCreator = skipReplyCreator
            ? null
            : new Promise((resolve) => {
                  const createNotification = Notification.create({
                      ownerId: reply.Creator.id,
                      type: 'comment-reply',
                      seen: false,
                      spaceAId: spaceId,
                      userId: accountId,
                      postId,
                      commentId: newComment.id,
                  })
                  const sendEmail = sgMail.send({
                      to: reply.Creator.email,
                      from: { email: 'admin@weco.io', name: 'we { collective }' },
                      subject: 'New notification',
                      text: `
                              Hi ${reply.Creator.name}, ${account.name} just replied to your comment on weco:
                              http://${config.appURL}/p/${postId}?commentId=${newComment.id}
                          `,
                      html: `
                              <p>
                                  Hi ${reply.Creator.name},
                                  <br/>
                                  <a href='${config.appURL}/u/${account.handle}'>${account.name}</a>
                                  just replied to your
                                  <a href='${config.appURL}/p/${postId}?commentId=${newComment.id}'>comment</a>
                                  on weco
                              </p>
                          `,
                  })
                  Promise.all([createNotification, sendEmail])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })

        const notifyMentions = await Promise.all(
            mentionedUsers
                .filter((u) => u.id !== accountId)
                .map(
                    (user) =>
                        new Promise(async (resolve) => {
                            const sendNotification = await Notification.create({
                                ownerId: user.id,
                                type: 'comment-mention',
                                seen: false,
                                userId: accountId,
                                postId,
                                commentId: newComment.id,
                            })

                            const sendEmail = await sgMail.send({
                                to: user.email,
                                from: { email: 'admin@weco.io', name: 'we { collective }' },
                                subject: 'New notification',
                                text: `
                                    Hi ${user.name}, ${account.name} just mentioned you in a comment on weco:
                                    http://${config.appURL}/p/${postId}?commentId=${newComment.id}
                                `,
                                html: `
                                    <p>
                                        Hi ${user.name},
                                        <br/>
                                        <a href='${config.appURL}/u/${account.handle}'>${account.name}</a>
                                        just mentioned you in a
                                        <a href='${config.appURL}/p/${postId}?commentId=${newComment.id}'>comment</a>
                                        on weco
                                    </p>
                                `,
                            })

                            Promise.all([sendNotification, sendEmail])
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        })
                )
        )

        Promise.all([notifyPostCreator, notifyCommentCreator, notifyReplyCreator, notifyMentions])
            .then(() => res.status(200).json(newComment))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/update-comment', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, commentId, text, mentions } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const account = await User.findOne({
            where: { id: accountId },
            attributes: ['name', 'handle'],
        })

        const mentionedUsers = await User.findAll({
            where: { handle: mentions, state: 'active' },
            attributes: ['id', 'name', 'email'],
        })

        const updateComment = await Comment.update(
            { text: text || null },
            { where: { id: commentId, creatorId: accountId } }
        )

        const notifyMentions = await Promise.all(
            mentionedUsers
                .filter((u) => u.id !== accountId)
                .map(
                    (user) =>
                        new Promise(async (resolve) => {
                            const sendNotification = await Notification.create({
                                ownerId: user.id,
                                type: 'comment-mention',
                                seen: false,
                                userId: accountId,
                                postId,
                                commentId,
                            })

                            const sendEmail = await sgMail.send({
                                to: user.email,
                                from: { email: 'admin@weco.io', name: 'we { collective }' },
                                subject: 'New notification',
                                text: `
                                    Hi ${user.name}, ${account.name} just mentioned you in a comment on weco:
                                    http://${config.appURL}/p/${postId}?commentId=${commentId}
                                `,
                                html: `
                                    <p>
                                        Hi ${user.name},
                                        <br/>
                                        <a href='${config.appURL}/u/${account.handle}'>${account.name}</a>
                                        just mentioned you in a
                                        <a href='${config.appURL}/p/${postId}?commentId=${commentId}'>comment</a>
                                        on weco
                                    </p>
                                `,
                            })

                            Promise.all([sendNotification, sendEmail])
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        })
                )
        )

        Promise.all([updateComment, notifyMentions])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/respond-to-event', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userName, userEmail, postId, eventId, startTime, response } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const previousResponse = await UserEvent.findOne({
            where: { userId: accountId, eventId, relationship: response, state: 'active' },
            attributes: ['id'],
        })

        const updateStatus = previousResponse
            ? UserEvent.update({ state: 'removed' }, { where: { id: previousResponse.id } })
            : new Promise(async (resolve) => {
                  const removeOtherResponseTypes = await UserEvent.update(
                      { state: 'removed' },
                      { where: { userId: accountId, eventId, state: 'active' } }
                  )

                  const newResponse = await UserEvent.create({
                      userId: accountId,
                      eventId,
                      relationship: response,
                      state: 'active',
                  })

                  const scheduleReminder = await ScheduledTasks.scheduleEventNotification({
                      type: response,
                      postId,
                      eventId,
                      userEventId: newResponse.id,
                      startTime,
                      userId: accountId,
                      userName,
                      userEmail,
                  })

                  Promise.all([removeOtherResponseTypes, scheduleReminder])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })

        updateStatus
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/vote-on-inquiry', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userName, userHandle, spaceId, postId, voteData } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
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
                    spaceId,
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
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
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
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.post('/save-gbg-topic', (req, res) => {
    const { gameId, newTopic } = req.body

    GlassBeadGame.update({ topic: newTopic, topicGroup: null }, { where: { id: gameId } })
        .then(() => res.status(200).send({ message: 'Success' }))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.post('/delete-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
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
        const removePost = await post.update({ state: 'deleted' })
        const removeEvent = post.Event
            ? Event.update({ state: 'deleted' }, { where: { id: post.Event.id } })
            : null

        Promise.all([removePost, removeEvent])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/delete-comment', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { commentId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Comment.update({ state: 'deleted' }, { where: { id: commentId, creatorId: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

module.exports = router

// Metamodern forum migration tasks
// const { Client } = require('pg')
// const client = new Client({
//     host: 'localhost',
//     user: 'postgres',
//     port: 5432,
//     password: 'root',
//     database: 'test',
// })
// client.connect()

// let testIndex = 0

// router.get('/test', async (req, res) => {
//     console.log('testing!')

//     if (testIndex > 0) {
//         console.log('second attempt')
//         res.send('second attempt')
//     } else {
//         console.log('first attempt')
//         testIndex += 1

//         const mmSpaceId = 463
//         const jamesId = 1

//     //     // Step 1: Add users
//     //     const users = await new Promise((resolve) => {
//     //         client.query(`SELECT * FROM users WHERE users.id > 0`, (error, result) => {
//     //             if (error) resolve('error')
//     //             else
//     //                 resolve(
//     //                     result.rows.map((user) => {
//     //                         return {
//     //                             mm_id: user.id,
//     //                             name: user.name || user.username,
//     //                             handle: user.username,
//     //                         }
//     //                     })
//     //                 )
//     //         })
//     //     })

//     //     const usersWithEmailAndBio = await Promise.all(
//     //         users.map(
//     //             (user) =>
//     //                 new Promise(async (resolve) => {
//     //                     const email = await new Promise(async (reso) => {
//     //                         client.query(
//     //                             `SELECT * FROM user_emails WHERE user_emails.user_id = ${user.mm_id} `,
//     //                             (error, result) => {
//     //                                 if (error || !result.rows[0]) reso(null)
//     //                                 else reso(result.rows[0].email)
//     //                             }
//     //                         )
//     //                     })
//     //                     const bio = await new Promise(async (reso) => {
//     //                         client.query(
//     //                             `SELECT * FROM user_profiles WHERE user_profiles.user_id = ${user.mm_id} `,
//     //                             (error, result) => {
//     //                                 if (error || !result.rows[0]) reso(null)
//     //                                 else reso(result.rows[0].bio_raw)
//     //                             }
//     //                         )
//     //                     })
//     //                     const matchId = await new Promise(async (reso) => {
//     //                         const matchingUser = await User.findOne({
//     //                             where: {
//     //                                 [Op.or]: [{ email }, { handle: user.handle }],
//     //                             },
//     //                         })
//     //                         reso(matchingUser ? matchingUser.id : null)
//     //                     })

//     //                     if (matchId) {
//     //                         // update user with mmid and add mm access if not present
//     //                         User.update({ mmId: user.mm_id }, { where: { id: matchId } }).then(
//     //                             async () => {
//     //                                 const matchingSpaceAccess = await SpaceUser.findOne({
//     //                                     where: {
//     //                                         userId: matchId,
//     //                                         spaceId: mmSpaceId,
//     //                                         relationship: 'access',
//     //                                         state: 'active',
//     //                                     },
//     //                                 })
//     //                                 if (!matchingSpaceAccess) {
//     //                                     SpaceUser.create({
//     //                                         relationship: 'access',
//     //                                         state: 'active',
//     //                                         spaceId: mmSpaceId,
//     //                                         userId: matchId,
//     //                                     })
//     //                                         .then(() => resolve({ ...user, email, bio, matchId }))
//     //                                         .catch(() => resolve('error'))
//     //                                 } else
//     //                                     resolve({ ...user, email, bio, matchId })
//     //                             }
//     //                         )
//     //                     } else {
//     //                         // create new user and grant access
//     //                         const createUser = await User.create({
//     //                             name: user.name,
//     //                             handle: user.handle,
//     //                             mmId: user.mm_id,
//     //                             email,
//     //                             bio,
//     //                             emailVerified: false,
//     //                             state: 'unclaimed',
//     //                         })
//     //                         const addMMAccess = await SpaceUser.create({
//     //                             relationship: 'access',
//     //                             state: 'active',
//     //                             spaceId: mmSpaceId,
//     //                             userId: createUser.id,
//     //                         })
//     //                         Promise.all([createUser, addMMAccess])
//     //                             .then(() => resolve({ ...user, email, bio, matchId }))
//     //                             .catch(() => resolve('error'))
//     //                     }
//     //                     // resolve({ ...user, email, bio, matchId })
//     //                 })
//     //         )
//     //     )

//     //     res.json(usersWithEmailAndBio)
//     // }

//     //     // Step 2: Add spaces and posts
//     //     const tagData = [
//     //         // { name: 'metapolitics', mmId: 3, wecoId: 0 },
//     //         // { name: 'game-b', mmId: 4, wecoId: 0 },
//     //         { name: 'question', mmId: 5, wecoId: 0 },
//     //         { name: 'spirituality', mmId: 6, wecoId: 0 },
//     //         // { name: 'ecology', mmId: 7, wecoId: 0 },
//     //         // { name: '70s', mmId: 8, wecoId: 0 },
//     //         // { name: 'ica', mmId: 9, wecoId: 0 },
//     //         // { name: 'strategy', mmId: 10, wecoId: 0 },
//     //         // { name: 'chicago', mmId: 11, wecoId: 0 },
//     //         // { name: 'parenting', mmId: 12, wecoId: 0 },
//     //         { name: 'education', mmId: 13, wecoId: 0 },
//     //         // { name: 'opportunities', mmId: 14, wecoId: 0 },
//     //         { name: 'politics', mmId: 15, wecoId: 0 },
//     //         // { name: 'meditation', mmId: 16, wecoId: 0 },
//     //         { name: 'philosophy', mmId: 17, wecoId: 0 },
//     //         // { name: 'quantum', mmId: 18, wecoId: 0 },
//     //         // { name: 'simultaneous-states', mmId: 19, wecoId: 0 },
//     //         // { name: 'epistomology', mmId: 20, wecoId: 0 },
//     //         // { name: 'ontology', mmId: 21, wecoId: 0 },
//     //         { name: 'metaphysics', mmId: 22, wecoId: 0 },
//     //         // { name: 'truth', mmId: 23, wecoId: 0 },
//     //         // { name: 'youtube', mmId: 24, wecoId: 0 },
//     //         // { name: 'community-building', mmId: 25, wecoId: 0 },
//     //         // { name: 'game', mmId: 26, wecoId: 0 },
//     //         // { name: 'ideation', mmId: 27, wecoId: 0 },
//     //         // { name: 'seriousplay', mmId: 28, wecoId: 0 },
//     //         { name: 'cocreation', mmId: 29, wecoId: 0 },
//     //         // { name: 'design', mmId: 30, wecoId: 0 },
//     //         // { name: 'communication', mmId: 31, wecoId: 0 },
//     //         // { name: 'burning-man', mmId: 32, wecoId: 0 },
//     //         // { name: 'stoicism', mmId: 33, wecoId: 0 },
//     //         // { name: 'glossary', mmId: 34, wecoId: 0 },
//     //         // { name: 'audio', mmId: 35, wecoId: 0 },
//     //         // { name: 'cosmolocalism', mmId: 36, wecoId: 0 },
//     //         { name: 'art', mmId: 37, wecoId: 0 },
//     //         // { name: 'poetry', mmId: 38, wecoId: 0 },
//     //         // { name: 'architecture', mmId: 39, wecoId: 0 },
//     //         // { name: 'development', mmId: 40, wecoId: 0 },
//     //         // { name: 'pathology', mmId: 41, wecoId: 0 },
//     //         // { name: 'absurdism', mmId: 42, wecoId: 0 },
//     //         // { name: 'meta-right', mmId: 43, wecoId: 0 },
//     //         // { name: 'coaching', mmId: 44, wecoId: 0 },
//     //         // { name: 'fractal-transformation', mmId: 45, wecoId: 0 },
//     //         // { name: 'leadership', mmId: 46, wecoId: 0 },
//     //         // { name: 'the-listening-body', mmId: 47, wecoId: 0 },
//     //         // { name: 'metamodern-somatics', mmId: 48, wecoId: 0 },
//     //         // { name: 'stage-theories', mmId: 49, wecoId: 0 },
//     //         { name: 'science', mmId: 50, wecoId: 0 },
//     //         // { name: 'book', mmId: 51, wecoId: 0 },
//     //         { name: 'funding', mmId: 52, wecoId: 0 },
//     //         // { name: 'postmodernism', mmId: 53, wecoId: 0 },
//     //         // { name: 'podcast', mmId: 54, wecoId: 0 },
//     //         // { name: 'manga', mmId: 55, wecoId: 0 },
//     //         // { name: 'somatics', mmId: 56, wecoId: 0 },
//     //         // { name: 'bodywork', mmId: 57, wecoId: 0 },
//     //         // { name: 'metaconventions', mmId: 58, wecoId: 0 },
//     //         // { name: 'post-academic-world', mmId: 59, wecoId: 0 },
//     //         // { name: 'economics', mmId: 60, wecoId: 0 },
//     //         // { name: 'metamodernfestival', mmId: 61, wecoId: 0 },
//     //         // { name: 'regeneration', mmId: 62, wecoId: 0 },
//     //         // { name: 'law', mmId: 63, wecoId: 0 },
//     //         // { name: 'parents', mmId: 64, wecoId: 0 },
//     //         // { name: 'gender', mmId: 65, wecoId: 0 },
//     //         // { name: 'fourth-political-theory', mmId: 66, wecoId: 0 },
//     //         // { name: 'heidegger', mmId: 67, wecoId: 0 },
//     //         // { name: 'the-listening-society', mmId: 68, wecoId: 0 },
//     //         // { name: 'quotes', mmId: 69, wecoId: 0 },
//     //         // { name: 'nordic-ideology', mmId: 70, wecoId: 0 },
//     //         // { name: 'metamodernism-in-media', mmId: 71, wecoId: 0 },
//     //         // { name: 'music', mmId: 72, wecoId: 0 },
//     //         // { name: 'performing-arts', mmId: 73, wecoId: 0 },
//     //         // { name: 'religion', mmId: 74, wecoId: 0 },
//     //         // { name: 'psychology', mmId: 75, wecoId: 0 },
//     //         // { name: 'slavery', mmId: 76, wecoId: 0 },
//     //         // { name: 'postcapitalism', mmId: 77, wecoId: 0 },
//     //         // { name: 'social-movements', mmId: 78, wecoId: 0 },
//     //         // { name: 'outreach', mmId: 79, wecoId: 0 },
//     //         // { name: 'neuroscience', mmId: 80, wecoId: 0 },
//     //         // { name: 'crypto', mmId: 81, wecoId: 0 },
//     //         // { name: 'dao', mmId: 82, wecoId: 0 },
//     //         // { name: 'animal-rights', mmId: 83, wecoId: 0 },
//     //         // { name: 'activism', mmId: 84, wecoId: 0 },
//     //         // { name: 'money', mmId: 85, wecoId: 0 },
//     //         // { name: 'economy', mmId: 86, wecoId: 0 },
//     //         // { name: 'ethics', mmId: 87, wecoId: 0 },
//     //         // { name: 'suffering', mmId: 88, wecoId: 0 },
//     //         // { name: 'sensemaking', mmId: 89, wecoId: 0 },
//     //         // { name: 'web3', mmId: 90, wecoId: 0 },
//     //         // { name: 'blockchain', mmId: 91, wecoId: 0 },
//     //         // { name: 'democracy', mmId: 92, wecoId: 0 },
//     //         // { name: 'direct-democracy', mmId: 93, wecoId: 0 },
//     //         // { name: 'liquid-democracy', mmId: 94, wecoId: 0 },
//     //         // { name: 'metacrisis', mmId: 95, wecoId: 0 },
//     //     ]

//     //     Promise.all(
//     //         tagData.map(
//     //             (tag) =>
//     //                 new Promise(async (resolve) => {
//     //                     // resolve(tag)
//     //                     const newSpace = await Space.create({
//     //                         creatorId: jamesId,
//     //                         handle: `mm-${tag.name}`,
//     //                         name: tag.name,
//     //                         description: tag.name,
//     //                         state: 'active',
//     //                         privacy: 'public',
//     //                     })

//     //                     const createModRelationshipJames = await SpaceUser.create({
//     //                         relationship: 'moderator',
//     //                         state: 'active',
//     //                         spaceId: newSpace.id,
//     //                         userId: jamesId,
//     //                     })

//     //                     const createModRelationshipLCC = SpaceUser.create({
//     //                         relationship: 'moderator',
//     //                         state: 'active',
//     //                         spaceId: newSpace.id,
//     //                         userId: 8,
//     //                     })

//     //                     const createParentRelationship = await SpaceParent.create({
//     //                         spaceAId: mmSpaceId, // parent (metamodern forum id)
//     //                         spaceBId: newSpace.id, // child
//     //                         state: 'open',
//     //                     })

//     //                     const createAncestorRelationship = await SpaceAncestor.create({
//     //                         spaceAId: mmSpaceId, // ancestor (metamodern forum id)
//     //                         spaceBId: newSpace.id, // descendent
//     //                         state: 'open',
//     //                     })

//     //                     Promise.all([
//     //                         createModRelationshipJames,
//     //                         createModRelationshipLCC,
//     //                         createParentRelationship,
//     //                         createAncestorRelationship,
//     //                     ])
//     //                         .then(() =>
//     //                             resolve({
//     //                                 name: tag.name,
//     //                                 mmId: tag.mmId,
//     //                                 wecoId: newSpace.id,
//     //                             })
//     //                         )
//     //                         .catch((error) => resolve('error'))
//     //                 })
//     //         )
//     //     )
//     //         .then(async (newTagData) => {
//     //             // get posts
//     //             const posts = await new Promise((resolve) => {
//     //                 client.query(
//     //                     `SELECT * FROM topics WHERE archetype = 'regular' AND user_id > 0 ORDER BY created_at ASC`,
//     //                     (error, result) => {
//     //                         if (error) resolve('error')
//     //                         else
//     //                             resolve(
//     //                                 result.rows.map((post) => {
//     //                                     return {
//     //                                         mm_id: post.id,
//     //                                         mm_creator_id: post.user_id,
//     //                                         text: post.title,
//     //                                         deleted: post.deleted_at,
//     //                                         created_at: post.created_at,
//     //                                     }
//     //                                 })
//     //                             )
//     //                     }
//     //                 )
//     //             })
//     //             // add posts
//     //             Promise.all(
//     //                 posts
//     //                     .filter((p) => !p.deleted)
//     //                     .map(
//     //                         (post) =>
//     //                             new Promise(async (resolve) => {
//     //                                 // get weco user
//     //                                 const user = await User.findOne({
//     //                                     where: { mmId: post.mm_creator_id },
//     //                                 })
//     //                                 // get first comment
//     //                                 const firstComment = await new Promise(async (reso) => {
//     //                                     client.query(
//     //                                         `SELECT * FROM posts WHERE topic_id = ${post.mm_id} AND post_number = 1`,
//     //                                         (error, result) => {
//     //                                             if (error || !result.rows[0]) reso('')
//     //                                             else reso(result.rows[0].raw)
//     //                                         }
//     //                                     )
//     //                                 })
//     //                                 // get tags
//     //                                 const tags = await new Promise(async (reso) => {
//     //                                     client.query(
//     //                                         `SELECT * FROM topic_tags WHERE topic_id = ${post.mm_id} `,
//     //                                         (error, result) => {
//     //                                             if (error || !result.rows[0]) reso([])
//     //                                             else {
//     //                                                 let matchedTags = []
//     //                                                 result.rows.forEach((r) => {
//     //                                                     const match = newTagData.find(
//     //                                                         (t) => t.mmId === r.tag_id
//     //                                                     )
//     //                                                     if (match) matchedTags.push(match)
//     //                                                 })
//     //                                                 reso(matchedTags)
//     //                                             }
//     //                                         }
//     //                                     )
//     //                                 })
//     //                                 // create post
//     //                                 Post.create(
//     //                                     {
//     //                                         creatorId: user.id,
//     //                                         text: `**${post.text}** <br/> <br/> ${firstComment}`,
//     //                                         createdAt: post.created_at,
//     //                                         updatedAt: post.created_at,
//     //                                         type: 'text',
//     //                                         state: 'visible',
//     //                                         mmId: post.mm_id,
//     //                                     },
//     //                                     { silent: true }
//     //                                 )
//     //                                     .then(async (newPost) => {
//     //                                         // attach to spaces
//     //                                         const createMMSP = await SpacePost.create({
//     //                                             type: 'post',
//     //                                             relationship: 'direct',
//     //                                             creatorId: user.id,
//     //                                             postId: newPost.id,
//     //                                             spaceId: mmSpaceId,
//     //                                         })
//     //                                         const createTagSP = await Promise.all(
//     //                                             tags.map(
//     //                                                 async (tag) =>
//     //                                                     await new Promise((reso) => {
//     //                                                         SpacePost.create({
//     //                                                             type: 'post',
//     //                                                             relationship: 'direct',
//     //                                                             creatorId: user.id,
//     //                                                             postId: newPost.id,
//     //                                                             spaceId: tag.wecoId,
//     //                                                         })
//     //                                                             .then(() => reso())
//     //                                                             .catch(() => reso())
//     //                                                     })
//     //                                             )
//     //                                         )
//     //                                         Promise.all([createMMSP, createTagSP])
//     //                                             .then(() => resolve())
//     //                                             .catch((error) => resolve())
//     //                                     })
//     //                                     .catch((error) => {
//     //                                         resolve('error')
//     //                                     })
//     //                             })
//     //                     )
//     //             )
//     //                 .then(() => res.json('success'))
//     //                 .catch((error) => res.json('error'))
//     //             // // res.json(data)
//     //         })
//     //         .catch((error) => res.json('error'))
//     // }

//     //     // Step 3: Add comments
//     //     const comments = await new Promise((resolve) => {
//     //         client.query(
//     //             `SELECT * FROM posts WHERE user_id > 0 ORDER BY created_at ASC`,
//     //             (error, result) => {
//     //                 if (error) resolve('error')
//     //                 else
//     //                     resolve(
//     //                         // result.rows
//     //                         result.rows.map((comment) => {
//     //                             return {
//     //                                 mm_post_id: comment.topic_id,
//     //                                 mm_creator_id: comment.user_id,
//     //                                 text: comment.raw,
//     //                                 deleted: comment.deleted_at,
//     //                                 created_at: comment.created_at,
//     //                                 comment_number: comment.post_number,
//     //                                 reply_to_comment_number: comment.reply_to_post_number,
//     //                             }
//     //                         })
//     //                     )
//     //             }
//     //         )
//     //     })

//     //     Promise.all(
//     //         comments
//     //             .filter((c) => !c.reply_to_comment_number && c.comment_number > 1)
//     //             .map(
//     //                 async (comment) =>
//     //                     await new Promise(async (resolve) => {
//     //                         const matchingUser = await User.findOne({
//     //                             where: { mmId: comment.mm_creator_id },
//     //                         })
//     //                         const matchingPost = await Post.findOne({
//     //                             where: { mmId: comment.mm_post_id },
//     //                         })
//     //                         if (matchingUser && matchingPost) {
//     //                             Comment.create(
//     //                                 {
//     //                                     state: 'visible',
//     //                                     creatorId: matchingUser.id,
//     //                                     spaceId: mmSpaceId,
//     //                                     postId: matchingPost.id,
//     //                                     // parentCommentId,
//     //                                     text: comment.text,
//     //                                     createdAt: comment.created_at,
//     //                                     updatedAt: comment.created_at,
//     //                                     mmId: comment.mm_post_id,
//     //                                     mmCommentNumber: comment.comment_number,
//     //                                 },
//     //                                 { silent: true }
//     //                             )
//     //                                 .then(() => resolve())
//     //                                 .catch(() => resolve())
//     //                         } else resolve()
//     //                     })
//     //             )
//     //     )
//     //         .then(() => {
//     //             Promise.all(
//     //                 comments
//     //                     .filter((c) => c.reply_to_comment_number)
//     //                     .map(s
//     //                         async (comment) =>
//     //                             await new Promise(async (resolve) => {
//     //                                 const matchingUser = await User.findOne({
//     //                                     where: { mmId: comment.mm_creator_id },
//     //                                 })
//     //                                 const matchingPost = await Post.findOne({
//     //                                     where: { mmId: comment.mm_post_id },
//     //                                 })
//     //                                 if (matchingUser && matchingPost) {
//     //                                     const parentComment = await Comment.findOne({
//     //                                         where: {
//     //                                             postId: matchingPost.id,
//     //                                             mmCommentNumber: comment.reply_to_comment_number,
//     //                                         },
//     //                                     })
//     //                                     Comment.create(
//     //                                         {
//     //                                             state: 'visible',
//     //                                             creatorId: matchingUser.id,
//     //                                             spaceId: mmSpaceId,
//     //                                             postId: matchingPost.id,
//     //                                             parentCommentId: parentComment
//     //                                                 ? parentComment.parentCommentId ||
//     //                                                   parentComment.id
//     //                                                 : null,
//     //                                             text: comment.text,
//     //                                             createdAt: comment.created_at,
//     //                                             updatedAt: comment.created_at,
//     //                                             mmId: comment.mm_post_id,
//     //                                             mmCommentNumber: comment.comment_number,
//     //                                         },
//     //                                         { silent: true }
//     //                                     )
//     //                                         .then(() => resolve())
//     //                                         .catch(() => resolve())
//     //                                 } else resolve()
//     //                             })
//     //                     )
//     //             )
//     //                 .then(() => res.json('success'))
//     //                 .catch(() => res.json('error'))
//     //         })
//     //         .catch((error) => {
//     //             res.json('error')
//     //         })
//     // }
// })
