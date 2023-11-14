require('dotenv').config()
const config = require('../Config')
const express = require('express')
const router = express.Router()
const sgMail = require('@sendgrid/mail')
const ScheduledTasks = require('../ScheduledTasks')
const { v4: uuidv4 } = require('uuid')
const puppeteer = require('puppeteer')
const aws = require('aws-sdk')
const multer = require('multer')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const authenticateToken = require('../middleware/authenticateToken')
const sequelize = require('sequelize')
const Op = sequelize.Op
const {
    defaultPostValues,
    findFullPostAttributes,
    findPostInclude,
    findCommentAttributes,
    postAccess,
    multerParams,
    noMulterErrors,
    convertAndUploadAudio,
    uploadBeadFile,
    sourcePostId,
    getLinkedItem,
    getFullLinkedItem,
    accountLike,
    accountMuted,
    attachParentSpace,
} = require('../Helpers')
const {
    Space,
    SpacePost,
    SpaceUser,
    SpaceUserStat,
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

// testing
let testIndex = 0
router.get('/test', async (req, res) => {
    if (testIndex > 0) {
        console.log('second attempt')
        res.send('second attempt')
    } else {
        console.log('first attempt')
        testIndex += 1
    }
})

// GET
router.get('/post-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.query
    const post = await Post.findOne({
        where: { id: postId, state: 'visible' },
        include: findPostInclude(accountId),
        attributes: [
            postAccess(accountId),
            sourcePostId(),
            ...findFullPostAttributes('Post', accountId),
        ],
    })
    if (!post) res.status(404).json({ message: 'Post not found' })
    else if (!post.dataValues.access) res.status(401).json({ message: 'Access denied' })
    else if (post.state === 'deleted') res.status(401).json({ message: 'Post deleted' })
    else res.status(200).json(post)
})

router.get('/comment-data', authenticateToken, async (req, res) => {
    // todo: add access check
    const accountId = req.user ? req.user.id : null
    const { commentId } = req.query
    const comment = await Comment.findOne({
        where: { id: commentId, state: 'visible' },
        attributes: [
            'id',
            'text',
            'itemId',
            'parentCommentId',
            'createdAt',
            'updatedAt',
            'totalLikes',
            'totalLinks',
        ],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        },
    })
    if (!comment) res.status(404).json({ message: 'Comment not found' })
    // else if (!post.dataValues.access) res.status(401).json({ message: 'Access denied' })
    // else if (post.state === 'deleted') res.status(401).json({ message: 'Post deleted' })
    else res.status(200).json(comment)
})

router.get('/likes', async (req, res) => {
    const { itemType, itemId } = req.query
    Reaction.findAll({
        where: { itemType, itemId, type: 'like', state: 'active' },
        attributes: ['id'],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        },
    })
        .then((reactions) => res.status(200).json(reactions))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/post-reposts', async (req, res) => {
    const { postId } = req.query
    Reaction.findAll({
        where: { itemType: 'post', itemId: postId, type: 'repost', state: 'active' },
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

router.get('/ratings', async (req, res) => {
    const { itemType, itemId } = req.query
    Reaction.findAll({
        where: { itemType, itemId, type: 'rating', state: 'active' },
        attributes: ['id', 'value'],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        },
    })
        .then((reactions) => res.status(200).json(reactions))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/links', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { itemType, itemId, linkTypes } = req.query
    const sourceItem = await getFullLinkedItem(itemType, itemId, accountId)
    if (!sourceItem) res.status(404).send({ message: 'Source not found' })
    else {
        sourceItem.setDataValue('uuid', uuidv4())
        sourceItem.setDataValue('parentItemId', null)
        if (['user', 'space'].includes(itemType)) {
            sourceItem.setDataValue('totalLikes', 0)
            sourceItem.setDataValue('totalLinks', 0)
        }

        // todo: seperate out Link table 'type' field into 'itemAType' and 'itemBType' or 'sourceType' and 'targetType'
        function findTypes(modelType, direction) {
            const post = direction === 'incoming' ? `post-${modelType}` : `${modelType}-post`
            const comment =
                direction === 'incoming' ? `comment-${modelType}` : `${modelType}-comment`
            const user = direction === 'incoming' ? `user-${modelType}` : `${modelType}-user`
            const space = direction === 'incoming' ? `space-${modelType}` : `${modelType}-space`
            if (linkTypes === 'All Types') return [post, comment, user, space]
            if (linkTypes === 'Posts') return [post]
            if (linkTypes === 'Comments') return [comment]
            if (linkTypes === 'Spaces') return [user]
            if (linkTypes === 'Users') return [space]
        }

        async function getLinkedItems(source, depth) {
            return new Promise(async (resolve) => {
                const { id, modelType, parentItemId } = source.dataValues
                // console.log(666, 'parentItemId', parentItemId)
                const links = await Link.findAll({
                    limit: depth === 0 ? 10 : 5,
                    order: [['totalLikes', 'DESC']],
                    attributes: [
                        'id',
                        'itemAId',
                        'itemBId',
                        'type',
                        'description',
                        'totalLikes',
                        'createdAt',
                    ],
                    where: {
                        state: 'visible',
                        [Op.or]: [
                            {
                                // incoming
                                itemBId: id,
                                itemAId: { [Op.not]: parentItemId },
                                type: findTypes(modelType, 'incoming'),
                            },
                            {
                                // outgoing
                                itemAId: id,
                                itemBId: { [Op.not]: parentItemId },
                                type: findTypes(modelType, 'outgoing'),
                            },
                        ],
                    },
                })
                const linkedItems = []
                Promise.all(
                    links.map(async (link) => {
                        link.setDataValue('uuid', uuidv4())
                        const types = link.type.split('-')
                        const itemAType = types[0]
                        const itemBType = types[1]
                        // incoming links
                        if (link.itemAId === id && itemAType === modelType) {
                            link.setDataValue('direction', 'outgoing')
                            const item = await getLinkedItem(itemBType, link.itemBId)
                            if (item) {
                                item.setDataValue('uuid', uuidv4())
                                item.setDataValue('parentItemId', id)
                                if (['user', 'space'].includes(itemBType)) {
                                    item.setDataValue('totalLikes', 0)
                                    item.setDataValue('totalLinks', 0)
                                }
                                linkedItems.push({ item, Link: link })
                            }
                        }
                        // outgoing links
                        if (link.itemBId === id && itemBType === modelType) {
                            link.setDataValue('direction', 'incoming')
                            const item = await getLinkedItem(itemAType, link.itemAId)
                            if (item) {
                                item.setDataValue('uuid', uuidv4())
                                item.setDataValue('parentItemId', id)
                                if (['user', 'space'].includes(itemBType)) {
                                    item.setDataValue('totalLikes', 0)
                                    item.setDataValue('totalLinks', 0)
                                }
                                linkedItems.push({ item, Link: link })
                            }
                        }
                    })
                )
                    .then(() => {
                        source.setDataValue(
                            'children',
                            linkedItems.sort((a, b) => b.Link.totalLikes - a.Link.totalLikes)
                        )
                        // source.setDataValue(
                        //     'children',
                        //     linkedItems.sort(
                        //         (a, b) =>
                        //             new Date(a.Link.createdAt).getTime() -
                        //             new Date(b.Link.createdAt).getTime()
                        //     )
                        // )
                        source.setDataValue('depth', depth)
                        if (linkedItems.length && depth < 2)
                            Promise.all(
                                linkedItems.map(
                                    async (child) => await getLinkedItems(child.item, depth + 1)
                                )
                            ).then(() => resolve())
                        else resolve()
                    })
                    .catch((error) => resolve(error))
            })
        }

        getLinkedItems(sourceItem, 0).then(() => res.json({ item: sourceItem }))
    }
})

router.get('/link-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { linkId } = req.query
    const link = await Link.findOne({
        where: { id: linkId },
        attributes: [
            'id',
            'type',
            'description',
            'itemAId',
            'itemBId',
            'totalLikes',
            'createdAt',
            accountLike('link', 'Link', accountId),
        ],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        },
    })
    const types = link.type.split('-')
    const source = await getFullLinkedItem(types[0], link.itemAId, accountId)
    const target = await getFullLinkedItem(types[1], link.itemBId, accountId)
    res.status(200).json({ source, link, target })
})

