const config = require('./Config')
const {
    Space,
    User,
    Post,
    Comment,
    Event,
    Image,
    Url,
    Audio,
    Link,
    Poll,
    SpaceUserStat,
    SpaceParent,
    SpaceAncestor,
    Notification,
    SpacePost,
} = require('./models')
const fs = require('fs')
const { Op, QueryTypes, literal } = require('sequelize')
const db = require('./models/index')

var aws = require('aws-sdk')
var multer = require('multer')
var multerS3 = require('multer-s3')
aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1',
})
const s3 = new aws.S3({})

var ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
ffmpeg.setFfmpegPath(ffmpegPath)
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const imageMBLimit = 10
const audioMBLimit = 30
const defaultPostValues = {
    state: 'active',
    watermark: false,
    totalLikes: 0,
    totalComments: 0,
    totalReposts: 0,
    totalRatings: 0,
    totalLinks: 0,
    totalGlassBeadGames: 0,
}

function findFileName(file, accountId) {
    const date = Date.now().toString()
    const extension = file.fieldname.includes('audio') ? 'mp3' : file.mimetype.split('/')[1]
    return `${accountId}-${date}-${file.filename}.${extension}`
}

function noMulterErrors(error, res) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).send({ message: 'File size too large' })
        return false
    } else if (error) {
        res.status(500).send(error)
        return false
    }
    return true
}

// no longer used in create-post route
function multerParams(type, accountId) {
    // types: 'image-file', 'audio-file', 'audio-blob', 'glass-bead-game' (also: 'stream-image', 'toybox-row-image')
    // todo: set up new account bucket for stream and toybox images
    const isAudio = type.includes('audio')
    const limit = isAudio ? audioMBLimit : imageMBLimit
    const params = { limits: { fileSize: limit * 1024 * 1024 } }
    if (type === 'audio-blob') params.dest = './temp/audio/raw'
    else if (type === 'glass-bead-game') params.dest = './temp/beads'
    else {
        const bucketType = isAudio ? 'post-audio' : 'post-images'
        params.storage = multerS3({
            s3: s3,
            bucket: `weco-${process.env.NODE_ENV}-${bucketType}`,
            acl: 'public-read',
            metadata: (req, file, cb) => cb(null, { mimetype: file.mimetype }),
            key: (req, file, cb) => cb(null, findFileName(file, accountId)),
        })
    }
    return params
}

// function convertAndUploadAudio(file, accountId, type) {
//     return new Promise((resolve) => {
//         // convert raw audio to mp3
//         const outputPath = `temp/audio/mp3/${file.filename}.mp3`
//         ffmpeg(file.path)
//             .output(outputPath)
//             .on('end', () => {
//                 // upload new mp3 file to s3 bucket
//                 fs.readFile(outputPath, (error, data) => {
//                     if (!error) {
//                         const fileName = findFileName(file, accountId, true)
//                         const bucket = `weco-${process.env.NODE_ENV}-post-audio`
//                         const s3Object = {
//                             Bucket: bucket,
//                             ACL: 'public-read',
//                             Key: fileName,
//                             Body: data,
//                             Metadata: { mimetype: 'audio/mp3' },
//                             ContentType: 'audio/mpeg',
//                         }
//                         s3.putObject(s3Object, (err) => {
//                             // delete old files
//                             if (type === 'post')
//                                 fs.unlink(`temp/audio/raw/${file.filename}`, (e) => console.log(e))
//                             else fs.unlink(`temp/beads/${file.filename}`, (e) => console.log(e))
//                             fs.unlink(`temp/audio/mp3/${file.filename}.mp3`, (e) => console.log(e))
//                             // return audio url
//                             resolve(`https://${bucket}.s3.eu-west-1.amazonaws.com/${fileName}`)
//                         })
//                     }
//                 })
//             })
//             .run()
//     })
// }

function convertAndUploadAudio(file, accountId) {
    return new Promise((resolve) => {
        // convert raw audio to mp3
        // todo: configure ffmpeg options
        const outputPath = `temp/mp3s/${file.filename}.mp3`
        ffmpeg(file.path)
            .output(outputPath)
            .on('end', () => {
                // upload mp3 to s3 bucket
                fs.readFile(outputPath, (fsError, data) => {
                    if (!fsError) {
                        const fileName = findFileName(file, accountId)
                        const bucket = `weco-${process.env.NODE_ENV}-post-audio` // todo: remame 'post-audio' to 'audio' ?
                        const s3Object = {
                            Bucket: bucket,
                            ACL: 'public-read',
                            Key: fileName,
                            Body: data,
                            Metadata: { mimetype: 'audio/mp3' },
                            ContentType: 'audio/mpeg',
                        }
                        s3.putObject(s3Object, (s3Error) => {
                            // delete old files
                            fs.unlink(`temp/post-files/${file.filename}`, (e) => console.log(e))
                            fs.unlink(`temp/mp3s/${file.filename}.mp3`, (e) => console.log(e))
                            // return audio url
                            resolve(`https://${bucket}.s3.eu-west-1.amazonaws.com/${fileName}`)
                        })
                    }
                })
            })
            .run()
    })
}

function uploadPostFile(file, accountId) {
    return new Promise((resolve) => {
        const bucketType = file.fieldname.includes('audio') ? 'post-audio' : 'post-images'
        const bucket = `weco-${process.env.NODE_ENV}-${bucketType}`
        const fileName = findFileName(file, accountId)
        fs.readFile(`temp/post-files/${file.filename}`, (err, data) => {
            const s3Object = {
                Bucket: bucket,
                Key: fileName,
                Body: data,
                Metadata: { mimetype: file.mimetype },
                ACL: 'public-read',
            }
            s3.putObject(s3Object, (err) => {
                // delete old file
                fs.unlink(`temp/post-files/${file.filename}`, (e) => console.log(e))
                // return upload url
                resolve(`https://${bucket}.s3.eu-west-1.amazonaws.com/${fileName}`)
            })
        })
    })
}

function uploadBeadFile(file, accountId) {
    return new Promise((resolve) => {
        // fieldnames include: 'topicImage', 'imageFile', 'audioFile',
        const isAudio = file.fieldname.includes('audio')
        const bucketType = isAudio ? 'post-audio' : 'post-images'
        const fileName = findFileName(file, accountId)
        const bucket = `weco-${process.env.NODE_ENV}-${bucketType}`
        fs.readFile(`temp/beads/${file.filename}`, (err, data) => {
            const s3Object = {
                Bucket: bucket,
                ACL: 'public-read',
                Key: fileName,
                Body: data,
                Metadata: { mimetype: file.mimetype },
            }
            s3.putObject(s3Object, (err) => {
                // delete old file
                fs.unlink(`temp/beads/${file.filename}`, (e) => console.log(e))
                // return upload url
                resolve(`https://${bucket}.s3.eu-west-1.amazonaws.com/${fileName}`)
            })
        })
    })
}

