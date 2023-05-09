require('dotenv').config()
const config = require('../Config')
const express = require('express')
const router = express.Router()
const sgMail = require('@sendgrid/mail')
const ScheduledTasks = require('../ScheduledTasks')
const puppeteer = require('puppeteer')
const aws = require('aws-sdk')
const multer = require('multer')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const authenticateToken = require('../middleware/authenticateToken')
const {
    defaultPostValues,
    findFullPostAttributes,
    findPostInclude,
    postAccess,
    multerParams,
    noMulterErrors,
    convertAndUploadAudio,
    uploadBeadFile,
    sourcePostId,
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
    Image,
    UserPost,
    Poll,
    PollAnswer,
    Url,
    Audio,
} = require('../models')

// initialise
ffmpeg.setFfmpegPath(ffmpegPath)
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1',
})

let testIndex = 0

// testing
router.get('/test', async (req, res) => {
    if (testIndex > 0) {
        console.log('second attempt')
        res.send('second attempt')
    } else {
        console.log('first attempt')
        testIndex += 1

        // const posts = await Post.findAll({
        //     attributes: [
        //         'id',
        //         totalPostLikes('Post'),
        //         totalPostComments('Post'),
        //         totalPostLinks('Post'),
        //         totalPostRatings('Post'),
        //         totalPostReposts('Post'),
        //     ],
        // })

        // Promise.all(
        //     posts.map(
        //         async (post) =>
        //             await Post.update(
        //                 {
        //                     totalLikes: post.totalLikes,
        //                     totalComments: post.totalComments,
        //                     totalLinks: post.totalLinks,
        //                     totalRatings: post.totalRatings,
        //                     totalReposts: post.totalReposts,
        //                     totalGlassBeadGames: 0,
        //                 },
        //                 { where: { id: post.id }, silent: true }
        //             )
        //     )
        // )
        //     .then(() => res.status(200).json({ message: 'success' }))
        //     .catch((error) => res.status(500).json({ error }))
    }
})

