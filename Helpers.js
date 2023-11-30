const sequelize = require('sequelize')
const Op = sequelize.Op
const {
    Space,
    User,
    Post,
    Comment,
    GlassBeadGame,
    Event,
    Image,
    Url,
    Audio,
    SpaceUserStat,
    SpaceParent,
    SpaceAncestor,
} = require('./models')

var aws = require('aws-sdk')
var multer = require('multer')
var multerS3 = require('multer-s3')
aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1',
})
const s3 = new aws.S3({})
const fs = require('fs')
var ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
ffmpeg.setFfmpegPath(ffmpegPath)

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

function findFileName(file, accountId, isAudio) {
    const date = Date.now().toString()
    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
    const extension = isAudio ? 'mp3' : file.mimetype.split('/')[1]
    return `${accountId}-${date}-${name}.${extension}`
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
            key: (req, file, cb) => cb(null, findFileName(file, accountId, isAudio)),
        })
    }
    return params
}

function convertAndUploadAudio(file, accountId, type) {
    return new Promise((resolve) => {
        // convert raw audio to mp3
        const outputPath = `temp/audio/mp3/${file.filename}.mp3`
        ffmpeg(file.path)
            .output(outputPath)
            .on('end', () => {
                // upload new mp3 file to s3 bucket
                fs.readFile(outputPath, (err, data) => {
                    if (!err) {
                        const fileName = findFileName(file, accountId, true)
                        const bucket = `weco-${process.env.NODE_ENV}-post-audio`
                        const s3Object = {
                            Bucket: bucket,
                            ACL: 'public-read',
                            Key: fileName,
                            Body: data,
                            Metadata: { mimetype: 'audio/mp3' },
                            ContentType: 'audio/mpeg',
                        }
                        s3.putObject(s3Object, (err) => {
                            // delete old files
                            if (type === 'post')
                                fs.unlink(`temp/audio/raw/${file.filename}`, (e) => console.log(e))
                            else fs.unlink(`temp/beads/${file.filename}`, (e) => console.log(e))
                            fs.unlink(`temp/audio/mp3/${file.filename}.mp3`, (e) => console.log(e))
                            // return audio url
                            resolve(`https://${bucket}.s3.eu-west-1.amazonaws.com/${fileName}`)
                        })
                    }
                })
            })
            .run()
    })
}

