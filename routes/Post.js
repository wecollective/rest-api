require('dotenv').config()
const { appURL } = require('../Config')
const express = require('express')
const router = express.Router()
const sgMail = require('@sendgrid/mail')
const { scheduleEventNotification } = require('../ScheduledTasks')
const { v4: uuidv4 } = require('uuid')
const puppeteer = require('puppeteer')
const aws = require('aws-sdk')
const authenticateToken = require('../middleware/authenticateToken')
const sequelize = require('sequelize')
const { Op, QueryTypes } = sequelize
const db = require('../models/index')
const {
    findFullPostAttributes,
    findPostInclude,
    postAccess,
    sourcePostId,
    getLinkedItem,
    getFullLinkedItem,
    accountLike,
    accountMuted,
    attachParentSpace,
    createSpacePost,
    accountReaction,
    accountComment,
    accountLink,
    uploadFiles,
    createPost,
    scheduleNextBeadDeadline,
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
    Poll,
    PollAnswer,
    Url,
    Audio,
} = require('../models')

// initialise
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

        // todo:
        // + update comment and poll answer notification ids when migrated
        // + update comment link ids when migrated
        // + apply poll answer state to link, not new poll answer post
        // + update root comment reply stats (otherwise replies not visible on unique post page)

        // before updates:
        // + remove mediaTypes & originSpaceId from Post model
        // + change postId back to itemId and hasOne to hasMany on Post --> Url, Audio, Image relationships

        // run link-table-additions migration

        // // link table updates
        // const links = await Link.findAll({ attributes: ['id', 'type', 'relationship', 'state'] })
        // Promise.all(
        //     links.map(
        //         (link) =>
        //             new Promise((resolve) => {
        //                 const update = {}
        //                 if (link.relationship === 'source') update.role = 'prompt'
        //                 if (link.state === 'visible') update.state = 'active'
        //                 if (link.state === 'hidden') update.state = 'deleted'
        //                 const types = link.type.split('-')
        //                 update.itemAType = types[0]
        //                 update.itemBType = types[1]
        //                 if (link.type === 'gbg-post') {
        //                     update.itemAType = 'post'
        //                     update.itemBType = 'bead'
        //                     update.relationship = 'parent'
        //                 } else if (link.type === 'card-post') {
        //                     update.itemAType = 'post'
        //                     update.itemBType = 'card-face'
        //                     update.relationship = 'parent'
        //                 } else {
        //                     update.relationship = 'link'
        //                 }
        //                 link.update(update, { silent: true })
        //                     .then(() => resolve())
        //                     .catch((error) => resolve(error))
        //             })
        //     )
        // )
        //     .then(() => res.status(200).json({ message: 'Success' }))
        //     .catch((error) => res.status(500).json(error))

        // // link table card face index updates
        // const posts = await Post.findAll({
        //     where: { type: { [Op.or]: ['card-back', 'card-front'] } },
        //     attributes: ['id', 'type'],
        // })
        // Promise.all(
        //     posts.map(
        //         (post) =>
        //             new Promise(async (resolve) => {
        //                 const link = await Link.findOne({
        //                     where: { type: 'card-post', itemBId: post.id },
        //                     attributes: ['id'],
        //                 })
        //                 const index = post.type === 'card-front' ? 0 : 1
        //                 link.update({ index }, { silent: true })
        //                     .then(() => resolve())
        //                     .catch((error) => resolve(error))
        //             })
        //     )
        // )
        //     .then(() => res.status(200).json({ message: 'Success' }))
        //     .catch((error) => res.status(500).json(error))

        // // post table state updates (needs to be run twice to cover all data??)
        // const posts = await Post.findAll({
        //     where: { state: { [Op.or]: ['hidden', 'dormant', 'broken', 'visible'] } },
        //     attributes: ['id', 'state'],
        // })
        // Promise.all(
        //     posts.map(
        //         (post) =>
        //             new Promise((resolve) => {
        //                 const update = {}
        //                 if (['hidden', 'dormant', 'broken'].includes(post.state))
        //                     update.state = 'deleted'
        //                 else update.state = 'active'
        //                 post.update(update, { silent: true })
        //                     .then(() => resolve())
        //                     .catch((error) => resolve(error))
        //             })
        //     )
        // )
        //     .then(() => res.status(200).json({ message: 'Success' }))
        //     .catch((error) => res.status(500).json(error))

        // run post-table-updates migration
        // add back in mediaTypes & originSpaceId values on Post model

        // // post table media type updates
        // const posts = await Post.findAll({
        //     attributes: ['id', 'text', 'title', 'type'],
        //     include: [
        //         {
        //             model: Url,
        //             where: { state: 'active' },
        //             attributes: ['id'],
        //             required: false,
        //         },
        //         {
        //             model: Image,
        //             attributes: ['id'],
        //             required: false,
        //         },
        //         {
        //             model: Audio,
        //             attributes: ['id'],
        //             required: false,
        //         },
        //         {
        //             model: Event,
        //             attributes: ['id'],
        //             required: false,
        //         },
        //         {
        //             model: Poll,
        //             attributes: ['id'],
        //             required: false,
        //         },
        //         { model: GlassBeadGame, attributes: ['id'], required: false },
        //         {
        //             model: Post,
        //             as: 'CardSides',
        //             attributes: ['id'],
        //             through: { where: { type: 'card-post' } },
        //             required: false,
        //         },
        //     ],
        // })

        // // test before applying updates (as media tables updated)
        // // const filteredPosts = posts.filter((post) => post.CardSides.length > 0)
        // // res.status(200).json(filteredPosts)

        // Promise.all(
        //     posts.map(
        //         (post) =>
        //             new Promise((resolve) => {
        //                 // find media types
        //                 const mediaTypes = []
        //                 if (post.text || post.title) mediaTypes.push('text')
        //                 if (post.Urls.length > 0) mediaTypes.push('url')
        //                 if (post.Images.length > 0) mediaTypes.push('image')
        //                 if (post.Audios.length > 0) mediaTypes.push('audio')
        //                 if (post.CardSides.length > 0) mediaTypes.push('card')
        //                 if (post.Event) mediaTypes.push('event')
        //                 if (post.Poll) mediaTypes.push('poll')
        //                 if (post.GlassBeadGame) mediaTypes.push('glass-bead-game')
        //                 if (post.type === 'prism') mediaTypes.push('prism')
        //                 let mergedMediaTypes = mediaTypes.join(',')
        //                 if (mergedMediaTypes === '') mergedMediaTypes = post.type
        //                 // find post type
        //                 let type = 'post'
        //                 if (post.type.includes('gbg') || post.type === 'glass-bead') type = 'bead'
        //                 if (post.type.includes('card-')) type = 'card-face'
        //                 post.update({ type, mediaTypes: mergedMediaTypes }, { silent: true })
        //                     .then(() => resolve())
        //                     .catch((error) => resolve(error))
        //             })
        //     )
        // )
        //     .then(() => res.status(200).json({ message: 'Success' }))
        //     .catch((error) => res.status(500).json(error))

        // // test indexing on gbg posts
        // const posts = await Post.findAll({
        //     where: { mediaTypes: { [Op.like]: `%glass-bead-game%` } },
        //     attributes: ['id'],
        //     include: {
        //         model: Post,
        //         as: 'Beads',
        //         attributes: ['id'],
        //         through: {
        //             where: { type: 'gbg-post', state: 'active' }, // state: ['visible', 'account-deleted']
        //             attributes: ['index', 'relationship', 'state'],
        //         },
        //     },
        // })
        // const postsWithBeadIndexes = posts
        //     .filter((post) => post.Beads.length)
        //     .map((post) => {
        //         return post.Beads.map((bead) => bead.Link.index).sort((a, b) => a - b)
        //         // return {
        //         //     id: post.id,
        //         //     beadIndexes: post.Beads.map((bead) => bead.Link.index).sort((a, b) => a - b),
        //         // }
        //     })
        // res.status(200).json(postsWithBeadIndexes)

        // fix broken gbg indexes & duplicates here

        // // fix indexes on gbg links
        // const posts = await Post.findAll({
        //     where: { mediaTypes: { [Op.like]: `%glass-bead-game%` } },
        //     attributes: ['id'],
        //     include: {
        //         model: Post,
        //         as: 'Beads',
        //         attributes: ['id'],
        //         through: {
        //             where: { type: 'gbg-post' },
        //             attributes: ['id', 'index', 'role'],
        //         },
        //     },
        // })
        // Promise.all(
        //     posts
        //         .filter((post) => post.Beads.length)
        //         .map(
        //             (post) =>
        //                 new Promise(async (resolve) => {
        //                     const sortedBeads = post.Beads.filter(
        //                         (bead) => bead.Link.role !== 'prompt'
        //                     ).sort((a, b) => a.Link.index - b.Link.index)
        //                     if (sortedBeads[0].Link.index === 0) resolve()
        //                     else {
        //                         Promise.all(
        //                             sortedBeads.map((bead) =>
        //                                 Link.decrement('index', {
        //                                     where: { id: bead.Link.id },
        //                                     silent: true,
        //                                 })
        //                             )
        //                         )
        //                             .then(() => resolve())
        //                             .catch((error) => resolve(error))
        //                     }
        //                 })
        //         )
        // )
        //     .then(() => res.status(200).json({ message: 'Success' }))
        //     .catch((error) => res.status(500).json(error))

        // run media table updates and then update Post model media foreignKeys (not hasMany --> hasOne) here

        // // embed urls, images, audio in posts
        // const posts = await Post.findAll({
        //     // where: { type: { [Op.or]: ['post', 'card-face'] } } (considered removing for beads but decided against)
        //     attributes: ['id', 'type', 'creatorId', 'createdAt'],
        //     include: [
        //         {
        //             model: Url,
        //             where: { state: 'active' },
        //             attributes: ['id'],
        //             required: false,
        //         },
        //         {
        //             model: Image,
        //             attributes: ['id', 'index', 'caption'],
        //             required: false,
        //         },
        //         {
        //             model: Audio,
        //             attributes: ['id'],
        //             required: false,
        //         },
        //     ],
        // })
        // const filteredPosts = posts.filter(
        //     (post) => post.Urls.length || post.Images.length || post.Audios.length
        // )

        // Promise.all(
        //     filteredPosts.map(
        //         (post) =>
        //             new Promise(async (resolve1) => {
        //                 const handleUrls = await Promise.all(
        //                     post.Urls.map(
        //                         (url) =>
        //                             new Promise(async (resolve2) => {
        //                                 // create new post
        //                                 const newPost = await Post.create(
        //                                     {
        //                                         ...defaultPostValues,
        //                                         type: 'url',
        //                                         mediaTypes: 'url',
        //                                         creatorId: post.creatorId,
        //                                         createdAt: post.createdAt,
        //                                         updatedAt: post.createdAt,
        //                                         lastActivity: post.createdAt,
        //                                     },
        //                                     { silent: true }
        //                                 )
        //                                 // update media item to link to new post
        //                                 const updateMedia = await Url.update(
        //                                     { postId: newPost.id },
        //                                     { where: { id: url.id }, silent: true }
        //                                 )
        //                                 // link new post to parent post
        //                                 const createLink = await Link.create(
        //                                     {
        //                                         creatorId: post.creatorId,
        //                                         itemAType: post.type,
        //                                         itemBType: 'url',
        //                                         itemAId: post.id,
        //                                         itemBId: newPost.id,
        //                                         relationship: 'parent',
        //                                         state: 'active',
        //                                         totalLikes: 0,
        //                                         totalComments: 0,
        //                                         totalRatings: 0,
        //                                         createdAt: post.createdAt,
        //                                         updatedAt: post.createdAt,
        //                                     },
        //                                     { silent: true }
        //                                 )
        //                                 Promise.all([updateMedia, createLink])
        //                                     .then(() => resolve2())
        //                                     .catch((error) => resolve2(error))
        //                             })
        //                     )
        //                 )
        //                 const handleImages = await Promise.all(
        //                     post.Images.map(
        //                         (image) =>
        //                             new Promise(async (resolve2) => {
        //                                 // create new post
        //                                 const newPost = await Post.create(
        //                                     {
        //                                         ...defaultPostValues,
        //                                         type: 'image',
        //                                         mediaTypes: 'image',
        //                                         text: image.caption,
        //                                         creatorId: post.creatorId,
        //                                         createdAt: post.createdAt,
        //                                         updatedAt: post.createdAt,
        //                                         lastActivity: post.createdAt,
        //                                     },
        //                                     { silent: true }
        //                                 )
        //                                 // update media item to link to new post
        //                                 const updateMedia = await Image.update(
        //                                     { postId: newPost.id },
        //                                     { where: { id: image.id }, silent: true }
        //                                 )
        //                                 // link new post to parent post
        //                                 const createLink = await Link.create(
        //                                     {
        //                                         creatorId: post.creatorId,
        //                                         itemAType: post.type,
        //                                         itemBType: 'image',
        //                                         itemAId: post.id,
        //                                         itemBId: newPost.id,
        //                                         relationship: 'parent',
        //                                         index: image.index,
        //                                         state: 'active',
        //                                         totalLikes: 0,
        //                                         totalComments: 0,
        //                                         totalRatings: 0,
        //                                         createdAt: post.createdAt,
        //                                         updatedAt: post.createdAt,
        //                                     },
        //                                     { silent: true }
        //                                 )
        //                                 Promise.all([updateMedia, createLink])
        //                                     .then(() => resolve2())
        //                                     .catch((error) => resolve2(error))
        //                             })
        //                     )
        //                 )
        //                 const handleAudios = await Promise.all(
        //                     post.Audios.map(
        //                         (audio) =>
        //                             new Promise(async (resolve2) => {
        //                                 // create new post
        //                                 const newPost = await Post.create(
        //                                     {
        //                                         ...defaultPostValues,
        //                                         type: 'audio',
        //                                         mediaTypes: 'audio',
        //                                         creatorId: post.creatorId,
        //                                         createdAt: post.createdAt,
        //                                         updatedAt: post.createdAt,
        //                                         lastActivity: post.createdAt,
        //                                     },
        //                                     { silent: true }
        //                                 )
        //                                 // update media item to link to new post
        //                                 const updateMedia = await Audio.update(
        //                                     { postId: newPost.id },
        //                                     { where: { id: audio.id }, silent: true }
        //                                 )
        //                                 // link new post to parent post
        //                                 const createLink = await Link.create(
        //                                     {
        //                                         creatorId: post.creatorId,
        //                                         itemAType: post.type,
        //                                         itemBType: 'audio',
        //                                         itemAId: post.id,
        //                                         itemBId: newPost.id,
        //                                         relationship: 'parent',
        //                                         state: 'active',
        //                                         totalLikes: 0,
        //                                         totalComments: 0,
        //                                         totalRatings: 0,
        //                                         createdAt: post.createdAt,
        //                                         updatedAt: post.createdAt,
        //                                     },
        //                                     { silent: true }
        //                                 )
        //                                 Promise.all([updateMedia, createLink])
        //                                     .then(() => resolve2())
        //                                     .catch((error) => resolve2(error))
        //                             })
        //                     )
        //                 )
        //                 Promise.all([handleUrls, handleImages, handleAudios])
        //                     .then(() => resolve1())
        //                     .catch((error) => resolve1(error))
        //             })
        //     )
        // )
        //     .then(() => res.status(200).json({ message: 'Success' }))
        //     .catch((error) => res.status(500).json(error))

        // run gbg-total-beads migration here

        // // add totalBeads value to GBGs
        // const games = await GlassBeadGame.findAll({ attributes: ['id', 'postId'] })
        // Promise.all(
        //     games.map(
        //         (game) =>
        //             new Promise(async (resolve) => {
        //                 const totalBeads = await Link.count({
        //                     where: {
        //                         itemAType: 'post',
        //                         itemAId: game.postId,
        //                         itemBType: 'bead',
        //                         relationship: 'parent',
        //                         state: 'active',
        //                     },
        //                 })
        //                 game.update({ totalBeads }, { silent: true })
        //                     .then(() => resolve())
        //                     .catch((error) => resolve(error))
        //             })
        //     )
        // )
        //     .then(() => res.status(200).json({ message: 'Success' }))
        //     .catch((error) => res.status(500).json(error))

        // // migrate root comments to post table (4 mins 40 seconds)
        // const comments = await Comment.findAll()

        // const rootCommentMappings = []

        // const migrateRootComments = await Promise.all(
        //     comments
        //         .filter((c) => !c.parentCommentId)
        //         .map(
        //             (comment) =>
        //                 new Promise(async (resolve) => {
        //                     // create new post
        //                     const newPost = await Post.create(
        //                         {
        //                             ...defaultPostValues,
        //                             type: 'comment',
        //                             text: comment.text,
        //                             mediaTypes: 'text',
        //                             creatorId: comment.creatorId,
        //                             originSpaceId: comment.spaceId,
        //                             state: comment.state === 'visible' ? 'active' : 'deleted',
        //                             totalLikes: comment.totalLikes,
        //                             totalLinks: comment.totalLinks,
        //                             totalRatings: comment.totalRatings,
        //                             createdAt: comment.createdAt,
        //                             updatedAt: comment.updatedAt,
        //                             lastActivity: comment.createdAt,
        //                         },
        //                         { silent: true }
        //                     )
        //                     // add comment mapping
        //                     rootCommentMappings.push({ commentId: comment.id, postId: newPost.id })
        //                     // create link to post
        //                     const createLink = await Link.create(
        //                         {
        //                             creatorId: comment.creatorId,
        //                             itemAType: comment.itemType,
        //                             itemBType: 'comment',
        //                             itemAId: comment.itemId,
        //                             itemBId: newPost.id,
        //                             relationship: 'parent',
        //                             state: 'active',
        //                             totalLikes: 0,
        //                             totalComments: 0,
        //                             totalRatings: 0,
        //                             createdAt: comment.createdAt,
        //                             updatedAt: comment.createdAt,
        //                         },
        //                         { silent: true }
        //                     )
        //                     // update reactions
        //                     const updateReactions = await Reaction.update(
        //                         { itemId: newPost.id },
        //                         { where: { itemType: 'comment', itemId: comment.id }, silent: true }
        //                     )
        //                     Promise.all([createLink, updateReactions])
        //                         .then(() => resolve())
        //                         .catch((error) => resolve(error))
        //                 })
        //         )
        // )

        // const migrateChildComments = await Promise.all(
        //     comments
        //         .filter((c) => c.parentCommentId)
        //         .map(
        //             (comment) =>
        //                 new Promise(async (resolve) => {
        //                     // create new post
        //                     const newPost = await Post.create(
        //                         {
        //                             ...defaultPostValues,
        //                             type: 'comment',
        //                             text: comment.text,
        //                             mediaTypes: 'text',
        //                             creatorId: comment.creatorId,
        //                             originSpaceId: comment.spaceId,
        //                             state: comment.state === 'visible' ? 'active' : 'deleted',
        //                             totalLikes: comment.totalLikes,
        //                             totalLinks: comment.totalLinks,
        //                             totalRatings: comment.totalRatings,
        //                             createdAt: comment.createdAt,
        //                             updatedAt: comment.updatedAt,
        //                             lastActivity: comment.createdAt,
        //                         },
        //                         { silent: true }
        //                     )
        //                     // find parent comment
        //                     const parentComment = rootCommentMappings.find(
        //                         (c) => c.commentId === comment.parentCommentId
        //                     )
        //                     // create link to post
        //                     const createRootLink = await Link.create(
        //                         {
        //                             creatorId: comment.creatorId,
        //                             itemAType: comment.itemType,
        //                             itemBType: 'comment',
        //                             itemAId: comment.itemId,
        //                             itemBId: newPost.id,
        //                             relationship: 'root',
        //                             state: 'active',
        //                             totalLikes: 0,
        //                             totalComments: 0,
        //                             totalRatings: 0,
        //                             createdAt: comment.createdAt,
        //                             updatedAt: comment.createdAt,
        //                         },
        //                         { silent: true }
        //                     )
        //                     const createParentLink = await Link.create(
        //                         {
        //                             creatorId: comment.creatorId,
        //                             itemAType: 'comment',
        //                             itemBType: 'comment',
        //                             itemAId: parentComment.postId,
        //                             itemBId: newPost.id,
        //                             relationship: 'parent',
        //                             state: 'active',
        //                             totalLikes: 0,
        //                             totalComments: 0,
        //                             totalRatings: 0,
        //                             createdAt: comment.createdAt,
        //                             updatedAt: comment.createdAt,
        //                         },
        //                         { silent: true }
        //                     )
        //                     // update reactions
        //                     const updateReactions = await Reaction.update(
        //                         { itemId: newPost.id },
        //                         { where: { itemType: 'comment', itemId: comment.id }, silent: true }
        //                     )
        //                     Promise.all([createRootLink, createParentLink, updateReactions])
        //                         .then(() => resolve())
        //                         .catch((error) => resolve(error))
        //                 })
        //         )
        // )

        // const tasks = [migrateRootComments, migrateChildComments]
        // for (const task of tasks) await task
        // res.status(200).json({ message: 'Success' })

        // // todo: add searchable text to comments using front end after migration

        // // migrate poll answers (add root link to post too?)
        // const pollAnswers = await PollAnswer.findAll()
        // Promise.all(
        //     pollAnswers.map(
        //         (answer) =>
        //             new Promise(async (resolve) => {
        //                 // create new post
        //                 const newPost = await Post.create(
        //                     {
        //                         ...defaultPostValues,
        //                         type: 'poll-answer',
        //                         text: answer.text,
        //                         searchableText: answer.text,
        //                         mediaTypes: 'text',
        //                         creatorId: answer.creatorId,
        //                         state: answer.state,
        //                         createdAt: answer.createdAt,
        //                         updatedAt: answer.updatedAt,
        //                         lastActivity: answer.createdAt,
        //                     },
        //                     { silent: true }
        //                 )
        //                 // create link to poll
        //                 const createLink = await Link.create(
        //                     {
        //                         creatorId: answer.creatorId,
        //                         itemAType: 'poll',
        //                         itemBType: 'poll-answer',
        //                         itemAId: answer.pollId,
        //                         itemBId: newPost.id,
        //                         relationship: 'parent',
        //                         state: 'active',
        //                         totalLikes: 0,
        //                         totalComments: 0,
        //                         totalRatings: 0,
        //                         createdAt: answer.createdAt,
        //                         updatedAt: answer.createdAt,
        //                     },
        //                     { silent: true }
        //                 )
        //                 // update reactions
        //                 const updateReactions = await Reaction.update(
        //                     { itemId: newPost.id },
        //                     { where: { type: 'vote', itemId: answer.id }, silent: true }
        //                 )
        //                 Promise.all([createLink, updateReactions])
        //                     .then(() => resolve())
        //                     .catch((error) => resolve(error))
        //             })
        //     )
        // )
        //     .then(() => res.status(200).json({ message: 'Success' }))
        //     .catch((error) => res.status(500).json(error))

        // update Post model hasMany --> hasOne
    }
})