function createImage(accountId, postId, image, index, files) {
    return new Promise(async (resolve) => {
        const newPost = await Post.create({
            ...defaultPostValues,
            creatorId: accountId,
            type: 'image',
            mediaTypes: 'image',
            text: image.text || null,
            searchableText: image.text || null,
            lastActivity: new Date(),
        })
        const addImage = await Image.create({
            creatorId: accountId,
            postId: newPost.id,
            url: image.url || files.find((file) => file.originalname === image.id).url,
        })
        const addLink = await Link.create({
            creatorId: accountId,
            itemAType: 'post',
            itemBType: 'image',
            itemAId: postId,
            itemBId: newPost.id,
            index,
            relationship: 'parent',
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })
        Promise.all([addImage, addLink])
            .then(() => resolve())
            .catch((error) => resolve(error))
    })
}

function createAudio(accountId, postId, audio, index, files) {
    return new Promise(async (resolve) => {
        const newPost = await Post.create({
            ...defaultPostValues,
            creatorId: accountId,
            type: 'audio',
            mediaTypes: 'audio',
            text: audio.text || null,
            searchableText: audio.text || null,
            lastActivity: new Date(),
        })
        const addAudio = await Audio.create({
            creatorId: accountId,
            postId: newPost.id,
            url: audio.url || files.find((file) => file.originalname === audio.id).url,
        })
        const addLink = await Link.create({
            creatorId: accountId,
            itemAType: 'post',
            itemBType: 'audio',
            itemAId: postId,
            itemBId: newPost.id,
            index,
            relationship: 'parent',
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })
        Promise.all([addAudio, addLink])
            .then(() => resolve())
            .catch((error) => resolve(error))
    })
}

function createUrl(accountId, postId, urlData, index) {
    return new Promise(async (resolve) => {
        const { url, title, description, domain, image, searchableText } = urlData
        const newPost = await Post.create({
            ...defaultPostValues,
            creatorId: accountId,
            type: 'url',
            mediaTypes: 'url',
            searchableText,
            lastActivity: new Date(),
        })
        const addUrl = await Url.create({
            creatorId: accountId,
            postId: newPost.id,
            url,
            title,
            description,
            domain,
            image,
        })
        const addLink = await Link.create({
            creatorId: accountId,
            itemAType: 'post',
            itemBType: 'url',
            itemAId: postId,
            itemBId: newPost.id,
            index,
            relationship: 'parent',
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })
        Promise.all([addUrl, addLink])
            .then(() => resolve())
            .catch((error) => resolve(error))
    })
}

function notifyMention(creator, user, postId) {
    // creator attributes: id, name, handle
    // user attributes (must be model for accountMuted function): id, name, email, emailsDisabled
    return new Promise(async (resolve) => {
        const sendNotification = await Notification.create({
            ownerId: user.id,
            type: 'post-mention',
            seen: false,
            userId: creator.id,
            postId,
        })
        const skipEmail = user.emailsDisabled || (await accountMuted(creator.id, user))
        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
                  to: user.email,
                  from: { email: 'admin@weco.io', name: 'we { collective }' },
                  subject: 'New notification',
                  text: `
                        Hi ${user.name}, ${creator.name} just mentioned you in a post on weco:
                        http://${config.appURL}/p/${postId}
                    `,
                  html: `
                        <p>
                            Hi ${user.name},
                            <br/>
                            <a href='${config.appURL}/u/${creator.handle}'>${creator.name}</a>
                            just mentioned you in a 
                            <a href='${config.appURL}/p/${postId}'>post</a>
                            on weco
                        </p>
                    `,
              })

        Promise.all([sendNotification, sendEmail])
            .then(() => resolve())
            .catch((error) => resolve(error))
    })
}

function createSpacePost(accountId, spaceId, postId, type, relationship) {
    return new Promise(async (resolve) => {
        const addSpacePost = await SpacePost.create({
            creatorId: accountId,
            type, // 'post' or 'repost'
            relationship, // 'direct' or 'indirect'
            spaceId,
            postId,
            state: 'active',
        })
        const updateTotalPosts = await Space.increment('totalPosts', {
            where: { id: spaceId },
            silent: true,
        })
        Promise.all([addSpacePost, updateTotalPosts])
            .then(() => resolve())
            .catch((error) => resolve(error))
    })
}

// common models
// todo: remove as attributes change to much...
function creator(extraFields) {
    return { model: User, as: 'Creator', attributes: ['id', 'handle', 'name', ...extraFields] }
}

// general functions
function createSQLDate(date) {
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ')
}

function findStartDate(timeRange) {
    let startDate = new Date()
    let offset = Date.now()
    if (timeRange === 'This Hour') offset = 60 * 60 * 1000
    if (timeRange === 'Today') offset = 24 * 60 * 60 * 1000
    if (timeRange === 'This Week') offset = 24 * 60 * 60 * 1000 * 7
    if (timeRange === 'This Month') offset = 24 * 60 * 60 * 1000 * 30
    if (timeRange === 'This Year') offset = 24 * 60 * 60 * 1000 * 365
    return startDate.setTime(startDate.getTime() - offset)
}

function findPostOrder(filter, sortBy) {
    if (filter === 'Active')
        return [
            ['lastActivity', 'DESC'],
            ['id', 'ASC'],
        ]
    if (filter === 'New')
        return [
            ['createdAt', 'DESC'],
            ['id', 'ASC'],
        ]
    if (sortBy === 'Signal')
        return [
            ['totalRatings', 'DESC'],
            ['createdAt', 'DESC'],
            ['id', 'ASC'],
        ]
    return [
        [`total${sortBy}`, 'DESC'],
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
    ]
}

function findSpaceOrder(filter, sortBy) {
    if (filter === 'New')
        return [
            ['createdAt', 'DESC'],
            ['id', 'ASC'],
        ]
    if (sortBy === 'Likes')
        return [
            ['totalPostLikes', 'DESC'],
            ['createdAt', 'DESC'],
            ['id', 'ASC'],
        ]
    return [
        [`total${sortBy}`, 'DESC'],
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
    ]
}

function findUserOrder(filter, sortBy) {
    if (filter === 'New')
        return [
            ['createdAt', 'DESC'],
            ['id', 'ASC'],
        ]
    return [
        [`total${sortBy}`, 'DESC'],
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
    ]
}

// model prop used to distinguish between Post and Beads
function totalRatingPoints(itemType, model) {
    return [
        literal(
            `(
                SELECT SUM(value) FROM Reactions
                WHERE itemType = '${itemType}'
                AND itemId = ${model}.id
                AND type = 'rating'
                AND state = 'active'
            )`
        ),
        'totalRatingPoints',
    ]
}