router.get('/target-from-text', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { type, sourceId, text, userId } = req.query

    if (type === 'Post') {
        const where = {
            state: 'visible',
            [Op.or]: [{ text: { [Op.like]: `%${text}%` } }, { title: { [Op.like]: `%${text}%` } }],
        }
        if (sourceId) where[Op.not] = { id: sourceId }
        if (userId) where.creatorId = userId
        const matchingPosts = await Post.findAll({
            where,
            limit: 10,
            include: findPostInclude(accountId),
        })
        res.status(200).json(matchingPosts)
    }

    if (type === 'Comment') {
        const where = {
            state: 'visible',
            text: { [Op.like]: `%${text}%` },
        }
        if (sourceId) where[Op.not] = { id: sourceId }
        if (userId) where.creatorId = userId
        const matchingComments = await Comment.findAll({
            where,
            limit: 10,
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        })
        res.status(200).json(matchingComments)
    }
})

router.get('/post-comments', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.query

    Comment.findAll({
        where: { itemType: 'post', itemId: postId, parentCommentId: null },
        order: [['createdAt', 'ASC']],
        attributes: findCommentAttributes('Comment', accountId),
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
                attributes: findCommentAttributes('Comment', accountId),
                include: {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                },
            },
        ],
    })
        .then((comments) => res.status(200).json(comments))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/post-indirect-spaces', async (req, res) => {
    const { postId } = req.query
    const post = await Post.findOne({
        where: { id: postId },
        include: {
            model: Space,
            as: 'IndirectSpaces',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
            through: { where: { relationship: 'indirect' }, attributes: [] },
        },
    })
    res.status(200).json(post.IndirectSpaces)
})

router.get('/poll-data', (req, res) => {
    const { postId } = req.query
    Poll.findOne({
        where: { postId: postId },
        attributes: ['id', 'type', 'answersLocked'],
        include: {
            model: PollAnswer,
            attributes: ['id', 'text', 'state', 'createdAt'],
            where: { state: { [Op.or]: ['active', 'done'] } },
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: ['handle', 'name', 'flagImagePath'],
                },
                {
                    model: Reaction,
                    where: { itemType: 'poll-answer' },
                    required: false,
                    attributes: ['value', 'state', 'itemId', 'createdAt', 'updatedAt'],
                    include: {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    },
                },
            ],
            required: false,
        },
    })
        .then((pollData) => res.status(200).json(pollData))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/gbg-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.query
    const post = await Post.findOne({ where: { id: postId }, attributes: ['id'] })
    const beads = await post.getBeads({
        attributes: [...findFullPostAttributes('Post', accountId), 'color'],
        through: {
            // todo: handle account deleted as well (visible used to hide drafts)
            where: { type: 'gbg-post', state: ['visible', 'account-deleted'] },
            attributes: ['index', 'relationship', 'state'],
        },
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
            {
                model: Url,
                attributes: ['id', 'url', 'image', 'title', 'description', 'domain'],
            },
            {
                model: Audio,
                attributes: ['url'],
            },
            {
                model: Image,
                attributes: ['id', 'index', 'url', 'caption'],
            },
        ],
    })
    const players = await post.getPlayers({
        attributes: ['id', 'handle', 'name', 'flagImagePath', 'state'],
        through: {
            where: { type: 'glass-bead-game' },
            attributes: ['index', 'state', 'color'],
        },
    })

    res.status(200).json({ beads, players })
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