// GET
router.get('/post-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.query
    const post = await Post.findOne({
        where: { id: postId, state: 'active' },
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

router.get('/account-reactions', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postType, postId, types } = req.query
    const liked = types.includes('like')
        ? await accountReaction('like', postType, postId, accountId)
        : 0
    const rated = types.includes('rating')
        ? await accountReaction('rating', postType, postId, accountId)
        : 0
    const reposted = types.includes('repost')
        ? await accountReaction('repost', postType, postId, accountId)
        : 0
    const commented = types.includes('comment') ? await accountComment(postId, accountId) : 0
    const linked = types.includes('link') ? await accountLink(postId, accountId) : 0
    res.status(200).json({ liked, rated, reposted, commented, linked })
})

router.get('/comment-links', async (req, res) => {
    const { postId } = req.query
    const [{ parentId }] = await db.sequelize.query(
        `SELECT itemAId AS parentId FROM Links
        WHERE itemBId = :postId
        AND itemBType = 'comment'
        AND relationship = 'parent'
        AND state = 'active'`,
        { replacements: { postId }, type: QueryTypes.SELECT }
    )
    const root = await db.sequelize.query(
        `SELECT itemAId AS rootId FROM Links
        WHERE itemBId = :postId
        AND itemBType = 'comment'
        AND relationship = 'root'
        AND state = 'active'`,
        { replacements: { postId }, type: QueryTypes.SELECT }
    )
    res.status(200).json({ parentId, rootId: root[0] ? root[0].rootId : null })
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

        function findTypes() {
            if (linkTypes === 'All Types') return ['post', 'comment', 'user', 'space']
            if (linkTypes === 'Posts') return ['post']
            if (linkTypes === 'Comments') return ['comment']
            if (linkTypes === 'Spaces') return ['user']
            if (linkTypes === 'Users') return ['space']
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
                        'itemAType',
                        'itemBType',
                        'description',
                        'totalLikes',
                        'createdAt',
                    ],
                    where: {
                        state: 'active',
                        [Op.or]: [
                            {
                                // incoming
                                itemBType: modelType,
                                itemBId: id,
                                itemAType: findTypes(),
                                itemAId: { [Op.not]: parentItemId },
                            },
                            {
                                // outgoing
                                itemAType: modelType,
                                itemAId: id,
                                itemBType: findTypes(),
                                itemBId: { [Op.not]: parentItemId },
                            },
                        ],
                    },
                })
                const linkedItems = []
                Promise.all(
                    links.map(async (link) => {
                        link.setDataValue('uuid', uuidv4())
                        // incoming links
                        if (link.itemAId === id && link.itemAType === modelType) {
                            link.setDataValue('direction', 'outgoing')
                            const item = await getLinkedItem(link.itemBType, link.itemBId)
                            if (item) {
                                item.setDataValue('uuid', uuidv4())
                                item.setDataValue('parentItemId', id)
                                if (['user', 'space'].includes(link.itemBType)) {
                                    item.setDataValue('totalLikes', 0)
                                    item.setDataValue('totalLinks', 0)
                                }
                                linkedItems.push({ item, Link: link })
                            }
                        }
                        // outgoing links
                        if (link.itemBId === id && link.itemBType === modelType) {
                            link.setDataValue('direction', 'incoming')
                            const item = await getLinkedItem(link.itemAType, link.itemAId)
                            if (item) {
                                item.setDataValue('uuid', uuidv4())
                                item.setDataValue('parentItemId', id)
                                if (['user', 'space'].includes(link.itemBType)) {
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

router.get('/post-comments', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, offset } = req.query
    console.log(999, postId, offset, accountId)
    const limits = [10, 10, 10, 10, 10] // number of comments to inlcude per generation (length of array determines max depth)
    const post = await Post.findOne({ where: { id: postId }, attributes: ['id'] })
    let rootPostId = +postId
    // get root post id for comments and poll answers
    if (['comment', 'poll-answer'].includes(post.type)) {
        const [{ itemAId }] = await db.sequelize.query(
            `
                SELECT itemAId AS root FROM Links
                WHERE itemBId = :postId
                AND relationship = 'root'
                AND state = 'active'
            `,
            { replacements: { postId }, type: QueryTypes.SELECT }
        )
        if (itemAId) rootPostId = itemAId
    }

    // todo: count total children on first level
    // const total = +offset
    // ? null
    // : await Link.count({
    //       where: { itemAType: 'post', itemAId: postId, itemBType: 'image', state: 'active' },
    //   })

    async function getChildComments(root, depth) {
        return new Promise(async (resolve) => {
            const comments = await root.getBlocks({
                attributes: findFullPostAttributes('Post', accountId),
                through: {
                    where: { itemBType: 'comment', relationship: 'parent', state: 'active' },
                },
                joinTableAttributes: [],
                include: [
                    {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    },
                ],
                limit: limits[depth],
                offset: depth ? 0 : +offset,
                order: [
                    ['totalLikes', 'DESC'],
                    ['createdAt', 'ASC'],
                    ['id', 'ASC'],
                ],
            })
            comments.forEach((c) => c.setDataValue('Comments', []))
            root.setDataValue('Comments', comments)
            root.setDataValue('rootPostId', rootPostId)
            if (!limits[depth + 1]) resolve()
            else {
                Promise.all(
                    root.dataValues.Comments.map((comment) => getChildComments(comment, depth + 1))
                )
                    .then(() => resolve())
                    .catch((error) => resolve(error))
            }
        })
    }

    getChildComments(post, 0)
        .then(() => res.status(200).json(post.dataValues.Comments))
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

router.get('/poll-data', async (req, res) => {
    const { postId } = req.query
    const poll = await Poll.findOne({
        where: { postId: postId },
        attributes: ['id', 'type', 'answersLocked'],
    })
    const answers = await poll.getAnswers({
        where: { state: 'active' },
        attributes: ['id', 'mediaTypes', 'text', 'createdAt'],
        through: { where: { itemBType: 'poll-answer', state: ['active', 'done'] } },
        joinTableAttributes: ['state'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
            {
                model: Reaction,
                where: { itemType: 'poll-answer' },
                attributes: ['value', 'state', 'itemId', 'createdAt', 'updatedAt'],
                include: {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                },
                required: false,
            },
        ],
    })
    poll.setDataValue('Answers', answers)
    res.status(200).json(poll)
})

router.get('/gbg-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.query
    const post = await Post.findOne({
        where: { id: postId },
        attributes: ['id'],
        include: { model: GlassBeadGame },
    })
    const beads = await post.getBeads({
        attributes: [...findFullPostAttributes('Post', accountId), 'color'],
        through: { where: { itemBType: 'bead', state: ['active', 'account-deleted'] } },
        joinTableAttributes: ['relationship', 'state'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
        order: [[sequelize.col('Link.index'), 'ASC']],
        limit: 3,
    })
    const players = await post.getPlayers({
        attributes: ['id', 'handle', 'name', 'flagImagePath', 'state'],
        through: { where: { type: 'glass-bead-game' } },
        joinTableAttributes: ['state', 'color'],
    })

    res.status(200).json({ game: post.GlassBeadGame, beads, players })
})

router.get('/next-beads', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, offset } = req.query
    const post = await Post.findOne({ where: { id: postId }, attributes: ['id'] })
    const beads = await post.getBeads({
        attributes: [...findFullPostAttributes('Post', accountId), 'color'],
        through: { where: { itemBType: 'bead', state: ['active', 'account-deleted'] } },
        joinTableAttributes: ['index', 'relationship', 'state'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
        order: [[sequelize.col('Link.index'), 'ASC']],
        offset: +offset,
        limit: 10,
    })

    res.status(200).json(beads)
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
    const accountId = req.user ? req.user.id : null
    const { url } = req.query
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const browser = await puppeteer.launch() // { headless: false })
        try {
            const page = await browser.newPage()
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 }) // { timeout: 20000 }, { waitUntil: 'load', 'domcontentloaded', 'networkidle0', 'networkidle2' }
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
            res.status(200).json(urlData)
        } catch (error) {
            res.status(200).json({ data: null, error })
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

router.get('/post-urls', async (req, res) => {
    const { postId } = req.query
    const post = await Post.findOne({ where: { id: postId }, attributes: ['id'] })
    const urlBlocks = await post.getBlocks({
        attributes: ['id'],
        through: { where: { itemBType: 'url', state: 'active' } },
        joinTableAttributes: [],
        include: [
            {
                model: Url,
                attributes: ['id', 'url', 'image', 'title', 'description', 'domain'],
            },
        ],
    })
    res.status(200).json(urlBlocks)
})

router.get('/post-images', async (req, res) => {
    const { postId, offset } = req.query
    const post = await Post.findOne({ where: { id: postId }, attributes: ['id'] })
    const blocks = await post.getBlocks({
        attributes: ['id', 'text'],
        through: { where: { itemBType: 'image', state: 'active' } },
        joinTableAttributes: ['index'],
        include: [{ model: Image, attributes: ['id', 'url'] }],
        order: [[sequelize.col('Link.index'), 'ASC']],
        offset: +offset,
        limit: +offset ? 10 : 4,
    })
    const total = +offset
        ? null
        : await Link.count({
              where: { itemAType: 'post', itemAId: postId, itemBType: 'image', state: 'active' },
          })
    res.status(200).json({ blocks, total })
})

router.get('/post-audio', async (req, res) => {
    const { postId, offset } = req.query
    const post = await Post.findOne({ where: { id: postId }, attributes: ['id'] })
    const blocks = await post.getBlocks({
        attributes: ['id', 'text'],
        through: { where: { itemBType: 'audio', state: 'active' } },
        joinTableAttributes: ['index'],
        include: [{ model: Audio, attributes: ['id', 'url'] }],
        order: [[sequelize.col('Link.index'), 'ASC']],
        offset: +offset,
        limit: +offset ? 10 : 4,
    })
    const total = +offset
        ? null
        : await Link.count({
              where: { itemAType: 'post', itemAId: postId, itemBType: 'image', state: 'active' },
          })
    res.status(200).json({ blocks, total })
})

router.get('/card-faces', async (req, res) => {
    const { postId } = req.query
    const post = await Post.findOne({ where: { id: postId }, attributes: ['id'] })
    const cardBlocks = await post.getBlocks({
        attributes: ['id', 'text', 'watermark', 'totalLikes', 'totalLinks'],
        through: { where: { itemBType: 'card-face', state: 'active' } },
        joinTableAttributes: ['index'],
        include: [
            {
                model: Post,
                as: 'Blocks',
                through: { where: { itemBType: 'image', state: 'active' } },
                attributes: ['id'],
                include: [
                    {
                        model: Image,
                        attributes: ['id', 'url'],
                    },
                ],
            },
        ],
    })
    res.status(200).json(cardBlocks)
})

router.post('/create-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // upload files and create post
        const { postData, files } = await uploadFiles(req, res, accountId)
        const { post, event } = await createPost(postData, files, accountId)
        const { spaceIds, source } = postData
        // store spaceIds and update with ancestors for response
        const allSpaceIds = [...spaceIds]
        // add spaces
        const addSpaces = spaceIds
            ? await new Promise(async (resolve) => {
                  const addDirectSpaces = await Promise.all(
                      spaceIds.map((spaceId) =>
                          createSpacePost(accountId, spaceId, post.id, 'post', 'direct')
                      )
                  )
                  // gather direct spaces ancestor ids
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
                  let ancestorIds = []
                  spaces.forEach((space) =>
                      ancestorIds.push(...space.SpaceAncestors.map((space) => space.id))
                  )
                  // remove duplicates and direct spaces
                  ancestorIds = [...new Set(ancestorIds)].filter((id) => !spaceIds.includes(id))
                  // store ancestor ids for response
                  allSpaceIds.push(...ancestorIds)
                  const addIndirectSpaces = await Promise.all(
                      ancestorIds.map((spaceId) =>
                          createSpacePost(accountId, spaceId, post.id, 'post', 'indirect')
                      )
                  )
                  Promise.all([addDirectSpaces, addIndirectSpaces])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })
            : null

        // todo: notify source creator
        const addLink = source
            ? await new Promise(async (resolve) => {
                  const createNewLink = await Link.create({
                      state: 'active',
                      creatorId: accountId,
                      itemAType: source.type,
                      itemBType: 'post',
                      itemAId: source.id,
                      itemBId: post.id,
                      description: source.linkDescription,
                      totalLikes: 0,
                      totalComments: 0,
                      totalRatings: 0,
                  })
                  const updateSourceLinks = await Post.increment('totalLinks', {
                      where: { id: source.id },
                      silent: true,
                  })
                  const updateTargetLinks = await post.update({ totalLinks: 1 }, { silent: true })
                  Promise.all([createNewLink, updateSourceLinks, updateTargetLinks])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })
            : null

        Promise.all([addSpaces, addLink])
            .then(() => res.status(200).json({ post, allSpaceIds, event }))
            .catch((error) => res.status(500).json(error))
    }
})

// todo: notify parent owner
router.post('/create-comment', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { postData, files } = await uploadFiles(req, res, accountId)
        const { post } = await createPost(postData, files, accountId)
        // add comment links
        const { parent, root } = postData.link
        const addLinks = await new Promise(async (resolve) => {
            const addParentLink = await Link.create({
                creatorId: accountId,
                itemAType: parent.type,
                itemBType: 'comment',
                itemAId: parent.id,
                itemBId: post.id,
                relationship: 'parent',
                state: 'active',
                totalLikes: 0,
                totalComments: 0,
                totalRatings: 0,
            })
            const incrementParentComments = await Post.increment('totalComments', {
                where: { id: parent.id },
                silent: true,
            })
            const addRootLink = root
                ? await Link.create({
                      creatorId: accountId,
                      itemAType: root.type,
                      itemBType: 'comment',
                      itemAId: root.id,
                      itemBId: post.id,
                      relationship: 'root',
                      state: 'active',
                      totalLikes: 0,
                      totalComments: 0,
                      totalRatings: 0,
                  })
                : null
            const incrementRootComments = root
                ? await Post.increment('totalComments', {
                      where: { id: root.id },
                      silent: true,
                  })
                : null
            Promise.all([
                addParentLink,
                incrementParentComments,
                addRootLink,
                incrementRootComments,
            ])
                .then(() => resolve())
                .catch((error) => resolve(error))
        })
        // todo: notify parent owner
        Promise.all([addLinks])
            .then(() => res.status(200).json(post))
            .catch((error) => res.status(500).json(error))
    }
})

// todo: notify parent owner
router.post('/create-poll-answer', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { postData, files } = await uploadFiles(req, res, accountId)
        const { post } = await createPost(postData, files, accountId)
        const { parent } = postData.link
        const addParentLink = await Link.create({
            creatorId: accountId,
            itemAType: parent.type,
            itemBType: 'poll-answer',
            itemAId: parent.id,
            itemBId: post.id,
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })
        // todo: notify parent owner
        Promise.all([addParentLink])
            .then(() => res.status(200).json(post))
            .catch((error) => res.status(500).json(error))
    }
})

router.post('/create-bead', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { postData, files } = await uploadFiles(req, res, accountId)
        const { post: newBead } = await createPost(postData, files, accountId)
        const { parent } = postData.link

        const creator = await User.findOne({
            where: { id: accountId },
            attributes: ['name', 'handle'],
        })

        const gamePost = await Post.findOne({
            where: { id: parent.id },
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                },
                { model: GlassBeadGame },
                {
                    model: User,
                    as: 'Players',
                    attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                    through: { where: { type: 'glass-bead-game' }, attributes: ['index'] },
                },
                {
                    model: Post,
                    as: 'Beads',
                    required: false,
                    through: { where: { state: 'active' }, attributes: ['index'] },
                    include: {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                    },
                },
            ],
        })

        const createLink = await Link.create({
            creatorId: accountId,
            itemAType: 'post',
            itemBType: 'bead',
            itemAId: parent.id,
            itemBId: newBead.id,
            index: gamePost.GlassBeadGame.totalBeads,
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })

        const { synchronous, multiplayer, moveTimeWindow } = gamePost.GlassBeadGame
        const notifyPlayers =
            !synchronous && multiplayer
                ? await new Promise(async (resolve) => {
                      // find other players to notify
                      const otherPlayers = []
                      if (gamePost.Players.length) {
                          // if restricted game, use linked Players
                          otherPlayers.push(...gamePost.Players.filter((p) => p.id !== accountId))
                      } else {
                          // if open game, use linked Bead Creators
                          gamePost.Beads.forEach((bead) => {
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
                                  new Promise(async (resolve2) => {
                                      const notifyPlayer = await Notification.create({
                                          type: 'gbg-move-from-other-player',
                                          ownerId: p.id,
                                          postId: parent.id,
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
                                                    Hi ${p.name}, ${creator.name} just added a new bead.
                                                    https://${appURL}/p/${parent.id}
                                                `,
                                                html: `
                                                    <p>
                                                        Hi ${p.name},
                                                        <br/>
                                                        <a href='${appURL}/u/${creator.handle}'>${creator.name}</a>
                                                        just added a new 
                                                        <a href='${appURL}/p/${parent.id}'>bead</a>.
                                                    </p>
                                                `,
                                            })
                                      Promise.all([notifyPlayer, emailPlayer])
                                          .then(() => resolve2())
                                          .catch((error) => resolve2(error))
                                  })
                          )
                      )
                      // schedule next deadline
                      const scheduleNewDeadline = moveTimeWindow
                          ? await scheduleNextBeadDeadline(
                                parent.id,
                                gamePost.GlassBeadGame,
                                gamePost.Players
                            )
                          : null

                      Promise.all([sendNotifications, scheduleNewDeadline])
                          .then((data) => resolve(data[1]))
                          .catch((error) => resolve(error))
                  })
                : null

        const incrementTotalBeads = await GlassBeadGame.increment('totalBeads', {
            where: { postId: parent.id },
        })

        const updateLastPostActivity = await Post.update(
            { lastActivity: new Date() },
            { where: { id: parent.id }, silent: true }
        )

        Promise.all([createLink, notifyPlayers, incrementTotalBeads, updateLastPostActivity])
            .then((data) => res.status(200).json({ newBead, newDeadline: data[1] }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// todo: handle comments
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
                                        http://${appURL}/p/${postId}
                                    `,
                                      html: `
                                        <p>
                                            Hi ${user.name},
                                            <br/>
                                            <a href='${appURL}/u/${post.Creator.handle}'>${post.Creator.name}</a>
                                            just mentioned you in a 
                                            <a href='${appURL}/p/${postId}'>${mentionType}</a>
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
                        http://${appURL}/p/${postId}
                    `,
                  html: `
                        <p>
                            Hi ${post.Creator.name},
                            <br/>
                            <a href='${appURL}/u/${accountHandle}'>${accountName}</a>
                            just reposted your
                            <a href='${appURL}/p/${postId}'>post</a>
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
    const { type, id, rootId, sourceType, sourceId, spaceId } = req.body
    // rootId used for comment notification and url
    // sourceType and sourceId used to generate link map url
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // get item data
        let model
        let include = [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
            },
        ]
        if (['post', 'comment'].includes(type)) model = Post
        if (type === 'link') model = Link
        if (type === 'post') {
            // include post spaces for stat updates
            include.push({
                model: Space,
                as: 'AllPostSpaces',
                where: { state: 'active' },
                attributes: ['id'],
                through: { where: { state: 'active' }, attributes: [] },
                required: false,
            })
        }
        const item = await model.findOne({ where: { id }, attributes: ['id'], include })

        const updateTotalLikes = item.increment('totalLikes', { silent: true })

        const updateSpaceStats =
            type === 'post'
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
            itemType: type,
            itemId: id,
            state: 'active',
            spaceId,
            creatorId: accountId,
        })

        // notify item creator
        let postId = null
        let commentId = null
        let spaceAId = spaceId
        if (type === 'post') postId = id
        if (type === 'comment') {
            postId = rootId
            commentId = id
        }
        if (type === 'link') {
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
                  type: `${type}-like`,
                  seen: false,
                  userId: accountId,
                  spaceAId,
                  postId,
                  commentId,
              })

        let itemUrl
        if (type === 'post') itemUrl = `${appURL}/p/${id}`
        if (type === 'comment') itemUrl = `${appURL}/p/${rootId}?commentId=${id}`
        if (type === 'link') itemUrl = `${appURL}/linkmap?item=${sourceType}&id=${sourceId}`

        const { handle, name } = await User.findOne({
            where: { id: accountId },
            attributes: ['handle', 'name'],
        })
        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
                  to: item.Creator.email,
                  from: { email: 'admin@weco.io', name: 'we { collective }' },
                  subject: 'New notification',
                  text: `
                        Hi ${item.Creator.name}, ${name} just liked your ${type} on weco:
                        http://${itemUrl}
                    `,
                  html: `
                        <p>
                            Hi ${item.Creator.name},
                            <br/>
                            <a href='${appURL}/u/${handle}'>${name}</a>
                            just liked your
                            <a href='${itemUrl}'>${type}</a>
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
    const { type, id } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        let model
        let include = [{ model: User, as: 'Creator', attributes: ['id'] }]
        if (['post', 'comment'].includes(type)) model = Post
        if (type === 'link') model = Link
        if (type === 'post') {
            include.push({
                model: Space,
                as: 'AllPostSpaces',
                where: { state: 'active' },
                required: false,
                attributes: ['id', 'totalPostLikes'],
                through: { where: { state: 'active' }, attributes: [] },
            })
        }

        const item = await model.findOne({ where: { id }, attributes: ['id'], include })

        const updateTotalLikes = await item.decrement('totalLikes', { silent: true })

        const updateSpaceStats =
            type === 'post'
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
                    itemType: type,
                    itemId: id,
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

// todo: update
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
        if (itemType === 'post') itemUrl = `${appURL}/p/${itemId}`
        if (itemType === 'comment') itemUrl = `${appURL}/p/${parentItemId}?commentId=${itemId}`

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
                            <a href='${appURL}/u/${accountHandle}'>${accountName}</a>
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

// todo: update
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

// todo: update
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
                            const url = `${appURL}/linkmap?item=${type}&id=${item.id}`
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
                                        <a href='${appURL}/u/${accountHandle}'>${accountName}</a>
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

// todo: remove
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
                            http://${appURL}/p/${postId}?commentId=${newComment.id}
                        `,
                            html: `
                            <p>
                                Hi ${post.Creator.name},
                                <br/>
                                <a href='${appURL}/u/${account.handle}'>${account.name}</a>
                                just commented on your
                                <a href='${appURL}/p/${postId}?commentId=${newComment.id}'>post</a>
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
                            http://${appURL}/p/${postId}?commentId=${newComment.id}
                        `,
                            html: `
                            <p>
                                Hi ${comment.Creator.name},
                                <br/>
                                <a href='${appURL}/u/${account.handle}'>${account.name}</a>
                                just replied to your
                                <a href='${appURL}/p/${postId}?commentId=${newComment.id}'>comment</a>
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
                              http://${appURL}/p/${postId}?commentId=${newComment.id}
                          `,
                            html: `
                              <p>
                                  Hi ${reply.Creator.name},
                                  <br/>
                                  <a href='${appURL}/u/${account.handle}'>${account.name}</a>
                                  just replied to your
                                  <a href='${appURL}/p/${postId}?commentId=${newComment.id}'>comment</a>
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
                                    http://${appURL}/p/${postId}?commentId=${newComment.id}
                                `,
                                      html: `
                                    <p>
                                        Hi ${user.name},
                                        <br/>
                                        <a href='${appURL}/u/${account.handle}'>${account.name}</a>
                                        just mentioned you in a
                                        <a href='${appURL}/p/${postId}?commentId=${newComment.id}'>comment</a>
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

// todo: remove
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
                                        http://${appURL}/p/${postId}?commentId=${commentId}
                                    `,
                                          html: `
                                        <p>
                                            Hi ${user.name},
                                            <br/>
                                            <a href='${appURL}/u/${account.handle}'>${account.name}</a>
                                            just mentioned you in a
                                            <a href='${appURL}/p/${postId}?commentId=${commentId}'>comment</a>
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
    const { postId, eventId, startTime, response } = req.body

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

                  const scheduleReminder = await scheduleEventNotification({
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

// todo: update governance actions
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
                    attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
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
                              // todo: use posts instead
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
                        http://${appURL}/p/${postId}
                    `,
                  html: `
                        <p>
                            Hi ${post.Creator.name},
                            <br/>
                            <a href='${appURL}/u/${userHandle}'>${userName}</a>
                            just voted on your
                            <a href='${appURL}/p/${postId}'>Poll</a>
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

router.post('/remove-poll-answer', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { answerId } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Link.update(
            { state: 'removed' },
            { where: { itemBId: answerId, itemBType: 'poll-answer' } }
        )
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ error }))
    }
})

router.post('/toggle-poll-answer-done', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { answerId, newState } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Link.update({ state: newState }, { where: { itemBId: answerId, itemBType: 'poll-answer' } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ error }))
    }
})

// todo: add authenticateToken to all endpoints below
router.post('/save-glass-bead-game', async (req, res) => {
    const { postId } = req.body
    const totalBeads = await Link.count({
        where: { itemAId: postId, itemBType: 'bead', state: 'draft' },
    })
    const updateGame = await GlassBeadGame.update(
        { locked: true, totalBeads },
        { where: { postId } }
    )
    const updateLinks = await Link.update(
        { state: 'visible' },
        { where: { itemAId: postId, itemBType: 'bead', state: 'draft' } }
    )

    Promise.all([updateGame, updateLinks])
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
                http://${appURL}/p/${postId}
            `,
                  html: `
                <p>
                    Hi ${post.Creator.name},
                    <br/>
                    Your 
                    <a href='${appURL}/p/${postId}'>post</a>
                    was just removed from 
                    <a href='${appURL}/s/${spaceHandle}'>s/${spaceHandle}</a>
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