function sourcePostId() {
    return [
        literal(`(
            SELECT itemAId FROM Links
            WHERE itemBId = Post.id
            AND (type = 'gbg-post' OR type = 'card-post')
        )`),
        'sourcePostId',
    ]
}

async function accountReaction(type, postType, postId, accountId) {
    const [{ reaction }] = await db.sequelize.query(
        `SELECT CASE WHEN EXISTS (
            SELECT id FROM Reactions
            WHERE itemType = :postType
            AND itemId = :postId
            AND creatorId = :accountId
            AND type = :type
            AND state = 'active'
        )
        THEN 1 ELSE 0 END AS reaction`,
        { replacements: { type, postType, postId, accountId }, type: QueryTypes.SELECT }
    )
    return reaction
}

async function accountComment(postId, accountId) {
    const [{ comment }] = await db.sequelize.query(
        `SELECT CASE WHEN EXISTS (
            SELECT id FROM Links
            WHERE creatorId = :accountId
            AND itemAId = :postId
            AND itemAType = 'post'
            AND itemBType = 'comment'
            AND (relationship = 'parent' OR relationship = 'root')
            AND state = 'active'
        )
        THEN 1 ELSE 0 END AS comment`,
        { replacements: { postId, accountId }, type: QueryTypes.SELECT }
    )
    return comment
}

// todo: update for comments
async function accountLink(postId, accountId) {
    const [{ link }] = await db.sequelize.query(
        `SELECT CASE WHEN EXISTS (
            SELECT id FROM Links
            WHERE state = 'active'
            AND relationship = 'link'
            AND creatorId = :accountId
            AND (
                (itemAId = :postId AND itemAType = 'post')
                OR
                (itemBId = :postId AND itemBType = 'post')
            )
        )
        THEN 1 ELSE 0 END AS link`,
        { replacements: { postId, accountId }, type: QueryTypes.SELECT }
    )
    return link
}

// todo: apply above SQL syntax to literals below (remove table names where not required)
function postAccess(accountId) {
    // todo: 10x faster approach found & applied on user-posts route. Apply to post-data & space-events routes then remove function.
    // checks number of private spaces post is in = number of those spaces user has access to
    // reposts excluded so public posts can be reposted into private spaces without blocking access
    return [
        literal(`(
            (SELECT COUNT(*)
                FROM Spaces
                WHERE Spaces.state = 'active'
                AND Spaces.privacy = 'private'
                AND Spaces.id IN (
                    SELECT SpacePosts.spaceId
                    FROM SpacePosts
                    RIGHT JOIN Posts
                    ON SpacePosts.postId = Post.id
                    WHERE SpacePosts.type = 'post'
                )
            )
            = 
            (SELECT COUNT(*)
                FROM SpaceUsers
                WHERE SpaceUsers.userId = ${accountId}
                AND SpaceUsers.state = 'active'
                AND SpaceUsers.relationship = 'access'
                AND SpaceUsers.spaceId IN (
                    SELECT Spaces.id
                    FROM Spaces
                    WHERE Spaces.state = 'active'
                    AND Spaces.privacy = 'private'
                    AND Spaces.id IN (
                        SELECT SpacePosts.spaceId
                        FROM SpacePosts
                        RIGHT JOIN Posts
                        ON SpacePosts.postId = Post.id
                        WHERE SpacePosts.type = 'post'
                    )
                )
            )
        )`),
        'access',
    ]
}

async function accountMuted(accountId, user) {
    // checks if account included in users muted users
    const mutedUsers = await user.getMutedUsers({
        where: { state: 'active' },
        through: { where: { relationship: 'muted', state: 'active' } },
        attributes: ['id'],
    })
    return mutedUsers.map((u) => u.id).includes(accountId)
}

// space literal
// rename to total space descendents
const totalSpaceSpaces = [
    literal(`(
        SELECT COUNT(*)
        FROM Spaces
        WHERE Spaces.handle != Space.handle
        AND Spaces.state = 'active'
        AND Spaces.id IN (
            SELECT SpaceAncestors.spaceBId
            FROM SpaceAncestors
            RIGHT JOIN Spaces
            ON SpaceAncestors.spaceBId = Spaces.id
            WHERE SpaceAncestors.spaceAId = Space.id
        )
    )`),
    'totalSpaces',
]

const totalSpacePosts = [
    literal(`(
    SELECT COUNT(*)
        FROM Posts
        WHERE Posts.state = 'visible'
        AND Posts.id IN (
            SELECT SpacePosts.postId
            FROM SpacePosts
            RIGHT JOIN Posts
            ON SpacePosts.postId = Posts.id
            WHERE SpacePosts.spaceId = Space.id
        )
    )`),
    'totalPosts',
]

const totalSpaceUsers = [
    literal(`(
        SELECT COUNT(*)
            FROM Users
            WHERE Users.emailVerified = true
            AND Users.state = 'active'
            AND Users.id IN (
                SELECT SpaceUsers.userId
                FROM SpaceUsers
                RIGHT JOIN Users
                ON SpaceUsers.userId = Users.id
                WHERE SpaceUsers.spaceId = Space.id
                AND SpaceUsers.state = 'active'
            )
        )`),
    'totalUsers',
]

const totalSpaceFollowers = [
    literal(`(
        SELECT COUNT(*)
        FROM Users
        WHERE Users.id IN (
            SELECT SpaceUsers.userId
            FROM SpaceUsers
            RIGHT JOIN Users
            ON SpaceUsers.userId = Users.id
            WHERE SpaceUsers.spaceId = Space.id
            AND SpaceUsers.relationship = 'follower'
            AND SpaceUsers.state = 'active'
        )
    )`),
    'totalFollowers',
]

const totalSpaceComments = [
    literal(`(
        SELECT COUNT(*)
        FROM Comments
        WHERE Comments.state = 'visible'
        AND Comments.itemType = 'post'
        AND Comments.itemId IN (
            SELECT SpacePosts.postId
            FROM SpacePosts
            RIGHT JOIN Posts
            ON SpacePosts.postId = Posts.id
            WHERE SpacePosts.spaceId = Space.id
        )
    )`),
    'totalComments',
]

const totalSpaceReactions = [
    literal(`(
        SELECT COUNT(*)
        FROM Reactions
        WHERE Reactions.state = 'active'
        AND Reactions.itemType = 'post'
        AND Reactions.itemId IN (
            SELECT SpacePosts.postId
            FROM SpacePosts
            RIGHT JOIN Posts
            ON SpacePosts.postId = Posts.id
            WHERE SpacePosts.spaceId = Space.id
        )
    )`),
    'totalReactions',
]