function uploadBeadFile(file, accountId) {
    return new Promise((resolve) => {
        // fieldnames include: 'topicImage', 'imageFile', 'audioFile',
        const isAudio = file.fieldname.includes('audio')
        const bucketType = isAudio ? 'post-audio' : 'post-images'
        const fileName = findFileName(file, accountId, isAudio)
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
        sequelize.literal(
            `(
                SELECT SUM(value)
                FROM Reactions
                WHERE Reactions.itemType = '${itemType}'
                AND Reactions.itemId = ${model}.id
                AND Reactions.type = 'rating'
                AND Reactions.state = 'active'
            )`
        ),
        'totalRatingPoints',
    ]
}

function sourcePostId() {
    return [
        sequelize.literal(`(
            SELECT Link.itemAId
            FROM Links
            AS Link
            WHERE Link.itemBId = Post.id
            AND (Link.type = 'gbg-post' OR Link.type = 'card-post')
        )`),
        'sourcePostId',
    ]
}

function accountLike(itemType, model, accountId) {
    return [
        sequelize.literal(`(
            SELECT CASE WHEN EXISTS (
                SELECT Reactions.id
                FROM Reactions
                WHERE Reactions.itemType = '${itemType}'
                AND Reactions.itemId = ${model}.id
                AND Reactions.creatorId = ${accountId}
                AND Reactions.type = 'like'
                AND Reactions.state = 'active'
            )
            THEN 1 ELSE 0 END
        )`),
        'accountLike',
    ]
}

function accountComment(itemType, model, accountId) {
    return [
        sequelize.literal(`(
            SELECT CASE WHEN EXISTS (
                SELECT Links.id
                FROM Links
                WHERE Links.creatorId = ${accountId}
                AND Links.itemAId = ${model}.id
                AND Links.itemAType = '${itemType}'
                AND Links.itemBType = 'comment'
                AND (Links.relationship = 'parent' OR Links.relationship = 'root')
                AND Links.state = 'active'
            )
            THEN 1 ELSE 0 END
        )`),
        'accountComment',
    ]
}

function accountRating(itemType, model, accountId) {
    return [
        sequelize.literal(`(
            SELECT CASE WHEN EXISTS (
                SELECT Reactions.id
                FROM Reactions
                WHERE Reactions.itemType = '${itemType}'
                AND Reactions.itemId = ${model}.id
                AND Reactions.creatorId = ${accountId}
                AND Reactions.type = 'rating'
                AND Reactions.state = 'active'
            )
            THEN 1 ELSE 0 END
        )`),
        'accountRating',
    ]
}

function accountRepost(itemType, model, accountId) {
    return [
        sequelize.literal(`(
            SELECT CASE WHEN EXISTS (
                SELECT Reactions.id
                FROM Reactions
                WHERE Reactions.itemType = '${itemType}'
                AND Reactions.itemId = ${model}.id
                AND Reactions.creatorId = ${accountId}
                AND Reactions.type = 'repost'
                AND Reactions.state = 'active'
            )
            THEN 1 ELSE 0 END
        )`),
        'accountRepost',
    ]
}

function accountLink(itemType, model, accountId) {
    return [
        sequelize.literal(`(
            SELECT CASE WHEN EXISTS (
                SELECT Links.id
                FROM Links
                WHERE Links.state = 'active'
                AND Links.relationship = 'link'
                AND Links.creatorId = ${accountId}
                AND (
                    (Links.itemAId = ${model}.id AND Links.itemAType = '${itemType}')
                    OR
                    (Links.itemBId = ${model}.id AND Links.itemBType = '${itemType}')
                )
            )
            THEN 1 ELSE 0 END
        )`),
        'accountLink',
    ]
}

function postAccess(accountId) {
    // todo: 10x faster approach found & applied on user-posts route. Apply to post-data & space-events routes then remove function.
    // checks number of private spaces post is in = number of those spaces user has access to
    // reposts excluded so public posts can be reposted into private spaces without blocking access
    return [
        sequelize.literal(`(
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
    sequelize.literal(`(
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
    sequelize.literal(`(
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
    sequelize.literal(`(
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
    sequelize.literal(`(
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
    sequelize.literal(`(
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
    sequelize.literal(`(
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
    sequelize.literal(`(
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
    sequelize.literal(`(
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
    sequelize.literal(`(
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
        sequelize.literal(`(
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
    sequelize.literal(`(
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
        sequelize.literal(`(
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
        sequelize.literal(`(
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
        sequelize.literal(`(
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
        sequelize.literal(`(
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
        sequelize.literal(`(
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
            sequelize.literal(`(
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
                  sequelize.literal(`(
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
                  sequelize.literal(`(
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
    sequelize.literal(
        `(SELECT COUNT(*) FROM Users WHERE Users.emailVerified = true AND Users.state = 'active')`
    ),
    'totalUsers',
]

const totalUserPosts = [
    sequelize.literal(`(
        SELECT COUNT(*)
        FROM Posts
        WHERE Posts.state = 'visible'
        AND Posts.creatorId = User.id
        AND Posts.type IN ('text', 'url', 'image', 'audio', 'event', 'poll', 'glass-bead-game')
    )`),
    'totalPosts',
]

const totalUserComments = [
    sequelize.literal(`(
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
        accountLike('post', model, accountId),
        accountComment('post', model, accountId),
        accountLink('post', model, accountId),
        accountRating('post', model, accountId),
        accountRepost('post', model, accountId),
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
            'type',
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
                [sequelize.literal('likesReceived'), 'DESC'],
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
    uploadBeadFile,
    sourcePostId,
    restrictedAncestors,
    getLinkedItem,
    getFullLinkedItem,
    getToyboxItem,
    accountLike,
    accountMuted,
    attachParentSpace,
    // database operations
    updateAllSpaceStats,
    updateAllSpaceUserStats,
}

// function totalPostLinks(model) {
//     return [
//         sequelize.literal(
//             `(SELECT COUNT(*) FROM Links AS Link WHERE Link.state = 'visible' AND Link.type != 'gbg-post' AND (Link.itemAId = ${model}.id OR Link.itemBId = ${model}.id))`
//         ),
//         'totalLinks',
//     ]
// }

// function totalPostLikes(model) {
//     return [
//         sequelize.literal(
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
//         sequelize.literal(
//             `(SELECT COUNT(*) FROM Comments AS Comment WHERE Comment.state = 'visible' AND Comment.type = 'post' AND Comment.itemId = ${model}.id)`
//         ),
//         'totalComments',
//     ]
// }

// function totalPostRatings(model) {
//     return [
//         sequelize.literal(
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
//         sequelize.literal(
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