router.get('/scrape-url', authenticateToken, async (req, res) => {
    // todo: return error code intead of empty data if error, set up timeout
    const accountId = req.user ? req.user.id : null
    const { url } = req.query
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const browser = await puppeteer.launch() // { headless: false })
        try {
            const page = await browser.newPage()
            await page.goto(url, { waitUntil: 'domcontentloaded' }) // { timeout: 60000 }, { waitUntil: 'load', 'domcontentloaded', 'networkidle0', 'networkidle2' }
            await page.evaluate(async () => {
                const youtubeCookieConsent = await document.querySelector(
                    'base[href="https://consent.youtube.com/"]'
                )
                if (youtubeCookieConsent) {
                    const rejectButton = await document.querySelector(
                        'button[aria-label="Reject all"]'
                    )
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
    }
})

router.get('/glass-bead-game-comments', (req, res) => {
    const { gameId } = req.query
    Comment.findAll({
        where: { itemType: 'glass-bead-game', itemId: gameId },
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
                governance,
                pollAction,
                pollThreshold,
                topicGroup,
                topicImageUrl,
                gbgSettings,
                beads,
                sourcePostId,
                sourceCreatorId,
                cardFrontText,
                cardFrontSearchableText,
                cardBackText,
                cardBackSearchableText,
                cardFrontWatermark,
                cardBackWatermark,
                searchableText,
                sourceType,
                sourceId,
                linkDescription,
            } = postData

            const post = await Post.create({
                ...defaultPostValues,
                type,
                creatorId: accountId,
                title: title || null,
                text: text || null,
                searchableText,
                lastActivity: new Date(),
            })

            const createDirectRelationships = await Promise.all(
                spaceIds.map(
                    (spaceId) =>
                        new Promise(async (resolve) => {
                            const createSpacePost = await SpacePost.create({
                                type: 'post',
                                relationship: 'direct',
                                creatorId: accountId,
                                postId: post.id,
                                spaceId,
                                state: 'active',
                            })
                            const updateTotalPosts = await Space.increment('totalPosts', {
                                where: { id: spaceId },
                                silent: true,
                            })
                            Promise.all([createSpacePost, updateTotalPosts])
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        })
                )
            )

            const createIndirectRelationships = await new Promise(async (resolve1) => {
                const spaces = await Space.findAll({
                    where: { id: spaceIds, state: 'active' },
                    attributes: ['id'],
                    include: {
                        model: Space,
                        as: 'SpaceAncestors',
                        attributes: ['id'],
                        through: { where: { state: 'open' }, attributes: [] },
                    },
                })
                // gather ancestor ids
                const ids = []
                spaces.forEach((space) =>
                    ids.push(...space.SpaceAncestors.map((space) => space.id))
                )
                // remove duplicates and direct spaces
                const filteredIds = [...new Set(ids)].filter((id) => !spaceIds.includes(id))
                Promise.all(
                    filteredIds.map(
                        (id) =>
                            new Promise(async (resolve2) => {
                                const createSpacePost = await SpacePost.create({
                                    type: 'post',
                                    relationship: 'indirect',
                                    creatorId: accountId,
                                    postId: post.id,
                                    spaceId: id,
                                    state: 'active',
                                })
                                const updateTotalPosts = await Space.increment('totalPosts', {
                                    where: { id },
                                    silent: true,
                                })
                                Promise.all([createSpacePost, updateTotalPosts])
                                    .then((data) => resolve2(data[0]))
                                    .catch((error) => resolve2(error))
                            })
                    )
                )
                    .then((data) => resolve1(data))
                    .catch((error) => resolve1(error))
            })

            const notifyMentions = await new Promise(async (resolve) => {
                const users = await User.findAll({
                    where: { handle: mentions, state: 'active' },
                    attributes: ['id', 'name', 'email', 'emailsDisabled'],
                })
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
                                const skipEmail =
                                    user.emailsDisabled || (await accountMuted(accountId, user))
                                const sendEmail = skipEmail
                                    ? null
                                    : await sgMail.send({
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

            const createUrls = await Promise.all(
                urls.map((urlData) =>
                    Url.create({
                        type: 'post',
                        state: 'active',
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
                              spaceId: governance ? spaceIds[0] : null,
                              action: governance
                                  ? pollAction === 'None'
                                      ? null
                                      : pollAction
                                  : null,
                              threshold: governance
                                  ? pollAction === 'Create spaces'
                                      ? pollThreshold
                                      : null
                                  : null,
                              // state: null,
                              // endTime: pollEndTime || null,
                          })
                          Promise.all(
                              pollAnswers.map((answer) =>
                                  PollAnswer.create({
                                      pollId: newPoll.id,
                                      creatorId: answer.Creator ? answer.Creator.id : accountId,
                                      text: answer.text,
                                      state: answer.state || 'active',
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
                                    totalLikes: 0,
                                    totalComments: 0,
                                    totalRatings: 0,
                                })
                              : null

                          const notifySourceCreator =
                              sourcePostId && sourceCreatorId !== accountId
                                  ? await new Promise(async (Resolve) => {
                                        const sourceCreator = await User.findOne({
                                            where: { id: sourceCreatorId },
                                            attributes: ['name', 'email', 'emailsDisabled'],
                                        })
                                        const notifyCreator = await Notification.create({
                                            type: 'new-gbg-from-your-post',
                                            ownerId: sourceCreatorId,
                                            userId: accountId,
                                            postId: post.id,
                                            seen: false,
                                        })
                                        const skipEmail =
                                            sourceCreator.emailsDisabled ||
                                            (await accountMuted(accountId, sourceCreator))
                                        const emailCreator = skipEmail
                                            ? null
                                            : await sgMail.send({
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
                                              searchableText: bead.searchableText,
                                              lastActivity: new Date(),
                                          })

                                          const createBeadUrl =
                                              bead.type === 'url'
                                                  ? await Url.create({
                                                        type: 'post',
                                                        state: 'active',
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
                                              totalLikes: 0,
                                              totalComments: 0,
                                              totalRatings: 0,
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
                                      attributes: [
                                          'id',
                                          'name',
                                          'handle',
                                          'email',
                                          'emailsDisabled',
                                      ],
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

                                                  const sendEmail = player.emailsDisabled
                                                      ? null
                                                      : await sgMail.send({
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
                              searchableText: cardFrontSearchableText,
                              watermark: cardFrontWatermark,
                              lastActivity: new Date(),
                          })
                          const createCardBack = await Post.create({
                              ...defaultPostValues,
                              type: 'card-back',
                              creatorId: accountId,
                              text: cardBackText || null,
                              searchableText: cardBackSearchableText,
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
                              totalLikes: 0,
                              totalComments: 0,
                              totalRatings: 0,
                          })
                          const linkCardBack = await Link.create({
                              state: 'visible',
                              type: 'card-post',
                              // relationship: 'back',
                              creatorId: accountId,
                              itemAId: post.id,
                              itemBId: createCardBack.id,
                              totalLikes: 0,
                              totalComments: 0,
                              totalRatings: 0,
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

            const createLink = sourceId
                ? await new Promise(async (resolve) => {
                      // todo: handle other source types when needed
                      const createNewLink = await Link.create({
                          state: 'visible',
                          type: `${sourceType}-post`,
                          creatorId: accountId,
                          itemAId: sourceId,
                          itemBId: post.id,
                          description: linkDescription,
                          totalLikes: 0,
                          totalComments: 0,
                          totalRatings: 0,
                      })
                      const updateSourceLinks = await Post.increment('totalLinks', {
                          where: { id: sourceId },
                          silent: true,
                      })
                      const updateTargetLinks = await post.update(
                          { totalLinks: 1 },
                          { where: { id: post.id }, silent: true }
                      )
                      Promise.all([createNewLink, updateSourceLinks, updateTargetLinks])
                          .then(() => resolve())
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
                createLink,
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
    const { postId, title, text, searchableText, mentions, urls } = req.body
    const post = await Post.findOne({
        where: { id: postId },
        attributes: ['id', 'type'],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'name', 'handle'],
        },
    })
    if (post.Creator.id !== accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const mentionedUsers = await User.findAll({
            where: { handle: mentions, state: 'active' },
            attributes: ['id', 'name', 'email', 'emailsDisabled'],
        })

        // todo: handle sub-post types
        let postType = post.type
        if (post.type === 'text' && urls.filter((u) => u.removed).length) postType = 'url'
        if (post.type === 'url' && urls.filter((u) => u.removed).length > 0) postType = 'text'

        const updatePost = await Post.update(
            { type: postType, title: title || null, text: text || null, searchableText },
            { where: { id: postId, creatorId: accountId } }
        )

        const updateUrls = await Promise.all(
            urls.map(
                (url) =>
                    new Promise(async (resolve) => {
                        const remove =
                            !url.new && url.removed
                                ? await Url.update(
                                      {
                                          state: 'removed',
                                      },
                                      { where: { id: url.id } }
                                  )
                                : null
                        const add =
                            url.new && !url.removed
                                ? await Url.create({
                                      type: 'post',
                                      state: 'active',
                                      itemId: postId,
                                      url: url.url,
                                      image: url.image,
                                      title: url.title,
                                      description: url.description,
                                      domain: url.domain,
                                  })
                                : null
                        Promise.all([remove, add])
                            .then(() => resolve())
                            .catch((error) => resolve(error))
                    })
            )
        )

        const notifyMentions = await Promise.all(
            mentionedUsers.map(
                (user) =>
                    new Promise(async (resolve) => {
                        const mentionType = postType.includes('string-') ? 'bead' : 'post'
                        const alreadySent = await Notification.findOne({
                            where: {
                                ownerId: user.id,
                                type: `${mentionType}-mention`,
                                userId: accountId,
                                postId,
                            },
                        })
                        if (alreadySent) resolve()
                        else {
                            const sendNotification = await Notification.create({
                                ownerId: user.id,
                                type: `${mentionType}-mention`,
                                seen: false,
                                userId: accountId,
                                postId,
                            })
                            const sendEmail = user.emailsDisabled
                                ? null
                                : await sgMail.send({
                                      to: user.email,
                                      from: {
                                          email: 'admin@weco.io',
                                          name: 'we { collective }',
                                      },
                                      subject: 'New notification',
                                      text: `
                                        Hi ${user.name}, ${post.Creator.name} just mentioned you in a ${mentionType} on weco:
                                        http://${config.appURL}/p/${postId}
                                    `,
                                      html: `
                                        <p>
                                            Hi ${user.name},
                                            <br/>
                                            <a href='${config.appURL}/u/${post.Creator.handle}'>${post.Creator.name}</a>
                                            just mentioned you in a 
                                            <a href='${config.appURL}/p/${postId}'>${mentionType}</a>
                                            on weco
                                        </p>
                                    `,
                                  })
                            Promise.all([sendNotification, sendEmail])
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        }
                    })
            )
        )

        Promise.all([updatePost, updateUrls, notifyMentions])
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
                searchableText,
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
                searchableText,
                lastActivity: new Date(),
            })

            const createUrl =
                type === 'url'
                    ? await Url.create({
                          itemId: bead.id,
                          type: 'post',
                          state: 'active',
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
                              attributes: ['id', 'name', 'email', 'emailsDisabled'],
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

                                                  const sendEmail = user.emailsDisabled
                                                      ? null
                                                      : await sgMail.send({
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
                        attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                    },
                    {
                        model: GlassBeadGame,
                    },
                    {
                        model: User,
                        as: 'Players',
                        attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
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
                            attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
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
                totalLikes: 0,
                totalComments: 0,
                totalRatings: 0,
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
                                    const emailPlayer = p.emailsDisabled
                                        ? null
                                        : await sgMail.send({
                                              to: p.email,
                                              from: {
                                                  email: 'admin@weco.io',
                                                  name: 'we { collective }',
                                              },
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
                                  const nextMoveNumber = post.Beads.length + 2
                                  const createMoveNotification = await Notification.create({
                                      type: 'gbg-move',
                                      ownerId: nextPlayer.id,
                                      postId: postId,
                                      seen: false,
                                  })
                                  const sendMoveEmail = nextPlayer.emailsDisabled
                                      ? null
                                      : await sgMail.send({
                                            to: nextPlayer.email,
                                            from: {
                                                email: 'admin@weco.io',
                                                name: 'we { collective }',
                                            },
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
                                  const scheduleGBGMoveJobs =
                                      await ScheduledTasks.scheduleGBGMoveJobs(
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
            attributes: ['totalReposts', 'totalLikes', 'totalComments'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'name', 'email', 'emailsDisabled'],
            },
        })

        const updateTotalReposts = await Post.update(
            { totalReposts: post.totalReposts + spaceIds.length },
            { where: { id: postId }, silent: true }
        )

        const skipNotification = post.Creator.id === accountId
        const skipEmail =
            skipNotification ||
            post.Creator.emailsDisabled ||
            (await accountMuted(accountId, post.Creator))

        const sendNotification = skipNotification
            ? null
            : await Notification.create({
                  ownerId: post.Creator.id,
                  type: 'post-repost',
                  seen: false,
                  spaceAId: spaceId,
                  userId: accountId,
                  postId,
              })

        const sendEmail = skipEmail
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
                    itemType: 'post',
                    itemId: postId,
                    state: 'active',
                    spaceId: id,
                    creatorId: accountId,
                })
            )
        )

        const createDirectRelationships = await Promise.all(
            spaceIds.map(
                (id) =>
                    new Promise(async (resolve) => {
                        const createSpacePost = await SpacePost.create({
                            type: 'repost',
                            relationship: 'direct',
                            creatorId: accountId,
                            postId,
                            spaceId: id,
                            state: 'active',
                        })
                        // update stats
                        const space = await Space.findOne({ where: { id }, attributes: ['id'] })
                        const incrementTotalPostLikes = await space.increment('totalPostLikes', {
                            by: post.totalLikes,
                            silent: true,
                        })
                        const incrementTotalComments = await space.increment('totalComments', {
                            by: post.totalComments,
                            silent: true,
                        })
                        const incrementTotalPosts = await space.increment('totalPosts', {
                            silent: true,
                        })
                        const spaceUserStat = await SpaceUserStat.findOne({
                            where: { spaceId: id, userId: post.Creator.id },
                            attributes: ['id'],
                        })
                        const updateSpaceUserStat = spaceUserStat
                            ? await spaceUserStat.increment('totalPostLikes', {
                                  by: post.totalLikes,
                              })
                            : await SpaceUserStat.create({
                                  spaceId: id,
                                  userId: post.Creator.id,
                                  totalPostLikes: post.totalLikes,
                              })
                        Promise.all([
                            createSpacePost,
                            incrementTotalPostLikes,
                            incrementTotalComments,
                            incrementTotalPosts,
                            updateSpaceUserStat,
                        ])
                            .then(() => resolve())
                            .catch((error) => resolve(error))
                    })
            )
        )

        const createIndirectRelationships = await new Promise(async (resolve) => {
            const spaces = await Space.findAll({
                where: { id: spaceIds, state: 'active' },
                attributes: ['id'],
                include: {
                    model: Space,
                    as: 'SpaceAncestors',
                    attributes: ['id'],
                    through: { where: { state: 'open' }, attributes: [] },
                },
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
                                const createSpacePost = await SpacePost.create({
                                    type: 'repost',
                                    relationship: 'indirect',
                                    creatorId: accountId,
                                    postId,
                                    spaceId: id,
                                    state: 'active',
                                })
                                // update stats
                                const space = await Space.findOne({
                                    where: { id },
                                    attributes: ['totalPostLikes', 'totalComments', 'totalPosts'],
                                })
                                const updateSpaceStats = await Space.update(
                                    {
                                        totalPostLikes: space.totalPostLikes + post.totalLikes,
                                        totalComments: space.totalComments + post.totalComments,
                                        totalPosts: space.totalPosts + 1,
                                    },
                                    { where: { id }, silent: true }
                                )
                                const spaceUserStat = await SpaceUserStat.findOne({
                                    where: { spaceId: id, userId: post.Creator.id },
                                    attributes: ['id', 'totalPostLikes'],
                                })
                                const updateSpaceUserStat = spaceUserStat
                                    ? await spaceUserStat.update({
                                          totalPostLikes:
                                              spaceUserStat.totalPostLikes + post.totalLikes,
                                      })
                                    : await SpaceUserStat.create({
                                          spaceId: id,
                                          userId: post.Creator.id,
                                          totalPostLikes: post.totalLikes,
                                      })
                                Promise.all([
                                    createSpacePost,
                                    updateSpaceStats,
                                    updateSpaceUserStat,
                                ])
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
    const {
        itemType,
        itemId,
        parentItemId,
        sourceType,
        sourceId,
        accountHandle,
        accountName,
        spaceId,
    } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        let model
        let include = [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
            },
        ]
        if (itemType === 'post') {
            model = Post
            include.push({
                model: Space,
                as: 'AllPostSpaces',
                where: { state: 'active' },
                attributes: ['id'],
                through: { where: { state: 'active' }, attributes: [] },
                required: false,
            })
        }
        if (itemType === 'comment') model = Comment
        if (itemType === 'link') model = Link

        const item = await model.findOne({
            where: { id: itemId },
            attributes: ['id'],
            include,
        })

        const updateTotalLikes = item.increment('totalLikes', {
            silent: true,
        })

        const updateSpaceStats =
            itemType === 'post'
                ? Promise.all(
                      item.AllPostSpaces.map(
                          (space) =>
                              new Promise(async (resolve) => {
                                  const updateSpaceStat = await space.increment('totalPostLikes', {
                                      silent: true,
                                  })
                                  const spaceUserStat = await SpaceUserStat.findOne({
                                      where: { spaceId: space.id, userId: item.Creator.id },
                                      attributes: ['id'],
                                  })
                                  const updateSpaceUserStat = spaceUserStat
                                      ? await spaceUserStat.increment('totalPostLikes')
                                      : await SpaceUserStat.create({
                                            spaceId: space.id,
                                            userId: item.Creator.id,
                                            totalPostLikes: 1,
                                        })
                                  Promise.all([updateSpaceStat, updateSpaceUserStat])
                                      .then(() => resolve())
                                      .catch((error) => resolve(error))
                              })
                      )
                  )
                : null

        const createReaction = await Reaction.create({
            type: 'like',
            itemType,
            itemId,
            state: 'active',
            spaceId,
            creatorId: accountId,
        })

        let postId = null
        let commentId = null
        let spaceAId = spaceId
        if (itemType === 'post') postId = itemId
        if (itemType === 'comment') {
            postId = parentItemId
            commentId = itemId
        }
        if (itemType === 'link') {
            if (sourceType === 'post') postId = sourceId
            if (sourceType === 'comment') commentId = sourceId
            if (sourceType === 'space') spaceAId = sourceId
        }

        const skipNotification = item.Creator.id === accountId
        const skipEmail =
            skipNotification ||
            item.Creator.emailsDisabled ||
            (await accountMuted(accountId, item.Creator))

        const createNotification = skipNotification
            ? null
            : await Notification.create({
                  ownerId: item.Creator.id,
                  type: `${itemType}-like`,
                  seen: false,
                  userId: accountId,
                  spaceAId,
                  postId,
                  commentId,
              })

        let itemUrl
        if (itemType === 'post') itemUrl = `${config.appURL}/p/${itemId}`
        if (itemType === 'comment')
            itemUrl = `${config.appURL}/p/${parentItemId}?commentId=${itemId}`
        if (itemType === 'link')
            itemUrl = `${config.appURL}/linkmap?item=${sourceType}&id=${sourceId}`

        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
                  to: item.Creator.email,
                  from: { email: 'admin@weco.io', name: 'we { collective }' },
                  subject: 'New notification',
                  text: `
                        Hi ${item.Creator.name}, ${accountName} just liked your ${itemType} on weco:
                        http://${itemUrl}
                    `,
                  html: `
                        <p>
                            Hi ${item.Creator.name},
                            <br/>
                            <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                            just liked your
                            <a href='${itemUrl}'>${itemType}</a>
                            on weco
                        </p>
                    `,
              })

        Promise.all([
            updateTotalLikes,
            updateSpaceStats,
            createReaction,
            createNotification,
            sendEmail,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-like', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { itemType, itemId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        let model
        let include = null
        if (itemType === 'post') {
            model = Post
            include = [
                {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
                },
                {
                    model: Space,
                    as: 'AllPostSpaces',
                    where: { state: 'active' },
                    required: false,
                    attributes: ['id', 'totalPostLikes'],
                    through: { where: { state: 'active' }, attributes: [] },
                },
            ]
        }
        if (itemType === 'comment') model = Comment
        if (itemType === 'link') model = Link

        const item = await model.findOne({
            where: { id: itemId },
            attributes: ['id'],
            include,
        })

        const updateTotalLikes = await item.decrement('totalLikes', { silent: true })

        const updateSpaceStats =
            itemType === 'post'
                ? Promise.all(
                      item.AllPostSpaces.map(
                          (space) =>
                              new Promise(async (resolve) => {
                                  const updateSpaceStat = await space.decrement('totalPostLikes', {
                                      silent: true,
                                  })
                                  const updateSpaceUserStat = await SpaceUserStat.decrement(
                                      'totalPostLikes',
                                      { where: { spaceId: space.id, userId: item.Creator.id } }
                                  )
                                  Promise.all([updateSpaceStat, updateSpaceUserStat])
                                      .then(() => resolve())
                                      .catch((error) => resolve(error))
                              })
                      )
                  )
                : null

        const removeReaction = await Reaction.update(
            { state: 'removed' },
            {
                where: {
                    type: 'like',
                    itemType,
                    itemId,
                    state: 'active',
                    creatorId: accountId,
                },
            }
        )

        Promise.all([updateTotalLikes, updateSpaceStats, removeReaction])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/add-rating', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { itemType, itemId, parentItemId, newRating, accountHandle, accountName, spaceId } =
        req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        let model
        if (itemType === 'post') model = Post
        if (itemType === 'comment') model = Comment

        const item = await model.findOne({
            where: { id: itemId },
            attributes: ['id'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
            },
        })

        const updateTotalRatings = await item.increment('totalRatings', { silent: true })

        const createReaction = await Reaction.create({
            type: 'rating',
            itemType,
            itemId,
            value: newRating,
            state: 'active',
            spaceId,
            creatorId: accountId,
        })

        let notificationPostId = null
        if (itemType === 'post') notificationPostId = itemId
        if (itemType === 'comment') notificationPostId = parentItemId

        const skipNotification = item.Creator.id === accountId
        const skipEmail =
            skipNotification ||
            item.Creator.emailsDisabled ||
            (await accountMuted(accountId, item.Creator))

        const sendNotification = skipNotification
            ? null
            : await Notification.create({
                  ownerId: item.Creator.id,
                  type: `${itemType}-rating`,
                  seen: false,
                  spaceAId: spaceId,
                  userId: accountId,
                  // todo: change to itemAId when Notifications table updated
                  postId: notificationPostId,
                  commentId: itemType === 'comment' ? itemId : null,
              })

        let itemUrl
        if (itemType === 'post') itemUrl = `${config.appURL}/p/${itemId}`
        if (itemType === 'comment')
            itemUrl = `${config.appURL}/p/${parentItemId}?commentId=${itemId}`

        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
                  to: item.Creator.email,
                  from: { email: 'admin@weco.io', name: 'we { collective }' },
                  subject: 'New notification',
                  text: `
                        Hi ${item.Creator.name}, ${accountName} just rated your ${itemType} on weco:
                        http://${itemUrl}
                    `,
                  html: `
                        <p>
                            Hi ${item.Creator.name},
                            <br/>
                            <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                            just rated your
                            <a href='${itemUrl}'>${itemType}</a>
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
    const { itemType, itemId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        let model
        if (itemType === 'post') model = Post
        if (itemType === 'comment') model = Comment

        const removeReaction = await Reaction.update(
            { state: 'removed' },
            {
                where: {
                    type: 'rating',
                    itemType,
                    itemId,
                    state: 'active',
                    creatorId: accountId,
                },
            }
        )

        const updateTotalRatings = await model.decrement('totalRatings', {
            where: { id: itemId },
            silent: true,
        })

        Promise.all([removeReaction, updateTotalRatings])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/add-link', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { sourceType, sourceId, targetType, targetId, description, accountHandle, accountName } =
        req.body

    async function getItem(type, id) {
        let model
        let attributes = []
        let include = null
        const creator = {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
        }
        const mods = {
            model: User,
            as: 'Moderators',
            attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
        }
        if (type === 'post') {
            model = Post
            attributes = ['id']
            include = creator
        } else if (type === 'comment') {
            model = Comment
            attributes = ['id', 'itemId']
            include = creator
        } else if (type === 'user') {
            model = User
            attributes = ['id', 'name', 'handle', 'email', 'emailsDisabled']
        } else if (type === 'space') {
            model = Space
            attributes = ['id']
            include = mods
        }
        return model.findOne({ where: { id: id }, attributes, include })
    }

    const source = await getItem(sourceType, sourceId)
    const target = await getItem(targetType, targetId)

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else if (!source) res.status(404).send({ message: 'Source not found' })
    else if (!target) res.status(404).send({ message: 'Target not found' })
    else {
        const createLink = await Link.create({
            creatorId: accountId,
            state: 'visible',
            type: `${sourceType}-${targetType}`,
            description,
            itemAId: sourceId,
            itemBId: targetId,
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })

        // removed for users and spaces for now
        const updateSourceTotalLinks = ['user', 'space'].includes(sourceType)
            ? null
            : await source.increment('totalLinks', { silent: true })

        const updateTargetTotalLinks = ['user', 'space'].includes(targetType)
            ? null
            : await target.increment('totalLinks', { silent: true })

        async function notifyOwners(item, type, location) {
            // skip notification if linked item is link creators
            let isOwn = false
            if (['post', 'comment'].includes(type)) isOwn = item.Creator.id === accountId
            if (type === 'user') isOwn = item.id === accountId
            if (type === 'space') isOwn = item.Moderators.find((u) => u.id === accountId)
            if (isOwn) return null
            // send out notifications and emails to recipients
            let recipients = []
            if (['post', 'comment'].includes(type)) recipients = [item.Creator]
            if (type === 'user') recipients = [item]
            if (type === 'space') recipients = [...item.Moderators]
            return Promise.all(
                recipients.map(
                    async (recipient) =>
                        await new Promise(async (resolve) => {
                            const { id, name, email, emailsDisabled } = recipient
                            let postId = null
                            let commentId = null
                            let spaceAId = null
                            if (type === 'post')
                                postId = location === 'source' ? sourceId : targetId
                            if (type === 'comment')
                                commentId = location === 'source' ? sourceId : targetId
                            if (type === 'space')
                                spaceAId = location === 'source' ? sourceId : targetId
                            // todo: need 3 slots for each model type (until then only include link to source)
                            const createNotification = await Notification.create({
                                ownerId: id,
                                type: `${type}-link-${location}`,
                                seen: false,
                                userId: accountId,
                                spaceAId,
                                postId,
                                commentId,
                            })
                            const skipEmail =
                                emailsDisabled || (await accountMuted(accountId, recipient))
                            const url = `${config.appURL}/linkmap?item=${type}&id=${item.id}`
                            const sendEmail = skipEmail
                                ? null
                                : await sgMail.send({
                                      to: email,
                                      from: { email: 'admin@weco.io', name: 'we { collective }' },
                                      subject: 'New notification',
                                      text: `
                                    Hi ${name}, ${accountName} just linked ${
                                          type === 'user' ? 'you' : `your ${type}`
                                      } to another ${
                                          location === 'source' ? sourceType : targetType
                                      } on weco:
                                        http://${url}
                                `,
                                      html: `
                                    <p>
                                        Hi ${name},
                                        <br/>
                                        <a href='${
                                            config.appURL
                                        }/u/${accountHandle}'>${accountName}</a>
                                        just linked ${
                                            type === 'user'
                                                ? `<a href='${url}'>you</a>`
                                                : `your <a href='${url}'>${type}</a>`
                                        }
                                        to another ${
                                            location === 'source' ? sourceType : targetType
                                        } on weco
                                    </p>
                                `,
                                  })
                            Promise.all([createNotification, sendEmail])
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        })
                )
            )
        }

        const notifySourceOwner = await notifyOwners(source, sourceType, 'source')
        const notifyTargetOwner = await notifyOwners(target, targetType, 'target')

        Promise.all([
            createLink,
            updateSourceTotalLinks,
            updateTargetTotalLinks,
            notifySourceOwner,
            notifyTargetOwner,
        ])
            .then((data) => res.status(200).json(data[0]))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// todo: handle users and spaces, decrement link tally of connected items
router.post('/delete-link', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { linkId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const link = await Link.findOne({
            where: { id: linkId, creatorId: accountId },
            attributes: ['type', 'itemAId', 'itemBId'],
        })
        if (!link) res.status(404).json({ message: 'Not found' })
        else {
            const linkTypes = link.type.split('-')
            const sourceType = linkTypes[0]
            const targetType = linkTypes[1]

            let sourceModel
            if (sourceType === 'post') sourceModel = Post
            if (sourceType === 'comment') sourceModel = Comment

            let targetModel
            if (targetType === 'post') targetModel = Post
            if (targetType === 'comment') targetModel = Comment

            const updateSourceTotalLinks = await sourceModel.decrement('totalLinks', {
                where: { id: link.itemAId },
                silent: true,
            })

            const updateTargetTotalLinks = await targetModel.decrement('totalLinks', {
                where: { id: link.itemBId },
                silent: true,
            })

            const removeLink = await Link.update({ state: 'deleted' }, { where: { id: linkId } })

            Promise.all([updateSourceTotalLinks, updateTargetTotalLinks, removeLink])
                .then(() => res.status(200).json({ message: 'Success' }))
                .catch((error) => res.status(500).json({ message: 'Error', error }))
        }
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
            attributes: ['id'],
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: [
                        'id',
                        'handle',
                        'name',
                        'flagImagePath',
                        'email',
                        'emailsDisabled',
                    ],
                },
                {
                    model: Space,
                    as: 'AllPostSpaces',
                    where: { state: 'active' },
                    required: false,
                    attributes: ['id'],
                    through: { where: { state: 'active' }, attributes: [] },
                },
            ],
        })

        const incrementTotalComments = await post.increment('totalComments', { silent: true })

        const updateLastPostActivity = await post.update(
            { lastActivity: new Date() },
            { silent: true }
        )

        const updateSpaceStats = await Promise.all(
            post.AllPostSpaces.map((space) => space.increment('totalComments', { silent: true }))
        )

        const comment = commentId
            ? await Comment.findOne({
                  where: { id: commentId },
                  attributes: [],
                  include: {
                      model: User,
                      as: 'Creator',
                      attributes: [
                          'id',
                          'handle',
                          'name',
                          'flagImagePath',
                          'email',
                          'emailsDisabled',
                      ],
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
                      attributes: [
                          'id',
                          'handle',
                          'name',
                          'flagImagePath',
                          'email',
                          'emailsDisabled',
                      ],
                  },
              })
            : null

        const mentionedUsers = await User.findAll({
            where: { handle: mentions, state: 'active' },
            attributes: ['id', 'name', 'email', 'emailsDisabled'],
        })

        const newComment = await Comment.create({
            state: 'visible',
            creatorId: accountId,
            text,
            itemType: 'post',
            itemId: postId,
            parentCommentId: commentId,
            spaceId,
            totalLikes: 0,
            totalRatings: 0,
            totalLinks: 0,
            totalReposts: 0,
            totalGlassBeadGames: 0,
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
            : new Promise(async (resolve) => {
                  const createNotification = await Notification.create({
                      ownerId: post.Creator.id,
                      type: 'post-comment',
                      seen: false,
                      spaceAId: spaceId,
                      userId: accountId,
                      postId,
                      commentId: newComment.id,
                  })
                  const skipEmail =
                      post.Creator.emailsDisabled || (await accountMuted(accountId, post.Creator))
                  const sendEmail = skipEmail
                      ? null
                      : await sgMail.send({
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
            : new Promise(async (resolve) => {
                  const createNotification = await Notification.create({
                      ownerId: comment.Creator.id,
                      type: 'comment-reply',
                      seen: false,
                      spaceAId: spaceId,
                      userId: accountId,
                      postId,
                      commentId: newComment.id,
                  })
                  const skipEmail =
                      comment.Creator.emailsDisabled ||
                      (await accountMuted(accountId, comment.Creator))
                  const sendEmail = skipEmail
                      ? null
                      : await sgMail.send({
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
            : new Promise(async (resolve) => {
                  const createNotification = await Notification.create({
                      ownerId: reply.Creator.id,
                      type: 'comment-reply',
                      seen: false,
                      spaceAId: spaceId,
                      userId: accountId,
                      postId,
                      commentId: newComment.id,
                  })
                  const skipEmail =
                      reply.Creator.emailsDisabled || (await accountMuted(accountId, reply.Creator))
                  const sendEmail = skipEmail
                      ? null
                      : await sgMail.send({
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
                            const skipEmail =
                                user.emailsDisabled || (await accountMuted(accountId, user))
                            const sendEmail = skipEmail
                                ? null
                                : await sgMail.send({
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
            incrementTotalComments,
            updateLastPostActivity,
            updateSpaceStats,
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
            attributes: ['id', 'name', 'email', 'emailsDisabled'],
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
                            const alreadySent = await Notification.findOne({
                                where: {
                                    ownerId: user.id,
                                    type: 'comment-mention',
                                    userId: accountId,
                                    postId,
                                    commentId,
                                },
                            })
                            if (alreadySent) resolve()
                            else {
                                const sendNotification = await Notification.create({
                                    ownerId: user.id,
                                    type: 'comment-mention',
                                    seen: false,
                                    userId: accountId,
                                    postId,
                                    commentId,
                                })

                                const sendEmail = user.emailsDisabled
                                    ? null
                                    : await sgMail.send({
                                          to: user.email,
                                          from: {
                                              email: 'admin@weco.io',
                                              name: 'we { collective }',
                                          },
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
                            }
                        })
                )
        )

        Promise.all([updateComment, notifyMentions])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// todo: decrement link tally of connected items
router.post('/delete-comment', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, commentId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId },
            attributes: ['id'],
            include: {
                model: Space,
                as: 'AllPostSpaces',
                where: { state: 'active' },
                required: false,
                attributes: ['id'],
                through: { where: { state: 'active' }, attributes: [] },
            },
        })

        const updateTotalComments = await post.decrement('totalComments', { silent: true })

        const updateSpaceStats = await Promise.all(
            post.AllPostSpaces.map((space) => space.decrement('totalComments', { silent: true }))
        )

        const removeComment = await Comment.update(
            { state: 'deleted' },
            { where: { id: commentId, creatorId: accountId } }
        )

        Promise.all([updateTotalComments, updateSpaceStats, removeComment])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/respond-to-event', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userName, userEmail, postId, eventId, startTime, response } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const user = await User.findOne({
            where: { id: accountId },
            attributes: ['name', 'email', 'emailsDisabled'],
        })
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
                      userName: user.name,
                      userEmail: user.email,
                      emailsDisabled: user.emailsDisabled,
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
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: [
                        'id',
                        'handle',
                        'name',
                        'flagImagePath',
                        'email',
                        'emailsDisabled',
                    ],
                },
                {
                    model: Poll,
                    attributes: ['type', 'action', 'threshold', 'spaceId'],
                },
            ],
        })

        const removeOldReactions = await Reaction.update(
            { state: 'removed' },
            { where: { state: 'active', creatorId: accountId, type: 'vote', parentItemId: postId } }
        )

        const createNewReactions = await Promise.all(
            voteData.map((answer) =>
                Reaction.create({
                    type: 'vote',
                    itemType: 'poll-answer',
                    itemId: answer.id,
                    parentItemId: postId,
                    value: answer.value || null,
                    state: 'active',
                    spaceId,
                    creatorId: accountId,
                })
            )
        )

        const { type, action, threshold } = post.Poll
        const executeAction = action
            ? Promise.all(
                  voteData.map(
                      (answer) =>
                          new Promise(async (resolve1) => {
                              const pollAnswer = await PollAnswer.findOne({
                                  where: { id: answer.id },
                                  attributes: ['id', 'text', 'state'],
                                  include: {
                                      model: Reaction,
                                      where: { type: 'vote', state: 'active' },
                                      required: false,
                                      attributes: ['value'],
                                  },
                              })
                              const { text, state, Reactions } = pollAnswer
                              let totalVotes
                              if (type === 'weighted-choice')
                                  totalVotes =
                                      Reactions.map((r) => +r.value).reduce((a, b) => a + b, 0) /
                                      100
                              else totalVotes = Reactions.length
                              const createSpace =
                                  action === 'Create spaces' &&
                                  state !== 'done' &&
                                  totalVotes >= threshold
                                      ? new Promise(async (resolve2) => {
                                            const markAnswerDone = await pollAnswer.update({
                                                state: 'done',
                                            })
                                            const newSpace = await Space.create({
                                                creatorId: post.Creator.id,
                                                handle: uuidv4().substring(0, 15),
                                                name: text,
                                                description: null,
                                                state: 'active',
                                                privacy: 'public',
                                                totalPostLikes: 0,
                                                totalPosts: 0,
                                                totalComments: 0,
                                                totalFollowers: 1,
                                            })
                                            const createModRelationship = SpaceUser.create({
                                                relationship: 'moderator',
                                                state: 'active',
                                                spaceId: newSpace.id,
                                                userId: post.Creator.id,
                                            })
                                            const createFollowerRelationship = SpaceUser.create({
                                                relationship: 'follower',
                                                state: 'active',
                                                spaceId: newSpace.id,
                                                userId: post.Creator.id,
                                            })
                                            const attachToParent = await attachParentSpace(
                                                newSpace.id,
                                                post.Poll.spaceId
                                            )
                                            Promise.all([
                                                markAnswerDone,
                                                createModRelationship,
                                                createFollowerRelationship,
                                                attachToParent,
                                            ])
                                                .then(() => resolve2())
                                                .catch((error) => resolve2(error))
                                        })
                                      : null

                              Promise.all([createSpace])
                                  .then(() => resolve1())
                                  .catch((error) => resolve1(error))
                          })
                  )
              )
            : null

        const skipNotification = post.Creator.id === accountId
        const skipEmail = skipNotification || post.Creator.emailsDisabled

        const createNotification = skipNotification
            ? null
            : await Notification.create({
                  ownerId: post.Creator.id,
                  type: 'poll-vote',
                  seen: false,
                  userId: accountId,
                  postId,
              })

        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
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

        const updateLastPostActivity = await Post.update(
            { lastActivity: new Date() },
            { where: { id: postId }, silent: true }
        )

        Promise.all([
            removeOldReactions,
            createNewReactions,
            executeAction,
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
            state: 'active',
        })
            .then((pollAnswer) => res.status(200).json({ pollAnswer }))
            .catch((error) => res.status(500).json({ error }))
    }
})

router.post('/remove-poll-answer', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { id } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        PollAnswer.update({ state: 'removed' }, { where: { id } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ error }))
    }
})

router.post('/toggle-poll-answer-done', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { answerId, newState } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        PollAnswer.update({ state: newState }, { where: { id: answerId } })
            .then(() => res.status(200).json({ message: 'Success' }))
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
})

router.post('/glass-bead-game-comment', (req, res) => {
    const { gameId, userId, text } = req.body
    Comment.create({
        state: 'visible',
        itemType: 'glass-bead-game',
        itemId: gameId,
        creatorId: userId,
        text,
        totalLikes: 0,
        totalRatings: 0,
        totalLinks: 0,
        totalReposts: 0,
        totalGlassBeadGames: 0,
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

router.post('/save-gbg-topic', async (req, res) => {
    const { postId, gameId, newTopic } = req.body
    const updatePost = await Post.update(
        { title: newTopic },
        { where: { id: postId }, silent: true }
    )
    const updateGame = await GlassBeadGame.update({ topicGroup: null }, { where: { id: gameId } })
    Promise.all([updatePost, updateGame])
        .then(() => res.status(200).send({ message: 'Success' }))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

// todo: decrement link tally of connected items
router.post('/delete-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId, creatorId: accountId },
            attributes: ['id', 'totalLikes', 'totalComments'],
            include: [
                {
                    model: Space,
                    as: 'AllPostSpaces',
                    where: { state: 'active' },
                    required: false,
                    attributes: ['id', 'totalPostLikes', 'totalComments', 'totalPosts'],
                    through: { where: { state: 'active' }, attributes: [] },
                },
                {
                    model: Event,
                    attributes: ['id'],
                    required: false,
                },
            ],
        })
        const removePost = await Post.update({ state: 'deleted' }, { where: { id: postId } })
        const updateSpaceStats = await Promise.all(
            post.AllPostSpaces.map(
                (space) =>
                    new Promise(async (resolve) => {
                        const updateSpace = await Space.update(
                            {
                                totalPostLikes: space.totalPostLikes - post.totalLikes,
                                totalComments: space.totalComments - post.totalComments,
                                totalPosts: space.totalPosts - 1,
                            },
                            { where: { id: space.id }, silent: true }
                        )
                        const spaceUserStat = await SpaceUserStat.findOne({
                            where: { spaceId: space.id, userId: accountId },
                            attributes: ['id', 'totalPostLikes'],
                        })
                        const updateSpaceUserStat = spaceUserStat
                            ? await spaceUserStat.update({
                                  totalPostLikes: spaceUserStat.totalPostLikes - post.totalLikes,
                              })
                            : null
                        Promise.all([updateSpace, updateSpaceUserStat])
                            .then(() => resolve())
                            .catch((error) => resolve(error))
                    })
            )
        )
        const removeEvent = post.Event
            ? await Event.update({ state: 'deleted' }, { where: { id: post.Event.id } })
            : null

        Promise.all([removePost, updateSpaceStats, removeEvent])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, spaceId, spaceHandle } = req.body

    const isMod = await SpaceUser.findOne({
        where: { userId: accountId, spaceId, relationship: 'moderator' },
        attributes: ['id'],
    })

    if (!accountId || !isMod) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId },
            attributes: ['totalLikes', 'totalComments'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
            },
        })

        const updatePostEntry = await SpacePost.update(
            { state: 'removed-by-mod' },
            { where: { postId, spaceId } }
        )

        const space = await Space.findOne({
            where: { id: spaceId },
            attributes: ['totalPostLikes', 'totalComments', 'totalPosts'],
        })
        const updateSpaceStats = await Space.update(
            {
                totalPostLikes: space.totalPostLikes - post.totalLikes,
                totalComments: space.totalComments - post.totalComments,
                totalPosts: space.totalPosts - 1,
            },
            { where: { id: spaceId }, silent: true }
        )

        const spaceUserStat = await SpaceUserStat.findOne({
            where: { spaceId, userId: post.Creator.id },
            attributes: ['id', 'totalPostLikes'],
        })
        const updateSpaceUserStat = spaceUserStat
            ? await spaceUserStat.update({
                  totalPostLikes: spaceUserStat.totalPostLikes - post.totalLikes,
              })
            : null

        const skipNotification = post.Creator.id === accountId
        const skipEmail = skipNotification || post.Creator.emailsDisabled
        const sendNotification = skipNotification
            ? null
            : await Notification.create({
                  ownerId: post.Creator.id,
                  type: 'post-removed-by-mods',
                  seen: false,
                  postId,
                  spaceAId: spaceId,
              })
        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
                  to: post.Creator.email,
                  from: { email: 'admin@weco.io', name: 'we { collective }' },
                  subject: 'New notification',
                  text: `
                Hi ${post.Creator.name}, your post was just removed from s/${spaceHandle} by its mods:
                http://${config.appURL}/p/${postId}
            `,
                  html: `
                <p>
                    Hi ${post.Creator.name},
                    <br/>
                    Your 
                    <a href='${config.appURL}/p/${postId}'>post</a>
                    was just removed from 
                    <a href='${config.appURL}/s/${spaceHandle}'>s/${spaceHandle}</a>
                    by its mods
                </p>
            `,
              })

        Promise.all([
            updatePostEntry,
            updateSpaceStats,
            updateSpaceUserStat,
            sendNotification,
            sendEmail,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

module.exports = router