const totalSpaceLikes = [
    literal(`(
        SELECT COUNT(*)
        FROM Reactions
        WHERE Reactions.state = 'active'
        AND Reactions.type = 'like'
        AND Reactions.itemType = 'post'
        AND Reactions.itemId IN (
            SELECT SpacePosts.postId
            FROM SpacePosts
            RIGHT JOIN Posts
            ON SpacePosts.postId = Posts.id
            WHERE SpacePosts.spaceId = Space.id
        )
    )`),
    'totalLikes',
]

const totalSpaceRatings = [
    literal(`(
        SELECT COUNT(*)
        FROM Reactions
        WHERE Reactions.state = 'active'
        AND Reactions.type = 'rating'
        AND Reactions.itemType = 'post'
        AND Reactions.itemId IN (
            SELECT SpacePosts.postId
            FROM SpacePosts
            RIGHT JOIN Posts
            ON SpacePosts.postId = Posts.id
            WHERE SpacePosts.spaceId = Space.id
        )
    )`),
    'totalRatings',
]

const totalSpaceChildren = [
    literal(`(
        SELECT COUNT(*)
        FROM SpaceParents
        WHERE SpaceParents.spaceAId = Space.id
        AND SpaceParents.state = 'open'
    )`),
    'totalChildren',
]

function spaceAccess(accountId) {
    // checks direct user access to space
    // used in findSpaceMapAttributes, space-data, find-spaces, and nav-list-child-spaces
    return [
        literal(`(
        SELECT SpaceUsers.state
        FROM SpaceUsers
        WHERE SpaceUsers.userId = ${accountId}
        AND SpaceUsers.spaceId = Space.id
        AND SpaceUsers.relationship = 'access'
        AND (SpaceUsers.state = 'active' OR SpaceUsers.state = 'pending')
    )`),
        'spaceAccess',
    ]
}

const restrictedAncestors = [
    literal(`(
        SELECT Spaces.id
        FROM Spaces
        WHERE Spaces.state = 'active'
        AND Spaces.privacy = 'private'
        AND Spaces.id IN (
            SELECT SpaceAncestors.spaceAId
            FROM SpaceAncestors
            RIGHT JOIN Spaces
            ON SpaceAncestors.spaceBId = Space.id
            WHERE SpaceAncestors.state = 'open'
        )
    )`),
    'restirctedAncestors',
]

function ancestorAccess(accountId) {
    // checks number of private ancestors = number of those ancestors user has access to
    // todo: find more efficient query
    return [
        literal(`(
        (SELECT COUNT(*)
            FROM Spaces
                WHERE Spaces.state = 'active'
                AND Spaces.privacy = 'private'
                AND Spaces.id IN (
                    SELECT SpaceAncestors.spaceAId
                    FROM SpaceAncestors
                    RIGHT JOIN Spaces
                    ON SpaceAncestors.spaceBId = Space.id
                    WHERE SpaceAncestors.state = 'open'
                    OR SpaceAncestors.state = 'closed'
                )
        )
        = 
        (SELECT COUNT(*)
            FROM SpaceUsers
            WHERE SpaceUsers.userId = ${accountId}
            AND SpaceUsers.state = 'active'
            AND SpaceUsers.relationship = 'access'
            AND SpaceUsers.spaceId IN (
                SELECT Spaces.id
                FROM Spaces
                WHERE Spaces.state = 'active'
                AND Spaces.privacy = 'private'
                AND Spaces.id IN (
                    SELECT SpaceAncestors.spaceAId
                    FROM SpaceAncestors
                    RIGHT JOIN Spaces
                    ON SpaceAncestors.spaceBId = Space.id
                    WHERE SpaceAncestors.state = 'open'
                    OR SpaceAncestors.state = 'closed'
                )
            )
        )
    )`),
        'ancestorAccess',
    ]
}

function isModerator(accountId) {
    // checks user is mod of space
    return [
        literal(`(
            SELECT COUNT(*)
            FROM SpaceUsers
            WHERE SpaceUsers.userId = ${accountId}
            AND SpaceUsers.spaceId = Space.id
            AND SpaceUsers.relationship = 'moderator'
            AND SpaceUsers.state = 'active'
        )`),
        'isModerator',
    ]
}

function isFollowingSpace(accountId) {
    // checks user is following space
    return [
        literal(`(
            SELECT COUNT(*)
            FROM SpaceUsers
            WHERE SpaceUsers.userId = ${accountId}
            AND SpaceUsers.spaceId = Space.id
            AND SpaceUsers.relationship = 'follower'
            AND SpaceUsers.state = 'active'
        )`),
        'isFollowing',
    ]
}

function isFollowingUser(accountId) {
    // checks account is following user
    return [
        literal(`(
            SELECT COUNT(*)
            FROM UserUsers
            WHERE UserUsers.userAId = ${accountId}
            AND UserUsers.userBId = User.id
            AND UserUsers.relationship = 'follower'
            AND UserUsers.state = 'active'
        )`),
        'isFollowing',
    ]
}

function totalLikesReceivedInSpace(spaceId) {
    // calculates the total likes recieved by the user in a space
    return [
        literal(`(
            SELECT SUM(totalLikes)
            FROM Posts
            WHERE Posts.state = 'visible'
            AND Posts.creatorId = User.id
            AND Posts.id IN (
                SELECT SpacePosts.postId
                FROM SpacePosts
                WHERE SpacePosts.spaceId = ${spaceId}
                AND (SpacePosts.relationship = 'indirect' OR SpacePosts.relationship = 'direct')
            )
        )`),
        'likesReceived',
    ]
}

function totalSpaceResults(filters) {
    if (!filters) {
        return [
            literal(`(
                SELECT COUNT(*)
                FROM SpaceParents
                WHERE SpaceParents.spaceAId = Space.id
                AND SpaceParents.state = 'open'
            )`),
            'totalResults',
        ]
    } else {
        const { depth, timeRange, search } = filters
        const startDate = createSQLDate(findStartDate(timeRange))
        const endDate = createSQLDate(new Date())
        return depth === 'Deep'
            ? [
                  literal(`(
                    SELECT COUNT(*)
                    FROM Spaces s
                    WHERE s.id != Space.id
                    AND s.state = 'active'
                    AND s.id IN (
                        SELECT SpaceAncestors.spaceBId
                        FROM SpaceAncestors
                        RIGHT JOIN Spaces
                        ON SpaceAncestors.spaceBId = Spaces.id
                        WHERE SpaceAncestors.spaceAId = Space.id
                        AND (SpaceAncestors.state = 'open' OR SpaceAncestors.state = 'closed')
                    ) AND (
                        s.handle LIKE '%${search}%'
                        OR s.name LIKE '%${search}%'
                        OR s.description LIKE '%${search}%'
                    ) AND s.createdAt BETWEEN '${startDate}' AND '${endDate}'
                )`),
                  'totalResults',
              ]
            : [
                  literal(`(
                    SELECT COUNT(*)
                    FROM Spaces s
                    WHERE s.state = 'active'
                    AND s.id IN (
                        SELECT SpaceParents.spaceBId
                        FROM SpaceParents
                        RIGHT JOIN Spaces
                        ON SpaceParents.spaceAId = Space.id
                        WHERE SpaceParents.state = 'open'
                    ) AND (
                        s.handle LIKE '%${search}%'
                        OR s.name LIKE '%${search}%'
                        OR s.description LIKE '%${search}%'
                    ) AND s.createdAt BETWEEN '${startDate}' AND '${endDate}'
                )`),
                  'totalResults',
              ]
    }
}

