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

const { Client } = require('pg')
const client = new Client({
    host: 'localhost',
    user: 'postgres',
    port: 5432,
    password: 'root',
    database: 'metacrisis',
})
client.connect()

// testing
let testIndex = 0
router.get('/test', async (req, res) => {
    if (testIndex > 0) {
        console.log('second attempt')
        res.send('second attempt')
    } else {
        console.log('first attempt')
        testIndex += 1

        const spaceId = 99999
        const public = true
        const useTagsAsSpaces = true
        const spaceHandlePrefix = 'mc'
        const users = []
        const spaces = []
        const posts = []
        const comments = []

        const getUsers = await new Promise((resolve1) => {
            client.query(`SELECT * FROM users WHERE users.id > 0`, async (error, result) => {
                if (error) resolve1(error)
                else {
                    Promise.all(
                        result.rows.map(
                            (user) =>
                                // attach user data
                                new Promise(async (resolve2) => {
                                    // get email
                                    const email = await new Promise(async (resolve3) => {
                                        client.query(
                                            `SELECT * FROM user_emails WHERE user_emails.user_id = ${user.id} `,
                                            (error, result) => {
                                                if (error || !result.rows[0]) resolve3(null)
                                                else resolve3(result.rows[0].email)
                                            }
                                        )
                                    })
                                    // get bio
                                    const bio = await new Promise(async (resolve3) => {
                                        client.query(
                                            `SELECT * FROM user_profiles WHERE user_profiles.user_id = ${user.id} `,
                                            (error, result) => {
                                                if (error || !result.rows[0]) resolve3(null)
                                                else resolve3(result.rows[0].bio_raw)
                                            }
                                        )
                                    })
                                    // check for matching weco user
                                    const wecoMatchId = await new Promise(async (resolve3) => {
                                        const matchingUser = await User.findOne({
                                            where: { email },
                                        })
                                        resolve3(matchingUser ? matchingUser.id : null)
                                    })
                                    // add user
                                    users.push({
                                        id: user.id,
                                        name: user.name || user.username,
                                        handle: user.username,
                                        email,
                                        bio,
                                        wecoMatchId,
                                    })
                                    resolve2()
                                })
                        )
                    )
                        .then(() => resolve1())
                        .catch((err) => resolve1(err))
                }
            })
        })

        const getSpaces = useTagsAsSpaces
            ? await new Promise((resolve) => {
                  // get tags
                  client.query(`SELECT * FROM tags`, (error, result) => {
                      if (error) resolve(error)
                      else {
                          result.rows.forEach((tag) => {
                              spaces.push({
                                  id: tag.id,
                                  name: tag.name,
                                  description: tag.description,
                              })
                          })
                          resolve()
                      }
                  })
              })
            : await new Promise((resolve) => {
                  // get categories
                  client.query(`SELECT * FROM categories`, (error, result) => {
                      if (error) resolve(error)
                      else {
                          result.rows.forEach((category) => {
                              spaces.push({
                                  id: category.id,
                                  name: category.name,
                                  handle: category.slug,
                                  description: category.description,
                                  private: category.read_restricted,
                              })
                          })
                          resolve()
                      }
                  })
              })

        const getPosts = await new Promise((resolve1) => {
            client.query(
                `SELECT * FROM topics WHERE archetype = 'regular' AND user_id > 0 ORDER BY created_at ASC`,
                (error, result) => {
                    if (error) resolve('error')
                    else {
                        Promise.all(
                            result.rows.map(
                                (post) =>
                                    // attach post data
                                    new Promise(async (resolve2) => {
                                        // first comment used as post text
                                        const firstComment = await new Promise(async (resolve3) => {
                                            client.query(
                                                `SELECT * FROM posts WHERE topic_id = ${post.id} AND post_number = 1`,
                                                (error, result) => {
                                                    if (error || !result.rows[0]) resolve3('')
                                                    else resolve3(result.rows[0].raw)
                                                }
                                            )
                                        })
                                        // get post tags if used for spaces
                                        const postTags = useTagsAsSpaces
                                            ? await new Promise(async (resolve3) => {
                                                  client.query(
                                                      `SELECT * FROM topic_tags WHERE topic_id = ${post.id} `,
                                                      (error, result) => {
                                                          if (error || !result.rows[0]) resolve3([])
                                                          else {
                                                              let matchedTags = []
                                                              result.rows.forEach((tag) => {
                                                                  const match = spaces.find(
                                                                      (s) => s.id === tag.tag_id
                                                                  )
                                                                  if (match) matchedTags.push(match)
                                                              })
                                                              resolve3(matchedTags)
                                                          }
                                                      }
                                                  )
                                              })
                                            : null
                                        // add post
                                        posts.push({
                                            id: post.id,
                                            creatorId: post.user_id,
                                            title: post.title,
                                            text: firstComment,
                                            categoryId: post.category_id,
                                            deleted: post.deleted_at,
                                            createdAt: post.created_at,
                                            postTags,
                                        })
                                        resolve2()
                                    })
                            )
                        )
                            .then(() => resolve1())
                            .catch((err) => resolve1(err))
                    }
                }
            )
        })

        const getComments = await new Promise((resolve) => {
            client.query(
                `SELECT * FROM posts WHERE user_id > 0 ORDER BY created_at ASC`,
                (error, result) => {
                    if (error) resolve(error)
                    else {
                        result.rows.forEach((comment) => {
                            comments.push({
                                postId: comment.topic_id,
                                creatorId: comment.user_id,
                                text: comment.raw,
                                deleted: comment.deleted_at,
                                createdAt: comment.created_at,
                                commentNumber: comment.post_number,
                                replyToCommentNumber: comment.reply_to_post_number,
                            })
                        })
                        resolve()
                    }
                }
            )
        })

        const tasks = [getUsers, getSpaces, getPosts, getComments]
        for (const task of tasks) await task

        res.status(200).json(comments)

        // create spaces

        // const addUsers = await Promise.all(
        //     usersWithData.map(
        //         (user) =>
        //             new Promise(async (resolve) => {
        //                 if (user.matchId) {
        //                     // skip if public space
        //                     if (public) resolve()
        //                     else {
        //                         // add space access if not yet present
        //                         const spaceAccess = await SpaceUser.findOne({
        //                             where: {
        //                                 userId: user.matchId,
        //                                 spaceId,
        //                                 relationship: 'access',
        //                                 state: 'active',
        //                             },
        //                         })
        //                         if (spaceAccess) resolve()
        //                         else {
        //                             SpaceUser.create({
        //                                 relationship: 'access',
        //                                 state: 'active',
        //                                 spaceId,
        //                                 userId: user.matchId,
        //                             })
        //                                 .then(() => resolve())
        //                                 .catch(() => resolve('error'))
        //                         }
        //                     }
        //                 } else {
        //                     // create new user
        //                     const newUser = await User.create({
        //                         name: user.name,
        //                         handle: user.handle,
        //                         email,
        //                         bio,
        //                         emailVerified: false,
        //                         state: 'unclaimed',
        //                     })
        //                     //  grant access if private space
        //                     const grantAccess = public
        //                         ? null
        //                         : await SpaceUser.create({
        //                               relationship: 'access',
        //                               state: 'active',
        //                               spaceId,
        //                               userId: newUser.id,
        //                           })
        //                     Promise.all([newUser, grantAccess])
        //                         .then(() => resolve())
        //                         .catch((error) => resolve(error))
        //                 }
        //             })
        //     )
        // )

        // add posts

        // add comments
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
            attributes: ['id', 'text', 'createdAt'],
            where: { state: 'active' },
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
                attributes: ['url', 'image', 'title', 'description', 'domain'],
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

router.get('/scrape-url', async (req, res) => {
    // todo: add authenticateToken, return error code intead of empty data if error, set up timeout
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
                        state: 'active',
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
                            state: 'active',
                        })
                    )
                )
                    .then((data) => resolve(data))
                    .catch((error) => resolve(error))
            })

            const notifyMentions = await new Promise(async (resolve) => {
                const users = await User.findAll({
                    where: { handle: mentions, state: 'active' },
                    attributes: ['id', 'name', 'email'],
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

                                const sendEmail = await sgMail.send({
                                    to: user.email,
                                    from: { email: 'admin@weco.io', name: 'we { collective }' },
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
                              // endTime: inquiryEndTime || null,
                          })
                          Promise.all(
                              pollAnswers.map((answer) =>
                                  PollAnswer.create({
                                      pollId: newPoll.id,
                                      creatorId: accountId,
                                      text: answer.text,
                                      state: 'active',
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
                      const source = await Post.findOne({
                          where: { id: sourceId },
                          attributes: ['id', 'totalLinks'],
                      })
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
                      const updateSourceLinks = await source.update(
                          { totalLinks: source.totalLinks + 1 },
                          { where: { id: sourceId }, silent: true }
                      )
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
    const { postId, type, text, mentions, creatorName, creatorHandle } = req.body
    const mentionType = type.includes('string-') ? 'bead' : 'post'
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const updatePost = await Post.update(
            { text: text || null },
            { where: { id: postId, creatorId: accountId } }
        )
        // todo: move users out of promise
        const notifyMentions = await new Promise(async (resolve) => {
            const users = await User.findAll({
                where: { handle: mentions, state: 'active' },
                attributes: ['id', 'name', 'email'],
            })
            Promise.all(
                users.map(
                    (user) =>
                        new Promise(async (reso) => {
                            const alreadySent = await Notification.findOne({
                                where: {
                                    ownerId: user.id,
                                    type: `${mentionType}-mention`,
                                    userId: accountId,
                                    postId,
                                },
                            })
                            if (alreadySent) reso()
                            else {
                                const sendNotification = await Notification.create({
                                    ownerId: user.id,
                                    type: `${mentionType}-mention`,
                                    seen: false,
                                    userId: accountId,
                                    postId,
                                })
                                const sendEmail = await sgMail.send({
                                    to: user.email,
                                    from: { email: 'admin@weco.io', name: 'we { collective }' },
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
                            }
                        })
                )
            )
                .then((data) => resolve(data))
                .catch((error) => resolve(data, error))
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
                                  const nextMoveNumber = post.Beads.length + 2
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
                    itemType: 'post',
                    itemId: postId,
                    state: 'active',
                    spaceId: id,
                    creatorId: accountId,
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
                    state: 'active',
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
                                    state: 'active',
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
        if (itemType === 'post') model = Post
        if (itemType === 'comment') model = Comment
        if (itemType === 'link') model = Link

        const item = await model.findOne({
            where: { id: itemId },
            attributes: ['totalLikes'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email'],
            },
        })

        const updateTotalLikes = model.update(
            { totalLikes: item.totalLikes + 1 },
            { where: { id: itemId }, silent: true }
        )

        const createReaction = await Reaction.create({
            type: 'like',
            itemType,
            itemId,
            state: 'active',
            spaceId,
            creatorId: accountId,
        })

        const isOwnItem = item.Creator.id === accountId

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

        const createNotification = isOwnItem
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

        const sendEmail = isOwnItem
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

        Promise.all([updateTotalLikes, createReaction, createNotification, sendEmail])
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
        if (itemType === 'post') model = Post
        if (itemType === 'comment') model = Comment
        if (itemType === 'link') model = Link

        const item = await model.findOne({
            where: { id: itemId },
            attributes: ['totalLikes'],
        })

        const updateTotalLikes = await model.update(
            { totalLikes: item.totalLikes - 1 },
            { where: { id: itemId }, silent: true }
        )

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

        Promise.all([updateTotalLikes, removeReaction])
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
            attributes: ['totalRatings'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email'],
            },
        })

        const updateTotalRatings = await model.update(
            { totalRatings: item.totalRatings + 1 },
            { where: { id: itemId }, silent: true }
        )

        const isOwnPost = item.Creator.id === accountId

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

        const sendNotification = isOwnPost
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

        const sendEmail = isOwnPost
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

        const item = await model.findOne({
            where: { id: itemId },
            attributes: ['totalRatings'],
        })

        const updateTotalRatings = await model.update(
            { totalRatings: item.totalRatings - 1 },
            { where: { id: itemId }, silent: true }
        )

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

        Promise.all([updateTotalRatings, removeReaction])
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
            attributes: ['id', 'handle', 'name', 'email'],
        }
        const mods = {
            model: User,
            as: 'Moderators',
            attributes: ['id', 'handle', 'name', 'email'],
        }
        if (type === 'post') {
            model = Post
            attributes = ['id', 'totalLinks']
            include = creator
        } else if (type === 'comment') {
            model = Comment
            attributes = ['id', 'totalLinks', 'itemId']
            include = creator
        } else if (type === 'user') {
            model = User
            attributes = ['id', 'name', 'handle', 'email']
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
            : await source.update(
                  { totalLinks: source.totalLinks + 1 },
                  { where: { id: sourceId }, silent: true }
              )

        const updateTargetTotalLinks = ['user', 'space'].includes(targetType)
            ? null
            : await target.update(
                  { totalLinks: target.totalLinks + 1 },
                  { where: { id: targetId }, silent: true }
              )

        async function notifyOwners(item, type, location) {
            // skip notification if linked item is link creators
            let isOwn = false
            if (['post', 'comment'].includes(type)) isOwn = item.Creator.id === accountId
            if (type === 'user') isOwn = item.id === accountId
            if (type === 'space') isOwn = item.Moderators.find((u) => u.id === accountId)
            if (isOwn) return null
            // send out notifications and emails to recipients
            let recipitents = []
            if (['post', 'comment'].includes(type)) recipitents = [item.Creator]
            if (type === 'user') recipitents = [item]
            if (type === 'space') recipitents = [...item.Moderators]
            return Promise.all(
                recipitents.map(
                    async (recipitent) =>
                        await new Promise(async (resolve) => {
                            const { id, name, email } = recipitent
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

                            const url = `${config.appURL}/linkmap?item=${type}&id=${item.id}`
                            const sendEmail = await sgMail.send({
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

            const source = await sourceModel.findOne({
                where: { id: link.itemAId },
                attributes: ['totalLinks'],
            })

            const target = await targetModel.findOne({
                where: { id: link.itemBId },
                attributes: ['totalLinks'],
            })

            const updateSourceTotalLinks = await sourceModel.update(
                { totalLinks: source.totalLinks - 1 },
                { where: { id: link.itemAId }, silent: true }
            )

            const updateTargetTotalLinks = await targetModel.update(
                { totalLinks: target.totalLinks - 1 },
                { where: { id: link.itemBId }, silent: true }
            )

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
                  const sendEmail = await sgMail.send({
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
                  const sendEmail = await sgMail.send({
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
                  const sendEmail = await sgMail.send({
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
                            }
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
        PollAnswer.update({ state: 'removed' }, { where: { id, creatorId: accountId } })
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
            attributes: [],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email'],
            },
        })
        const isOwnPost = post.Creator.id === accountId
        const updatePostEntry = await SpacePost.update(
            { state: 'removed-by-mod' },
            { where: { postId, spaceId } }
        )
        const sendNotification = isOwnPost
            ? null
            : await Notification.create({
                  ownerId: post.Creator.id,
                  type: 'post-removed-by-mods',
                  seen: false,
                  postId,
                  spaceAId: spaceId,
              })
        const sendEmail = isOwnPost
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

        Promise.all([updatePostEntry, sendNotification, sendEmail])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

module.exports = router

// // add email, bio, and weco match id (if present) to users
// const addUserData = await Promise.all(
//     users.map(
//         (user) =>
//             new Promise(async (resolve) => {
//                 const email = await new Promise(async (reso) => {
//                     client.query(
//                         `SELECT * FROM user_emails WHERE user_emails.user_id = ${user.id} `,
//                         (error, result) => {
//                             if (error || !result.rows[0]) reso(null)
//                             else reso(result.rows[0].email)
//                         }
//                     )
//                 })
//                 const bio = await new Promise(async (reso) => {
//                     client.query(
//                         `SELECT * FROM user_profiles WHERE user_profiles.user_id = ${user.id} `,
//                         (error, result) => {
//                             if (error || !result.rows[0]) reso(null)
//                             else reso(result.rows[0].bio_raw)
//                         }
//                     )
//                 })
//                 const weocMatchId = await new Promise(async (reso) => {
//                     const matchingUser = await User.findOne({ where: { email } })
//                     reso(matchingUser ? matchingUser.id : null)
//                 })
//                 user.email = email
//                 user.bio = bio
//                 user.weocMatchId = weocMatchId
//                 resolve()
//             })
//     )
// )