// GET
router.get('/post-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.query
    const attributes = [
        postAccess(accountId),
        sourcePostId(),
        ...findFullPostAttributes('Post', accountId),
    ]
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
                where: { state: 'visible', type: 'post-post' },
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
                where: { state: 'visible', type: 'post-post' },
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
        where: { type: 'post', itemId: postId, parentCommentId: null },
        order: [['createdAt', 'ASC']],
        attributes: ['id', 'itemId', 'text', 'state', 'createdAt', 'updatedAt'],
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
                    'itemId',
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

router.get('/glass-bead-game-comments', (req, res) => {
    const { gameId } = req.query
    Comment.findAll({
        where: { type: 'glass-bead-game', itemId: gameId },
        order: [['createdAt', 'ASC']],
        attributes: ['id', 'itemId', 'text', 'state', 'createdAt', 'updatedAt'],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        },
    })
        .then((comments) => res.status(200).json(comments))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

// POST
router.post('/create-post', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { uploadType } = req.query

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        async function createPost(postData, files) {
            const {
                creatorName,
                creatorHandle,
                type,
                spaceIds,
                title,
                text,
                mentions,
                urls,
                images,
                startTime,
                endTime,
                pollType,
                pollAnswersLocked,
                pollAnswers,
                topic,
                topicGroup,
                topicImageUrl,
                gbgSettings,
                beads,
                sourcePostId,
                sourceCreatorId,
                cardFrontText,
                cardBackText,
                cardFrontWatermark,
                cardBackWatermark,
            } = postData

            const post = await Post.create({
                ...defaultPostValues,
                type,
                creatorId: accountId,
                title: title || null,
                text: text || null,
                lastActivity: new Date(),
            })

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

            const createUrls = await Promise.all(
                urls.map((urlData) =>
                    Url.create({
                        type: 'post',
                        itemId: post.id,
                        url: urlData.url,
                        image: urlData.image,
                        title: urlData.title,
                        description: urlData.description,
                        domain: urlData.domain,
                    })
                )
            )

            const createImages =
                type === 'image'
                    ? await Promise.all(
                          images.map((image, index) =>
                              Image.create({
                                  itemId: post.id,
                                  type: 'post',
                                  creatorId: accountId,
                                  index,
                                  url:
                                      image.url ||
                                      files.find((file) => Number(file.originalname) === index)
                                          .location,
                                  caption: image.caption,
                              })
                          )
                      )
                    : null

            const createAudio =
                type === 'audio'
                    ? await Audio.create({
                          itemId: post.id,
                          state: 'active',
                          type: 'post',
                          url: files[0].location,
                      })
                    : null

            const createEvent =
                type === 'event' || (type === 'glass-bead-game' && gbgSettings.startTime)
                    ? await Event.create({
                          postId: post.id,
                          state: 'active',
                          startTime: type === 'event' ? startTime : gbgSettings.startTime,
                          endTime: type === 'event' ? endTime : gbgSettings.endTime,
                      })
                    : null

            const createPoll =
                type === 'poll'
                    ? await new Promise(async (resolve) => {
                          const newPoll = await Poll.create({
                              postId: post.id,
                              type: pollType,
                              answersLocked: pollAnswersLocked,
                              // endTime: inquiryEndTime || null,
                          })
                          Promise.all(
                              pollAnswers.map((answer) =>
                                  PollAnswer.create({
                                      pollId: newPoll.id,
                                      creatorId: accountId,
                                      text: answer.text,
                                  })
                              )
                          ).then((answers) => resolve({ poll: newPoll, answers }))
                      })
                    : null

            const createGBG =
                type === 'glass-bead-game'
                    ? await new Promise(async (resolve) => {
                          const topicImageUpload = files.find((f) => f.fieldname === 'topicImage')

                          const createGame = await GlassBeadGame.create({
                              postId: post.id,
                              state: 'active',
                              locked: false,
                              topic,
                              topicGroup,
                              topicImage: topicImageUpload
                                  ? topicImageUpload.location
                                  : topicImageUrl || null,
                              synchronous: gbgSettings.synchronous,
                              multiplayer: gbgSettings.multiplayer,
                              nextMoveDeadline: gbgSettings.nextMoveDeadline || null,
                              allowedBeadTypes: gbgSettings.allowedBeadTypes
                                  .join(',')
                                  .toLowerCase(),
                              playerOrder:
                                  gbgSettings.players.length > 0
                                      ? gbgSettings.players.map((p) => p.id).join(',')
                                      : null,
                              totalMoves: gbgSettings.totalMoves || null,
                              movesPerPlayer: gbgSettings.movesPerPlayer || null,
                              moveDuration: gbgSettings.moveDuration || null,
                              moveTimeWindow: gbgSettings.moveTimeWindow || null,
                              characterLimit: gbgSettings.characterLimit || null,
                              introDuration: gbgSettings.introDuration || null,
                              outroDuration: gbgSettings.outroDuration || null,
                              intervalDuration: gbgSettings.intervalDuration || null,
                              backgroundImage: null,
                              backgroundVideo: null,
                              backgroundVideoStartTime: null,
                          })

                          const linkSourceBead = sourcePostId
                              ? await Link.create({
                                    state: 'visible',
                                    type: 'gbg-post',
                                    index: 0,
                                    relationship: 'source',
                                    creatorId: accountId,
                                    itemAId: post.id,
                                    itemBId: sourcePostId,
                                })
                              : null

                          const notifySourceCreator =
                              sourcePostId && sourceCreatorId !== accountId
                                  ? await new Promise(async (Resolve) => {
                                        const sourceCreator = await User.findOne({
                                            where: { id: sourceCreatorId },
                                            attributes: ['name', 'email'],
                                        })
                                        const notifyCreator = await Notification.create({
                                            type: 'new-gbg-from-your-post',
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
                                                Hi ${sourceCreator.name}, ${creatorName} just created a new glass bead game from your post on weco: https://${config.appURL}/p/${post.id}
                                            `,
                                            html: `
                                                <p>
                                                    Hi ${sourceCreator.name},
                                                    <br/>
                                                    <a href='${config.appURL}/u/${creatorHandle}'>${creatorName}</a>
                                                    just created a new <a href='${config.appURL}/p/${post.id}'>glass bead game</a> from your post on weco.
                                                </p>
                                            `,
                                        })
                                        Promise.all([notifyCreator, emailCreator])
                                            .then(() => Resolve())
                                            .catch((error) => Resolve(error))
                                    })
                                  : null

                          const createBeads = await Promise.all(
                              beads.map(
                                  (bead, index) =>
                                      new Promise(async (Resolve) => {
                                          const newBead = await Post.create({
                                              ...defaultPostValues,
                                              type: `gbg-${bead.type}`,
                                              creatorId: accountId,
                                              color: bead.color || null,
                                              text: bead.text || null,
                                              lastActivity: new Date(),
                                          })

                                          const createBeadUrl =
                                              bead.type === 'url'
                                                  ? await Url.create({
                                                        type: 'post',
                                                        itemId: newBead.id,
                                                        creatorId: accountId,
                                                        ...bead.Urls[0],
                                                    })
                                                  : null

                                          const createBeadAudio =
                                              bead.type === 'audio'
                                                  ? await Audio.create({
                                                        type: 'post',
                                                        itemId: newBead.id,
                                                        state: 'active',
                                                        url:
                                                            bead.Audios[0].url ||
                                                            files.find(
                                                                (file) =>
                                                                    Number(file.originalname) ===
                                                                    index
                                                            ).location,
                                                    })
                                                  : null

                                          const createBeadImage =
                                              bead.type === 'image'
                                                  ? await Image.create({
                                                        type: 'post',
                                                        itemId: newBead.id,
                                                        creatorId: accountId,
                                                        url:
                                                            bead.Images[0].url ||
                                                            files.find(
                                                                (file) =>
                                                                    Number(file.originalname) ===
                                                                    index
                                                            ).location,
                                                        caption: bead.Images[0].caption,
                                                    })
                                                  : null

                                          const createLink = await Link.create({
                                              state: 'visible',
                                              type: 'gbg-post',
                                              index: index + 1,
                                              creatorId: accountId,
                                              itemAId: post.id,
                                              itemBId: newBead.id,
                                          })

                                          Promise.all([
                                              createBeadUrl,
                                              createBeadAudio,
                                              createBeadImage,
                                              createLink,
                                          ]).then((data) =>
                                              Resolve({
                                                  newBead,
                                                  url: data[0],
                                                  audio: data[1],
                                                  image: data[2],
                                                  link: data[3],
                                              })
                                          )
                                      })
                              )
                          )

                          const setUpPlayers = await new Promise(async (Resolve) => {
                              const { multiplayer, players } = gbgSettings
                              if (multiplayer && players.length > 0) {
                                  const createRelationships = await Promise.all(
                                      players.map(
                                          async (player, index) =>
                                              await UserPost.create({
                                                  userId: player.id,
                                                  postId: post.id,
                                                  type: 'glass-bead-game',
                                                  relationship: 'player',
                                                  index: index + 1,
                                                  color: player.color,
                                                  state:
                                                      player.id === accountId
                                                          ? 'accepted'
                                                          : 'pending',
                                              })
                                      )
                                  )

                                  const otherPlayers = await User.findAll({
                                      where: {
                                          id: players
                                              .filter((p) => p.id !== accountId)
                                              .map((p) => p.id),
                                      },
                                      attributes: ['id', 'name', 'handle', 'email'],
                                  })

                                  const notifyOtherPlayers = await Promise.all(
                                      otherPlayers.map(
                                          async (player) =>
                                              await new Promise(async (res) => {
                                                  const createNotification =
                                                      await Notification.create({
                                                          type: 'gbg-invitation',
                                                          ownerId: player.id,
                                                          userId: accountId,
                                                          postId: post.id,
                                                          seen: false,
                                                          state: 'pending',
                                                      })

                                                  const sendEmail = await sgMail.send({
                                                      to: player.email,
                                                      from: {
                                                          email: 'admin@weco.io',
                                                          name: 'we { collective }',
                                                      },
                                                      subject: 'New notification',
                                                      text: `
                                            Hi ${player.name}, ${creatorName} just invited you to join a Weave on weco: https://${config.appURL}/p/${post.id}
                                            Log in and go to your notifications to accept or reject the invitation: https://${config.appURL}/u/${player.handle}/notifications
                                        `,
                                                      html: `
                                            <p>
                                                Hi ${player.name},
                                                <br/>
                                                <a href='${
                                                    config.appURL
                                                }/u/${creatorHandle}'>${creatorName}</a> just invited you to join a 
                                                <a href='${config.appURL}/p/${
                                                          post.id
                                                      }'>Weave</a> on weco.
                                                <br/>
                                                Log in and go to your <a href='${config.appURL}/u/${
                                                          player.handle
                                                      }/notifications'>notifications</a> 
                                                to accept or reject the invitation.
                                                <br/>
                                                <br/>
                                                Weave settings:
                                                <br/>
                                                <br/>
                                                Player order: ${players
                                                    .map((p) => p.name)
                                                    .join(' → ')}
                                                <br/>
                                                Turns (moves per player): ${
                                                    gbgSettings.movesPerPlayer
                                                }
                                                <br/>
                                                Allowed bead types: ${gbgSettings.allowedBeadTypes}
                                                <br/>
                                                Time window for moves: ${
                                                    gbgSettings.moveTimeWindow
                                                        ? `${gbgSettings.moveTimeWindow} minutes`
                                                        : 'Off'
                                                }
                                                <br/>
                                                Character limit: ${
                                                    gbgSettings.characterLimit
                                                        ? `${gbgSettings.characterLimit} characters`
                                                        : 'Off'
                                                }
                                                <br/>
                                                Audio time limit: ${
                                                    gbgSettings.moveDuration
                                                        ? `${gbgSettings.moveDuration} seconds`
                                                        : 'Off'
                                                }
                                                <br/>
                                            </p>
                                        `,
                                                  })
                                                  Promise.all([createNotification, sendEmail])
                                                      .then(() => res())
                                                      .catch((error) => res(error))
                                              })
                                      )
                                  )

                                  Promise.all([createRelationships, notifyOtherPlayers])
                                      .then(() => Resolve())
                                      .catch((error) => Resolve(error))
                              } else Resolve()
                          })
                          Promise.all([
                              createGame,
                              linkSourceBead,
                              notifySourceCreator,
                              createBeads,
                              setUpPlayers,
                          ])
                              .then((data) => resolve({ game: data[0], beads: data[3] }))
                              .catch((error) => resolve(error))
                      })
                    : null

            const createCard =
                type === 'card'
                    ? await new Promise(async (resolve) => {
                          const cardFrontImage = files.find((file) => file.originalname === 'front')
                          const cardBackImage = files.find((file) => file.originalname === 'back')
                          const createCardFront = await Post.create({
                              ...defaultPostValues,
                              type: 'card-front',
                              creatorId: accountId,
                              text: cardFrontText || null,
                              watermark: cardFrontWatermark,
                              lastActivity: new Date(),
                          })
                          const createCardBack = await Post.create({
                              ...defaultPostValues,
                              type: 'card-back',
                              creatorId: accountId,
                              text: cardBackText || null,
                              watermark: cardBackWatermark,
                              lastActivity: new Date(),
                          })
                          const linkCardFront = await Link.create({
                              state: 'visible',
                              type: 'card-post',
                              // relationship: 'front',
                              creatorId: accountId,
                              itemAId: post.id,
                              itemBId: createCardFront.id,
                          })
                          const linkCardBack = await Link.create({
                              state: 'visible',
                              type: 'card-post',
                              // relationship: 'back',
                              creatorId: accountId,
                              itemAId: post.id,
                              itemBId: createCardBack.id,
                          })
                          const createCardFrontImage = cardFrontImage
                              ? await Image.create({
                                    type: 'post',
                                    itemId: createCardFront.id,
                                    creatorId: accountId,
                                    url: cardFrontImage.location,
                                })
                              : null
                          const createCardBackImage = cardBackImage
                              ? await Image.create({
                                    type: 'post',
                                    itemId: createCardBack.id,
                                    creatorId: accountId,
                                    url: cardBackImage.location,
                                })
                              : null

                          Promise.all([
                              createCardFront,
                              createCardBack,
                              linkCardFront,
                              linkCardBack,
                              createCardFrontImage,
                              createCardBackImage,
                          ])
                              .then((data) =>
                                  resolve({
                                      front: {
                                          ...data[0].dataValues,
                                          Images: cardFrontImage ? [data[4].dataValues] : [],
                                      },
                                      back: {
                                          ...data[1].dataValues,
                                          Images: cardBackImage ? [data[5].dataValues] : [],
                                      },
                                  })
                              )
                              .catch((error) => resolve(error))
                      })
                    : null

            Promise.all([
                createDirectRelationships,
                createIndirectRelationships,
                notifyMentions,
                createUrls,
                createImages,
                createAudio,
                createEvent,
                createPoll,
                createGBG,
                createCard,
            ]).then((data) => {
                res.status(200).json({
                    post,
                    indirectSpaces: data[1],
                    images: data[4],
                    audio: data[5],
                    event: data[6],
                    pollData: data[7],
                    gbg: data[8],
                    card: data[9],
                })
            })
        }

        if (uploadType === 'image-file') {
            multer(multerParams(uploadType, accountId)).any('file')(req, res, (error) => {
                const { files, body } = req
                if (noMulterErrors(error, res)) createPost(JSON.parse(body.postData), files)
            })
        } else if (uploadType === 'audio-file') {
            multer(multerParams(uploadType, accountId)).single('file')(req, res, (error) => {
                const { file, body } = req
                if (noMulterErrors(error, res)) createPost(JSON.parse(body.postData), [file])
            })
        } else if (uploadType === 'audio-blob') {
            multer(multerParams(uploadType, accountId)).single('file')(req, res, (error) => {
                const { file, body } = req
                if (noMulterErrors(error, res)) {
                    convertAndUploadAudio(file, accountId, 'post').then((location) =>
                        createPost(JSON.parse(body.postData), [{ location }])
                    )
                }
            })
        } else if (uploadType === 'glass-bead-game') {
            multer(multerParams(uploadType, accountId)).any()(req, res, (error) => {
                const { files, body } = req
                if (noMulterErrors(error, res)) {
                    Promise.all(
                        files.map(
                            async (file) =>
                                await new Promise((resolve) => {
                                    if (file.fieldname === 'audioBlob') {
                                        convertAndUploadAudio(file, accountId, 'bead').then((url) =>
                                            resolve({ ...file, location: url })
                                        )
                                    } else if (file.fieldname !== 'postData') {
                                        uploadBeadFile(file, accountId).then((url) =>
                                            resolve({ ...file, location: url })
                                        )
                                    }
                                })
                        )
                    ).then((newFiles) => {
                        createPost(JSON.parse(body.postData), newFiles)
                    })
                }
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

router.post('/create-next-bead', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { uploadType } = req.query

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        async function createBead(beadData, files) {
            const {
                creatorName,
                creatorHandle,
                postId,
                mentions,
                type,
                text,
                color,
                Audios,
                Urls,
                Images,
            } = beadData

            const bead = await Post.create({
                ...defaultPostValues,
                type: `gbg-${type}`,
                creatorId: accountId,
                color: color || null,
                text: text || null,
                lastActivity: new Date(),
            })

            const createUrl =
                type === 'url'
                    ? await Url.create({
                          itemId: bead.id,
                          type: 'post',
                          creatorId: accountId,
                          url: Urls[0].url,
                          image: Urls[0].image,
                          title: Urls[0].title,
                          description: Urls[0].description,
                          domain: Urls[0].domain,
                      })
                    : null

            const createAudio =
                type === 'audio'
                    ? await Audio.create({
                          itemId: bead.id,
                          type: 'post',
                          state: 'active',
                          url: Audios[0].url || files[0].location,
                      })
                    : null

            const createImage =
                type === 'image'
                    ? await Image.create({
                          itemId: bead.id,
                          type: 'post',
                          creatorId: accountId,
                          url: Images[0].url || files[0].location,
                          caption: Images[0].caption,
                      })
                    : null

            const notifyMentions =
                type === 'text'
                    ? await new Promise((resolve) => {
                          User.findAll({
                              where: { handle: mentions, state: 'active' },
                              attributes: ['id', 'name', 'email'],
                          })
                              .then((users) => {
                                  Promise.all(
                                      users.map(
                                          (user) =>
                                              new Promise(async (reso) => {
                                                  const sendNotification =
                                                      await Notification.create({
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
                    : null

            const post = await Post.findOne({
                where: { id: postId },
                include: [
                    {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'name', 'handle', 'email'],
                    },
                    {
                        model: GlassBeadGame,
                    },
                    {
                        model: User,
                        as: 'Players',
                        attributes: ['id', 'name', 'handle', 'email'],
                        through: {
                            where: { type: 'glass-bead-game' },
                            attributes: ['index'],
                        },
                    },
                    {
                        model: Post,
                        as: 'Beads',
                        required: false,
                        through: {
                            where: { state: 'visible' },
                            attributes: ['index'],
                        },
                        include: {
                            model: User,
                            as: 'Creator',
                            attributes: ['id', 'name', 'handle', 'email'],
                        },
                    },
                ],
            })

            const createLink = await Link.create({
                state: 'visible',
                type: 'gbg-post',
                index: post.Beads.length + 1,
                creatorId: accountId,
                itemAId: postId,
                itemBId: bead.id,
            })

            const notifyPlayers = await new Promise(async (resolve) => {
                const { synchronous, multiplayer, moveTimeWindow, movesPerPlayer, playerOrder } =
                    post.GlassBeadGame
                if (synchronous || !multiplayer) resolve()
                else {
                    // find other players to notify
                    let otherPlayers = []
                    if (post.Players.length) {
                        // if restricted game, use linked Players
                        otherPlayers = post.Players.filter((p) => p.id !== accountId)
                    } else {
                        // if open game, use linked Bead Creators
                        post.Beads.forEach((bead) => {
                            // filter out game creator and existing records
                            if (
                                bead.Creator.id !== accountId &&
                                !otherPlayers.find((p) => p.id === bead.Creator.id)
                            )
                                otherPlayers.push(bead.Creator)
                        })
                    }
                    // notify players
                    const sendNotifications = await Promise.all(
                        otherPlayers.map(
                            (p) =>
                                new Promise(async (Resolve) => {
                                    const notifyPlayer = await Notification.create({
                                        type: 'gbg-move-from-other-player',
                                        ownerId: p.id,
                                        postId: postId,
                                        userId: accountId,
                                        seen: false,
                                    })
                                    const emailPlayer = await sgMail.send({
                                        to: p.email,
                                        from: { email: 'admin@weco.io', name: 'we { collective }' },
                                        subject: 'New notification',
                                        text: `
                                            Hi ${p.name}, ${creatorName} just added a new bead.
                                            https://${config.appURL}/p/${postId}
                                        `,
                                        html: `
                                            <p>
                                                Hi ${p.name},
                                                <br/>
                                                <a href='${config.appURL}/u/${creatorHandle}'>${creatorName}</a>
                                                just added a new <a href='${config.appURL}/p/${postId}'>bead</a>.
                                            </p>
                                        `,
                                    })
                                    Promise.all([notifyPlayer, emailPlayer])
                                        .then(() => Resolve())
                                        .catch((error) => Resolve(error))
                                })
                        )
                    )
                    // schedule next deadline
                    const scheduleNewDeadline = moveTimeWindow
                        ? await new Promise(async (Resolve) => {
                              const gameFinished =
                                  movesPerPlayer &&
                                  post.Beads.length + 1 >= movesPerPlayer * post.Players.length
                              if (gameFinished) {
                                  GlassBeadGame.update(
                                      { state: 'finished', nextMoveDeadline: null },
                                      { where: { postId } }
                                  )
                                      .then(() => Resolve())
                                      .catch(() => Resolve())
                              } else {
                                  const newDeadline = new Date(
                                      new Date().getTime() + moveTimeWindow * 60 * 1000
                                  )
                                  const updateDeadline = await GlassBeadGame.update(
                                      { nextMoveDeadline: newDeadline },
                                      { where: { postId } }
                                  )
                                  // notify next player
                                  const order = playerOrder.split(',')
                                  const nextPlayerId =
                                      +order[(post.Beads.length + 1) % post.Players.length]
                                  const nextPlayer = post.Players.find((p) => p.id === nextPlayerId)
                                  const nextMoveNumber = post.Beads.length + 1
                                  const createMoveNotification = await Notification.create({
                                      type: 'gbg-move',
                                      ownerId: nextPlayer.id,
                                      postId: postId,
                                      seen: false,
                                  })
                                  const sendMoveEmail = await sgMail.send({
                                      to: nextPlayer.email,
                                      from: { email: 'admin@weco.io', name: 'we { collective }' },
                                      subject: 'New notification',
                                      text: `
                                            Hi ${nextPlayer.name}, it's your move!
                                            Add a new bead to the glass bead game: https://${config.appURL}/p/${postId}
                                        `,
                                      html: `
                                            <p>
                                                Hi ${nextPlayer.name},
                                                <br/>
                                                It's your move!
                                                <br/>
                                                Add a new bead to the <a href='${config.appURL}/p/${postId}'>glass bead game</a>.
                                            </p>
                                        `,
                                  })
                                  const scheduleGBGMoveJobs = ScheduledTasks.scheduleGBGMoveJobs(
                                      postId,
                                      nextPlayer,
                                      nextMoveNumber,
                                      newDeadline
                                  )
                                  Promise.all([
                                      updateDeadline,
                                      createMoveNotification,
                                      sendMoveEmail,
                                      scheduleGBGMoveJobs,
                                  ])
                                      .then(() => Resolve(newDeadline))
                                      .catch(() => Resolve())
                              }
                          })
                        : null

                    Promise.all([sendNotifications, scheduleNewDeadline])
                        .then((data) => resolve(data[1]))
                        .catch((error) => resolve(error))
                }
            })

            const updateLastPostActivity = await Post.update(
                { lastActivity: new Date() },
                { where: { id: postId }, silent: true }
            )

            Promise.all([
                createUrl,
                createAudio,
                createImage,
                notifyMentions,
                createLink,
                notifyPlayers,
                updateLastPostActivity,
            ])
                .then((data) =>
                    res.status(200).json({
                        bead,
                        url: data[0],
                        audio: data[1],
                        image: data[2],
                        link: data[4],
                        newDeadline: data[5],
                    })
                )
                .catch((error) => res.status(500).json({ message: 'Error', error }))
        }

        if (uploadType === 'image-file') {
            multer(multerParams(uploadType, accountId)).any('file')(req, res, (error) => {
                const { files, body } = req
                if (noMulterErrors(error, res)) createBead(JSON.parse(body.beadData), files)
            })
        } else if (uploadType === 'audio-file') {
            multer(multerParams(uploadType, accountId)).single('file')(req, res, (error) => {
                const { file, body } = req
                if (noMulterErrors(error, res)) createBead(JSON.parse(body.beadData), [file])
            })
        } else if (uploadType === 'audio-blob') {
            multer(multerParams(uploadType, accountId)).single('file')(req, res, (error) => {
                const { file, body } = req
                if (noMulterErrors(error, res)) {
                    convertAndUploadAudio(file, accountId, 'post').then((location) =>
                        createBead(JSON.parse(body.beadData), [{ location }])
                    )
                }
            })
        } else {
            createBead(req.body)
        }
    }
})

router.post('/repost-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, postId, spaceId, spaceIds } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId },
            attributes: ['totalReposts'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'name', 'email'],
            },
        })

        const updateTotalReposts = await Post.update(
            { totalReposts: post.totalReposts + spaceIds.length },
            { where: { id: postId }, silent: true }
        )

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
            updateTotalReposts,
            sendNotification,
            sendEmail,
            createReactions,
            createDirectRelationships,
            createIndirectRelationships,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
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
            attributes: ['totalLikes'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        })

        const updateTotalLikes = await Post.update(
            { totalLikes: post.totalLikes + 1 },
            { where: { id: postId }, silent: true }
        )

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

        Promise.all([updateTotalLikes, createReaction, createNotification, sendEmail])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-like', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId },
            attributes: ['totalLikes'],
        })

        const updateTotalLikes = await Post.update(
            { totalLikes: post.totalLikes - 1 },
            { where: { id: postId }, silent: true }
        )

        const removeReaction = await Reaction.update(
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

        Promise.all([updateTotalLikes, removeReaction])
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
            attributes: ['totalRatings'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        })

        const updateTotalRatings = await Post.update(
            { totalRatings: post.totalRatings + 1 },
            { where: { id: postId }, silent: true }
        )

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

        Promise.all([updateTotalRatings, createReaction, sendNotification, sendEmail])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-rating', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId },
            attributes: ['totalRatings'],
        })

        const updateTotalRatings = await Post.update(
            { totalRatings: post.totalRatings - 1 },
            { where: { id: postId }, silent: true }
        )

        const removeReaction = await Reaction.update(
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

        Promise.all([updateTotalRatings, removeReaction])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/add-link', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, spaceId, description, itemAId, itemBId } = req.body
    const itemB = await Post.findOne({
        where: { id: itemBId },
        attributes: ['id', 'totalLinks'],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
        },
    })

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
            attributes: ['totalLinks'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        })

        const updatePostATotalLinks = await Post.update(
            { totalLinks: itemA.totalLinks + 1 },
            { where: { id: itemAId }, silent: true }
        )

        const updatePostBTotalLinks = await Post.update(
            { totalLinks: itemB.totalLinks + 1 },
            { where: { id: itemBId }, silent: true }
        )

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

        Promise.all([
            createLink,
            updatePostATotalLinks,
            updatePostBTotalLinks,
            sendNotification,
            sendEmail,
        ])
            .then((data) => res.status(200).json({ itemB, link: data[0], message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-link', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    let { linkId, itemAId, itemBId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const itemA = await Post.findOne({
            where: { id: itemAId },
            attributes: ['totalLinks'],
        })

        const itemB = await Post.findOne({
            where: { id: itemBId },
            attributes: ['totalLinks'],
        })

        const updatePostATotalLinks = await Post.update(
            { totalLinks: itemA.totalLinks - 1 },
            { where: { id: itemAId }, silent: true }
        )

        const updatePostBTotalLinks = await Post.update(
            { totalLinks: itemB.totalLinks - 1 },
            { where: { id: itemBId }, silent: true }
        )

        const removeLink = await Link.update({ state: 'deleted' }, { where: { id: linkId } })

        Promise.all([updatePostATotalLinks, updatePostBTotalLinks, removeLink])
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
            attributes: ['totalComments'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        })

        const updateLastPostActivity = await Post.update(
            { lastActivity: new Date(), totalComments: post.totalComments + 1 },
            { where: { id: postId }, silent: true }
        )

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
            type: 'post',
            itemId: postId,
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

        Promise.all([
            updateLastPostActivity,
            notifyPostCreator,
            notifyCommentCreator,
            notifyReplyCreator,
            notifyMentions,
        ])
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

router.post('/delete-comment', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, commentId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId },
            attributes: ['totalComments'],
        })

        const updateTotalComments = await Post.update(
            { totalComments: post.totalComments - 1 },
            { where: { id: postId }, silent: true }
        )

        const removeComment = await Comment.update(
            { state: 'deleted' },
            { where: { id: commentId, creatorId: accountId } }
        )

        Promise.all([updateTotalComments, removeComment])
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

router.post('/vote-on-poll', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userName, userHandle, spaceId, postId, voteData } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId },
            attributes: [],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath', 'email'],
            },
        })

        const removeOldReactions = await Reaction.update(
            { state: 'removed' },
            { where: { state: 'active', userId: accountId, postId } }
        )

        const createNewReactions = await Promise.all(
            voteData.map((answer) =>
                Reaction.create({
                    type: 'poll-vote',
                    value: answer.value || null,
                    state: 'active',
                    spaceId,
                    userId: accountId,
                    postId,
                    pollAnswerId: answer.id,
                })
            )
        )

        const createNotification =
            post.Creator.id !== accountId
                ? await Notification.create({
                      ownerId: post.Creator.id,
                      type: 'poll-vote',
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
                Hi ${post.Creator.name}, ${userName} just voted on your Poll:
                http://${config.appURL}/p/${postId}
            `,
                      html: `
                <p>
                    Hi ${post.Creator.name},
                    <br/>
                    <a href='${config.appURL}/u/${userHandle}'>${userName}</a>
                    just voted on your
                    <a href='${config.appURL}/p/${postId}'>Poll</a>
                </p>
            `,
                  })
                : null

        const updateLastPostActivity = await Post.update(
            { lastActivity: new Date() },
            { where: { id: postId }, silent: true }
        )

        Promise.all([
            removeOldReactions,
            createNewReactions,
            createNotification,
            sendEmail,
            updateLastPostActivity,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/new-poll-answer', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { pollId, newAnswer } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        PollAnswer.create({
            pollId,
            creatorId: accountId,
            text: newAnswer,
        })
            .then((pollAnswer) => res.status(200).json({ pollAnswer }))
            .catch((error) => res.status(500).json({ error }))
    }
})

// todo: add authenticateToken to all endpoints below
router.post('/save-glass-bead-game', async (req, res) => {
    const { postId } = req.body

    const updateLinks = await Link.update(
        { state: 'visible' },
        { where: { type: 'gbg-post', itemAId: postId, state: 'draft' } }
    )
    const updateGame = await GlassBeadGame.update({ locked: true }, { where: { postId } })

    Promise.all([updateLinks, updateGame])
        .then(() => res.status(200).send({ message: 'Game saved' }))
        .catch((error) => res.status(500).json({ error }))

    // GlassBeadGame.update({ locked: true }, { where: { id: gameId, locked: false } }).then(() => {
    //     beads.forEach((bead) => {
    //         GlassBead.create({
    //             gameId,
    //             index: bead.index,
    //             userId: bead.user.id,
    //             beadUrl: bead.beadUrl,
    //             state: 'visible',
    //         })
    //     })
    //     res.status(200).send({ message: 'Game saved' })
    // })
})

router.post('/glass-bead-game-comment', (req, res) => {
    const { gameId, userId, text } = req.body
    Comment.create({
        state: 'visible',
        type: 'glass-bead-game',
        itemId: gameId,
        creatorId: userId,
        text,
    })
        .then(() => res.status(200).send({ message: 'Success' }))
        .catch((error) => res.status(500).json({ error }))

    // GlassBeadGameComment.create({
    //     gameId,
    //     userId,
    //     text,
    // }).then(res.status(200).send({ message: 'Success' }))
})

router.post('/save-glass-bead-game-settings', async (req, res) => {
    const {
        postId,
        gameId,
        playerOrder,
        introDuration,
        movesPerPlayer,
        moveDuration,
        intervalDuration,
        outroDuration,
    } = req.body

    const removeDraftBeads = await Link.update(
        { state: 'deleted' },
        { where: { type: 'gbg-post', itemAId: postId, state: 'draft' } }
    )
    const updateGame = await GlassBeadGame.update(
        {
            playerOrder,
            introDuration,
            movesPerPlayer,
            moveDuration,
            intervalDuration,
            outroDuration,
        },
        { where: { id: gameId } }
    )

    Promise.all([removeDraftBeads, updateGame])
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
            include: {
                model: Event,
                attributes: ['id'],
                required: false,
            },
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