// user literals
const totalUsers = [
    literal(
        `(SELECT COUNT(*) FROM Users WHERE Users.emailVerified = true AND Users.state = 'active')`
    ),
    'totalUsers',
]

const totalUserPosts = [
    literal(`(
        SELECT COUNT(*)
        FROM Posts
        WHERE Posts.state = 'visible'
        AND Posts.creatorId = User.id
        AND Posts.type IN ('text', 'url', 'image', 'audio', 'event', 'poll', 'glass-bead-game')
    )`),
    'totalPosts',
]

const totalUserComments = [
    literal(`(
        SELECT COUNT(*)
        FROM Comments
        WHERE Comments.creatorId = User.id
    )`),
    'totalComments',
]

// post functions
function findPostType(type) {
    return type === 'All Types'
        ? ['text', 'url', 'image', 'audio', 'event', 'poll', 'glass-bead-game', 'card']
        : type.replace(/\s+/g, '-').toLowerCase()
}

function findInitialPostAttributes(sortBy) {
    const attributes = ['id']
    if (sortBy === 'Links') attributes.push('totalLinks')
    if (sortBy === 'Comments') attributes.push('totalComments')
    if (sortBy === 'Likes') attributes.push('totalLikes')
    if (sortBy === 'Signal') attributes.push('totalRatings')
    if (sortBy === 'Reposts') attributes.push('totalReposts')
    return attributes
}

function findFullPostAttributes(model, accountId) {
    return [
        'id',
        'type',
        'mediaTypes',
        'state',
        'title',
        'text',
        'createdAt',
        'updatedAt',
        'lastActivity',
        'totalLikes',
        'totalComments',
        'totalReposts',
        'totalRatings',
        'totalLinks',
        // accountLike('post', model, accountId),
        // accountComment('post', model, accountId),
        // accountLink('post', model, accountId),
        // accountRating('post', model, accountId),
        // accountRepost('post', model, accountId),
    ]
}

function findPostThrough(depth) {
    const relationship = depth === 'Deep' ? { [Op.or]: ['direct', 'indirect'] } : 'direct'
    return { where: { state: 'active', relationship }, attributes: [] }
}

function findPostWhere(location, id, startDate, type, searchQuery, mutedUsers, spaceAccessList) {
    const query = searchQuery || ''
    const where = {
        // state: 'visible',
        state: 'active',
        createdAt: { [Op.between]: [startDate, Date.now()] },
        // mediaTypes: { [Op.like]: `%${type}%` },
        // type,
    }
    if (type !== 'All Types') {
        const formattedType = type.replace(/\s+/g, '-').toLowerCase()
        if (type === 'Text') where.mediaTypes = 'text'
        else where.mediaTypes = { [Op.like]: `%${formattedType}%` }
    }
    if (location === 'space') {
        where['$AllPostSpaces.id$'] = id
        if (mutedUsers.length) where[Op.not] = { creatorId: mutedUsers }
    }
    if (location === 'user') {
        where.creatorId = id
        if (spaceAccessList) {
            where[Op.or] = [
                { '$PrivateSpaces.id$': null },
                { '$PrivateSpaces.id$': spaceAccessList },
            ]
        }
    }
    if (searchQuery) where.searchableText = { [Op.like]: `%${query}%` }
    return where
}

function findPostInclude(accountId) {
    return [
        {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'coverImagePath'],
        },
        {
            model: Space,
            as: 'DirectSpaces',
            // where: { [Op.not]: { id: 1 } },
            required: false,
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'coverImagePath', 'state'],
            through: { where: { relationship: 'direct', type: 'post' }, attributes: [] },
        },
        {
            model: Event,
            attributes: ['id', 'startTime', 'endTime'],
            include: [
                // todo: count and grab latest 3 instead of getting all users
                {
                    model: User,
                    as: 'Going',
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    through: {
                        where: { relationship: 'going', state: 'active' },
                        attributes: [],
                    },
                },
                {
                    model: User,
                    as: 'Interested',
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    through: {
                        where: { relationship: 'interested', state: 'active' },
                        attributes: [],
                    },
                },
            ],
        },
        // for block posts
        {
            model: Image,
            attributes: ['id', 'url'],
        },
        {
            model: Audio,
            attributes: ['id', 'url'],
        },
        {
            model: Url,
            attributes: ['id', 'title', 'description', 'domain', 'image'],
        },
    ]
}

function findCommentAttributes(model, accountId) {
    return [
        'id',
        'itemId',
        'parentCommentId',
        'text',
        'state',
        'totalLikes',
        'totalReposts',
        'totalRatings',
        'totalLinks',
        'totalGlassBeadGames',
        'createdAt',
        'updatedAt',
        accountLike('comment', model, accountId),
        accountRating('comment', model, accountId),
        accountLink('comment', model, accountId),
    ]
}

function findSpaceSpacesInclude(depth) {
    const fullDepth = depth === 'All Contained Spaces'
    const state = fullDepth ? { [Op.or]: ['open', 'closed'] } : 'open'
    return [
        {
            model: Space,
            as: fullDepth ? 'SpaceAncestors' : 'DirectParentSpaces',
            attributes: [],
            through: { attributes: [], where: { state } },
        },
    ]
}

async function getLinkedItem(type, id) {
    let model
    let attributes = []
    if (type === 'post') {
        model = Post
        attributes = [
            'id',
            'type',
            'title',
            'text',
            'totalLikes',
            'totalLinks',
            'createdAt',
            'updatedAt',
            'lastActivity',
        ]
    }
    if (type === 'comment') {
        model = Comment
        attributes = ['id', 'text', 'totalLikes', 'totalLinks', 'createdAt', 'updatedAt']
    }
    if (type === 'user') {
        model = User
        attributes = ['id', 'handle', 'name', 'flagImagePath', 'createdAt']
    }
    if (type === 'space') {
        model = Space
        attributes = ['id', 'handle', 'name', 'flagImagePath', 'createdAt']
    }
    const item = await model.findOne({
        where: { id, state: { [Op.or]: ['visible', 'active'] } },
        attributes,
    })
    if (item) {
        item.setDataValue('modelType', type)
        return item
    }
    return null
}

async function getToyboxItem(type, id) {
    let model
    let include = []
    let attributes = []
    if (type === 'post') {
        model = Post
        attributes = [
            'id',
            'mediaTypes',
            'title',
            'text',
            'color',
            'totalLikes',
            'totalComments',
            'totalLinks',
            'state',
        ]
        include = [
            {
                model: User,
                as: 'Creator',
                attributes: ['name', 'flagImagePath'],
            },
            {
                model: Image,
                attributes: ['url'],
                required: false,
            },
            {
                model: Url,
                required: false,
                attributes: ['image', 'title', 'description', 'domain'],
            },
            {
                model: Audio,
                required: false,
                attributes: ['url'],
            },
            {
                model: Post,
                as: 'CardSides',
                attributes: ['id'],
                through: {
                    where: { type: 'card-post', state: ['visible', 'account-deleted'] },
                    attributes: [],
                },
                include: {
                    model: Image,
                    attributes: ['url'],
                    required: false,
                },
                required: false,
            },
            {
                model: Event,
                attributes: ['startTime', 'endTime'],
            },
        ]
    }
    if (type === 'comment') {
        model = Comment
        attributes = ['id', 'text', 'state', 'itemId']
        include = {
            model: User,
            as: 'Creator',
            attributes: ['name', 'flagImagePath'],
        }
    }
    if (type === 'user') {
        model = User
        attributes = [
            'id',
            'handle',
            'name',
            'flagImagePath',
            'coverImagePath',
            'bio',
            totalUserPosts,
            totalUserComments,
            'state',
        ]
    }
    if (type === 'space') {
        model = Space
        attributes = [
            'id',
            'handle',
            'name',
            'flagImagePath',
            'coverImagePath',
            'description',
            'totalPosts',
            'totalComments',
            'totalPostLikes',
            'totalFollowers',
            'state',
        ]
    }
    const item = await model.findOne({
        where: { id },
        attributes,
        include,
    })
    return { type, data: item }
}

async function getFullLinkedItem(type, id, accountId) {
    let model
    let attributes = []
    let include = null
    if (type === 'post') {
        model = Post
        attributes = [sourcePostId(), ...findFullPostAttributes('Post', accountId)]
        include = findPostInclude(accountId)
    }
    if (type === 'comment') {
        model = Comment
        attributes = findCommentAttributes('Comment', accountId)
        include = {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        }
    }
    if (type === 'user') {
        model = User
        attributes = ['id', 'handle', 'name', 'flagImagePath', 'createdAt']
    }
    if (type === 'space') {
        model = Space
        attributes = ['id', 'handle', 'name', 'flagImagePath', 'createdAt']
    }
    const item = await model.findOne({
        where: { id, state: { [Op.or]: ['visible', 'active'] } },
        attributes,
        include,
    })
    if (item) {
        item.setDataValue('modelType', type)
        return item
    }
    return null
}

// todo: turn into recursive function to handle privacy... (i.e private space within public child being attached to public parent)
async function attachParentSpace(childId, parentId) {
    // remove old parent relationship with root if present to reduce clutter
    const removeRoot = await SpaceParent.update(
        { state: 'closed' },
        { where: { spaceAId: 1, spaceBId: childId, state: 'open' } }
    )

    const createNewParentRelationship = await SpaceParent.create({
        spaceAId: parentId,
        spaceBId: childId,
        state: 'open',
    })

    // get the parent with all its ancestors
    const parent = await Space.findOne({
        where: { id: parentId },
        attributes: ['id'],
        include: {
            model: Space,
            as: 'SpaceAncestors',
            where: { state: 'active' },
            required: false,
            attributes: ['id'],
            through: { attributes: ['state'], where: { state: { [Op.or]: ['open', 'closed'] } } },
        },
    })

    // get the child with all its decendents (including each of their ancestors)
    const child = await Space.findOne({
        where: { id: childId },
        attributes: ['id', 'privacy'],
        include: [
            {
                model: Space,
                as: 'SpaceDescendents',
                where: { state: 'active' },
                required: false,
                attributes: ['id'],
                through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
                include: {
                    model: Space,
                    as: 'SpaceAncestors',
                    where: { state: 'active' },
                    required: false,
                    attributes: ['id'],
                    through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
                },
            },
            {
                model: Space,
                as: 'SpaceAncestors',
                where: { state: 'active' },
                required: false,
                attributes: ['id'],
                through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
            },
        ],
    })

    const descendants = [child, ...child.SpaceDescendents]
    const ancestors = [
        // parent SpaceAncestor state determined by childs privacy
        {
            id: parent.id,
            SpaceAncestor: { state: child.privacy === 'private' ? 'closed' : 'open' },
        },
        ...parent.SpaceAncestors,
    ]

    // loop through the descendents (includes child) and add any ancestors that aren't already present
    const addAncestorsToDescendants = await Promise.all(
        descendants.map((descendent) =>
            Promise.all(
                ancestors.map(
                    (ancestor) =>
                        new Promise((resolve) => {
                            const match = descendent.SpaceAncestors.find(
                                (a) => a.id === ancestor.id
                            )
                            if (match) resolve()
                            else {
                                SpaceAncestor.create({
                                    spaceAId: ancestor.id,
                                    spaceBId: descendent.id,
                                    state:
                                        child.privacy === 'private'
                                            ? 'closed'
                                            : ancestor.SpaceAncestor.state,
                                })
                                    .then(() => resolve())
                                    .catch((error) => resolve(error))
                            }
                        })
                )
            )
        )
    )

    return Promise.all([removeRoot, createNewParentRelationship, addAncestorsToDescendants])
}

// todo: only id and url required in resolve (not full file)?
function uploadFile(accountId, file) {
    return new Promise((resolve) => {
        if (file.fieldname === 'audio-blob') {
            convertAndUploadAudio(file, accountId).then((url) => resolve({ ...file, url }))
        } else if (file.fieldname !== 'post-data') {
            uploadPostFile(file, accountId).then((url) => resolve({ ...file, url }))
        }
    })
}

async function uploadFiles(req, res, accountId) {
    return new Promise((resolve) => {
        const multerParams = { dest: './temp/post-files', limits: { fileSize: 30 * 1024 * 1024 } }
        multer(multerParams).any()(req, res, (error) => {
            if (noMulterErrors(error, res)) {
                Promise.all(req.files.map((file) => uploadFile(accountId, file)))
                    .then((files) =>
                        resolve({ postData: JSON.parse(req.body['post-data']), files })
                    )
                    .catch((error) => res.status(500).json(error))
            }
        })
    })
}

// todo: check notifyMentions is adding the correct notification type
async function createPost(data, files, accountId) {
    return new Promise(async (resolveA) => {
        const {
            type, // post, comment, poll-answer
            mediaTypes,
            spaceIds, // not present in comments
            title, // not present in comments
            text,
            searchableText,
            mentions,
            urls,
            images,
            audios,
            event,
            poll,
            glassBeadGame,
            card,
            // todo: include sourceId, sourceCreatorId, description etc. in link
        } = data

        const creator = await User.findOne({
            where: { id: accountId },
            attributes: ['name', 'handle'],
        })

        const post = await Post.create({
            ...defaultPostValues,
            creatorId: accountId,
            type,
            mediaTypes,
            title: title || null,
            text,
            searchableText,
            lastActivity: new Date(),
        })

        // todo: check this is adding the correct notification type
        const notifyMentions = mentions.length
            ? await new Promise(async (resolve) => {
                  const users = await User.findAll({
                      where: { id: mentions, state: 'active' },
                      attributes: ['id', 'name', 'email', 'emailsDisabled'],
                  })
                  Promise.all(users.map((user) => notifyMention(creator, user, post.id)))
                      .then(() => resolve())
                      .catch((error) => resolve(data, error))
              })
            : null

        const createUrls = await Promise.all(
            urls.map((url, i) => createUrl(accountId, post.id, url, i))
        )

        const createImages = await Promise.all(
            images.map((image, i) => createImage(accountId, post.id, image, i, files))
        )

        const createAudios = await Promise.all(
            audios.map((audio, i) => createAudio(accountId, post.id, audio, i, files))
        )

        const createEvent = event
            ? await Event.create({
                  postId: post.id,
                  state: 'active',
                  startTime: event.startTime,
                  endTime: event.endTime,
              })
            : null

        const createPoll = poll
            ? await new Promise(async (resolve) => {
                  const { type, answers, locked, governance, action, threshold } = poll
                  const newPoll = await Poll.create({
                      postId: post.id,
                      type,
                      answersLocked: locked,
                      spaceId: governance ? spaceIds[0] : null,
                      action: action || null,
                      threshold: threshold || null,
                  })
                  Promise.all(
                      answers.map(
                          (answer) =>
                              new Promise(async (resolve2) => {
                                  const { post: newAnswer } = await createPost(
                                      answer,
                                      files,
                                      accountId
                                  )
                                  Link.create({
                                      creatorId: accountId,
                                      itemAType: 'poll',
                                      itemBType: 'poll-answer',
                                      itemAId: newPoll.id,
                                      itemBId: newAnswer.id,
                                      //   relationship: 'parent',
                                      state: 'active',
                                      totalLikes: 0,
                                      totalComments: 0,
                                      totalRatings: 0,
                                  })
                                      .then(() => resolve2())
                                      .catch((error) => resolve2(error))
                              })
                      )
                  ).then((answers) => resolve({ poll: newPoll, answers }))
              })
            : null

        const createGBG = mediaTypes.includes('glass-bead-game')
            ? await new Promise(async (resolve) => {
                  const { topic, settings, beads } = glassBeadGame
                  const topicImageUpload = files.find((f) => f.fieldname === 'topicImage')
                  const totalBeads = beads.length + (sourcePostId ? 1 : 0)
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
                      allowedBeadTypes: gbgSettings.allowedBeadTypes.join(',').toLowerCase(),
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
                      totalBeads,
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
                                                            Number(file.originalname) === index
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
                                                            Number(file.originalname) === index
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
                                          state: player.id === accountId ? 'accepted' : 'pending',
                                      })
                              )
                          )

                          const otherPlayers = await User.findAll({
                              where: {
                                  id: players.filter((p) => p.id !== accountId).map((p) => p.id),
                              },
                              attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                          })

                          const notifyOtherPlayers = await Promise.all(
                              otherPlayers.map(
                                  async (player) =>
                                      await new Promise(async (res) => {
                                          const createNotification = await Notification.create({
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
                                            Player order: ${players.map((p) => p.name).join(' → ')}
                                            <br/>
                                            Turns (moves per player): ${gbgSettings.movesPerPlayer}
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

        const createCard = mediaTypes.includes('card')
            ? await new Promise(async (resolve) => {
                  const { front, back } = card
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

        // const createLink = sourceId
        //     ? await new Promise(async (resolve) => {
        //           // todo: handle other source types when needed
        //           const createNewLink = await Link.create({
        //               state: 'visible',
        //               type: `${sourceType}-post`,
        //               creatorId: accountId,
        //               itemAId: sourceId,
        //               itemBId: post.id,
        //               description: linkDescription,
        //               totalLikes: 0,
        //               totalComments: 0,
        //               totalRatings: 0,
        //           })
        //           const updateSourceLinks = await Post.increment('totalLinks', {
        //               where: { id: sourceId },
        //               silent: true,
        //           })
        //           const updateTargetLinks = await post.update(
        //               { totalLinks: 1 },
        //               { where: { id: post.id }, silent: true }
        //           )
        //           Promise.all([createNewLink, updateSourceLinks, updateTargetLinks])
        //               .then(() => resolve())
        //               .catch((error) => resolve(error))
        //       })
        //     : null

        Promise.all([
            // addSpaces,
            // addLinks,
            notifyMentions,
            createUrls,
            createImages,
            createAudios,
            createEvent,
            createPoll,
            createGBG,
            createCard,
            // createLink,
        ]).then(() => resolveA({ post, event: createEvent }))
    })
}

// database operations
async function updateAllSpaceStats(res) {
    // calculate and update all space stats
    const spaces = await Space.findAll({
        attributes: [
            'id',
            'name',
            totalSpaceLikes,
            totalSpacePosts,
            totalSpaceComments,
            totalSpaceFollowers,
        ],
    })
    Promise.all(
        spaces.map((space) =>
            Space.update(
                {
                    totalPostLikes: space.dataValues.totalLikes,
                    totalPosts: space.dataValues.totalPosts,
                    totalComments: space.dataValues.totalComments,
                    totalFollowers: space.dataValues.totalFollowers,
                },
                { where: { id: space.id }, silent: true }
            )
        )
    )
        .then(() => res.status(200).json({ message: 'Success' }))
        .catch((error) => res.status(500).json(error))
}

async function updateAllSpaceUserStats(res) {
    // calculate and update all SpaceUserStats (currently only totalPostLikes value)
    // warning: long operation (~10 mins with 680 spaces) (using for loop to prevent db overload?)
    const spaces = await Space.findAll({
        where: { totalPostLikes: { [Op.gt]: 0 } },
        attributes: ['id'],
        order: [['totalPostLikes', 'DESC']],
    })

    for (const space of spaces) {
        const users = await User.findAll({
            where: { state: 'active' },
            attributes: ['id', totalLikesReceivedInSpace(space.id)],
            order: [
                [literal('likesReceived'), 'DESC'],
                ['createdAt', 'ASC'],
            ],
            having: { ['likesReceived']: { [Op.gt]: 0 } },
        })
        for (const user of users) {
            await SpaceUserStat.create({
                spaceId: space.id,
                userId: user.id,
                totalPostLikes: +user.dataValues.likesReceived,
            })
        }
    }

    res.status(200).json({ message: 'Success' })
}

module.exports = {
    imageMBLimit,
    audioMBLimit,
    defaultPostValues,
    totalUsers,
    totalSpaceUsers,
    totalSpaceFollowers,
    totalSpaceComments,
    totalSpaceReactions,
    totalSpaceLikes,
    totalSpaceRatings,
    totalSpacePosts,
    totalSpaceSpaces,
    totalSpaceChildren,
    totalUserPosts,
    totalUserComments,
    findStartDate,
    findPostOrder,
    findSpaceOrder,
    findUserOrder,
    findPostType,
    postAccess,
    findInitialPostAttributes,
    findFullPostAttributes,
    findPostThrough,
    findPostWhere,
    findPostInclude,
    findCommentAttributes,
    totalSpaceResults,
    findSpaceSpacesInclude,
    spaceAccess,
    ancestorAccess,
    isModerator,
    isFollowingSpace,
    isFollowingUser,
    totalLikesReceivedInSpace,
    noMulterErrors,
    multerParams,
    convertAndUploadAudio,
    uploadPostFile,
    uploadBeadFile,
    sourcePostId,
    restrictedAncestors,
    getLinkedItem,
    getFullLinkedItem,
    getToyboxItem,
    accountMuted,
    attachParentSpace,
    createImage,
    createAudio,
    createUrl,
    notifyMention,
    createSpacePost,
    accountReaction,
    accountComment,
    accountLink,
    uploadFiles,
    createPost,
    // common models
    creator,
    // database operations
    updateAllSpaceStats,
    updateAllSpaceUserStats,
}

// function totalPostLinks(model) {
//     return [
//         literal(
//             `(SELECT COUNT(*) FROM Links AS Link WHERE Link.state = 'visible' AND Link.type != 'gbg-post' AND (Link.itemAId = ${model}.id OR Link.itemBId = ${model}.id))`
//         ),
//         'totalLinks',
//     ]
// }

// function totalPostLikes(model) {
//     return [
//         literal(
//             `(
//                 SELECT COUNT(*)
//                 FROM Reactions
//                 WHERE Reactions.itemType = 'post'
//                 AND Reactions.itemId = ${model}.id
//                 AND Reactions.type = 'like'
//                 AND Reactions.state = 'active'
//             )`
//         ),
//         'totalLikes',
//     ]
// }

// function totalPostComments(model) {
//     return [
//         literal(
//             `(SELECT COUNT(*) FROM Comments AS Comment WHERE Comment.state = 'visible' AND Comment.type = 'post' AND Comment.itemId = ${model}.id)`
//         ),
//         'totalComments',
//     ]
// }

// function totalPostRatings(model) {
//     return [
//         literal(
//             `(
//                 SELECT COUNT(*)
//                 FROM Reactions
//                 WHERE Reactions.itemType = 'post'
//                 AND Reactions.itemId = ${model}.id
//                 AND Reactions.type = 'rating'
//                 AND Reactions.state = 'active'
//             )`
//         ),
//         'totalRatings',
//     ]
// }

// function totalPostReposts(model) {
//     return [
//         literal(
//             `(
//                 SELECT COUNT(*)
//                 FROM Reactions
//                 WHERE Reactions.itemType = 'post'
//                 AND Reactions.itemId = ${model}.id
//                 AND Reactions.type = 'repost'
//                 AND Reactions.state = 'active'
//             )`
//         ),
//         'totalReposts',
//     ]
// }

// function accountLike(itemType, model, accountId) {
//     return [
//         literal(`(
//             SELECT CASE WHEN EXISTS (
//                 SELECT id FROM Reactions
//                 WHERE itemType = '${itemType}'
//                 AND itemId = ${model}.id
//                 AND creatorId = ${accountId}
//                 AND type = 'like'
//                 AND state = 'active'
//             )
//             THEN 1 ELSE 0 END
//         )`),
//         'accountLike',
//     ]
// }

// function accountComment(itemType, model, accountId) {
//     return [
//         literal(`(
//             SELECT CASE WHEN EXISTS (
//                 SELECT id FROM Links
//                 WHERE creatorId = ${accountId}
//                 AND itemAId = ${model}.id
//                 AND itemAType = '${itemType}'
//                 AND itemBType = 'comment'
//                 AND (relationship = 'parent' OR relationship = 'root')
//                 AND state = 'active'
//             )
//             THEN 1 ELSE 0 END
//         )`),
//         'accountComment',
//     ]
// }

// function accountRating(itemType, model, accountId) {
//     return [
//         literal(`(
//             SELECT CASE WHEN EXISTS (
//                 SELECT id FROM Reactions
//                 WHERE itemType = '${itemType}'
//                 AND itemId = ${model}.id
//                 AND creatorId = ${accountId}
//                 AND type = 'rating'
//                 AND state = 'active'
//             )
//             THEN 1 ELSE 0 END
//         )`),
//         'accountRating',
//     ]
// }

// function accountRepost(itemType, model, accountId) {
//     return [
//         literal(`(
//             SELECT CASE WHEN EXISTS (
//                 SELECT id FROM Reactions
//                 WHERE itemType = '${itemType}'
//                 AND itemId = ${model}.id
//                 AND creatorId = ${accountId}
//                 AND type = 'repost'
//                 AND state = 'active'
//             )
//             THEN 1 ELSE 0 END
//         )`),
//         'accountRepost',
//     ]
// }

// function accountLink(itemType, model, accountId) {
//     return [
//         literal(`(
//             SELECT CASE WHEN EXISTS (
//                 SELECT id FROM Links
//                 WHERE state = 'active'
//                 AND relationship = 'link'
//                 AND creatorId = ${accountId}
//                 AND (
//                     (itemAId = ${model}.id AND itemAType = '${itemType}')
//                     OR
//                     (itemBId = ${model}.id AND itemBType = '${itemType}')
//                 )
//             )
//             THEN 1 ELSE 0 END
//         )`),
//         'accountLink',
//     ]
// }
