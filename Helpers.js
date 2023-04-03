const sequelize = require('sequelize')
const Op = sequelize.Op
const {
    Space,
    User,
    Post,
    Reaction,
    GlassBeadGame,
    GlassBeadGame2,
    GlassBead,
    Event,
    Inquiry,
    InquiryAnswer,
    Image,
    Weave,
    Url,
    Audio,
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
const audioMBLimit = 25

function findFileName(file, accountId) {
    const date = Date.now().toString()
    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
    const extension = file.mimetype.split('/')[1]
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
    // types: 'image-file', 'audio-file', 'audio-blob', 'glass-bead-game'
    const limit = type.includes('audio') ? audioMBLimit : imageMBLimit
    const params = { limits: { fileSize: limit * 1024 * 1024 } }
    if (type === 'audio-blob') params.dest = './temp/audio/raw'
    else if (type === 'glass-bead-game') params.dest = './temp/beads'
    else {
        const bucketType = type.includes('audio') ? 'post-audio' : 'post-images'
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
                        const fileName = findFileName(file, accountId)
                        const bucket = `weco-${process.env.NODE_ENV}-post-audio`
                        const s3Object = {
                            Bucket: bucket,
                            ACL: 'public-read',
                            Key: fileName,
                            Body: data,
                            Metadata: { mimetype: file.mimetype },
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
        const bucketType = file.fieldname.includes('audio') ? 'post-audio' : 'post-images'
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

// general functions
function createSQLDate(date) {
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ')
}

function findStartDate(timeRange) {
    let startDate = new Date()
    let offset = Date.now()
    if (timeRange === 'Last Hour') offset = 60 * 60 * 1000
    if (timeRange === 'Last 24 Hours') offset = 24 * 60 * 60 * 1000
    if (timeRange === 'Last Week') offset = 24 * 60 * 60 * 1000 * 7
    if (timeRange === 'Last Month') offset = 24 * 60 * 60 * 1000 * 30
    if (timeRange === 'Last Year') offset = 24 * 60 * 60 * 1000 * 365
    return startDate.setTime(startDate.getTime() - offset)
}

function findOrder(sortBy, sortOrder) {
    const direction = sortOrder === 'Ascending' ? 'ASC' : 'DESC'
    return sortBy === 'Date'
        ? [
              ['createdAt', direction],
              ['id', 'ASC'],
          ]
        : [
              [sequelize.literal(`total${sortBy}`), direction],
              ['createdAt', 'DESC'],
              ['id', 'ASC'],
          ]
}

// post literals (model prop used to distinguish between Post and Beads)
function totalPostLikes(model) {
    return [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = ${model}.id AND Reaction.type = 'like' AND Reaction.state = 'active')`
        ),
        'totalLikes',
    ]
}

function totalPostComments(model) {
    return [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Comments AS Comment WHERE Comment.state = 'visible' AND Comment.type = 'post' AND Comment.itemId = ${model}.id)`
        ),
        'totalComments',
    ]
}

function totalPostRatings(model) {
    return [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = ${model}.id AND Reaction.type = 'rating' AND Reaction.state = 'active')`
        ),
        'totalRatings',
    ]
}

function totalPostReposts(model) {
    return [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = ${model}.id AND Reaction.type = 'repost' AND Reaction.state = 'active')`
        ),
        'totalReposts',
    ]
}

function totalPostRatingPoints(model) {
    return [
        sequelize.literal(
            `(SELECT SUM(value) FROM Reactions AS Reaction WHERE Reaction.postId = ${model}.id AND Reaction.type = 'rating' AND Reaction.state = 'active')`
        ),
        'totalRatingPoints',
    ]
}

function totalPostLinks(model) {
    return [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Links AS Link WHERE Link.state = 'visible' AND Link.type != 'gbg-post' AND (Link.itemAId = ${model}.id OR Link.itemBId = ${model}.id))`
        ),
        'totalLinks',
    ]
}

function accountLike(model, accountId) {
    return [
        sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Reactions
            AS Reaction
            WHERE Reaction.postId = ${model}.id
            AND Reaction.userId = ${accountId}
            AND Reaction.type = 'like'
            AND Reaction.state = 'active'
        )`),
        'accountLike',
    ]
}

function accountRating(model, accountId) {
    return [
        sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Reactions
            AS Reaction
            WHERE Reaction.postId = ${model}.id
            AND Reaction.userId = ${accountId}
            AND Reaction.type = 'rating'
            AND Reaction.state = 'active'
        )`),
        'accountRating',
    ]
}

function accountRepost(model, accountId) {
    return [
        sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Reactions
            AS Reaction
            WHERE Reaction.postId = ${model}.id
            AND Reaction.userId = ${accountId}
            AND Reaction.type = 'repost'
            AND Reaction.state = 'active'
        )`),
        'accountRepost',
    ]
}

function accountLink(model, accountId) {
    return [
        sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Links
            AS Link
            WHERE Link.state = 'visible'
            AND Link.type = 'post-post'
            AND Link.creatorId = ${accountId}
            AND (Link.itemAId = ${model}.id OR Link.itemBId = ${model}.id)
        )`),
        'accountLink',
    ]
}

function postAccess(accountId) {
    // checks number of private spaces post is in = number of those spaces user has access to
    // reposts excluded so public posts can be reposted into private spaces without blocking access
    // todo: find more efficient query
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
        AND Comments.type = 'post'
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
        AND Reactions.type != 'vote'
        AND Reactions.postId IN (
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
        AND Reactions.postId IN (
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
        AND Reactions.postId IN (
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

function isFollowing(accountId) {
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

function totalLikesReceivedInSpace(spaceId) {
    // calculates the total likes recieved by the user in a space
    return [
        sequelize.literal(`(
            SELECT COUNT(*)
            FROM Reactions
            WHERE Reactions.state = 'active'
            AND Reactions.type = 'like'
            AND Reactions.postId IN (
                SELECT Posts.id
                FROM Posts
                WHERE Posts.state = 'visible'
                AND Posts.creatorId = User.id
                AND Posts.id IN (
                    SELECT SpacePosts.postId
                    FROM SpacePosts
                    WHERE SpacePosts.spaceId = ${spaceId}
                    AND (SpacePosts.relationship = 'indirect' OR SpacePosts.relationship = 'direct')
                )
            )
        )`),
        'likesReceived',
    ]
}

function totalSpaceResults(depth, timeRange, searchQuery) {
    // todo: move to helpers (requires: timeRange, depth, searchQuery)
    const startDate = createSQLDate(findStartDate(timeRange))
    const endDate = createSQLDate(new Date())

    return depth === 'All Contained Spaces'
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
                        AND SpaceAncestors.state = 'open'
                        OR SpaceAncestors.state = 'closed'
                    ) AND (
                        s.handle LIKE '%${searchQuery}%'
                        OR s.name LIKE '%${searchQuery}%'
                        OR s.description LIKE '%${searchQuery}%'
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
                        s.handle LIKE '%${searchQuery}%'
                        OR s.name LIKE '%${searchQuery}%'
                        OR s.description LIKE '%${searchQuery}%'
                    ) AND s.createdAt BETWEEN '${startDate}' AND '${endDate}'
                    )`),
              'totalResults',
          ]
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
        AND Posts.type IN ('text', 'url', 'images', 'audio', 'event', 'string', 'glass-bead-game', 'prism')
        AND Posts.creatorId = User.id
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

const unseenNotifications = [
    sequelize.literal(
        `(SELECT COUNT(*) FROM Notifications AS Notification WHERE Notification.ownerId = User.id AND Notification.seen = false)`
    ),
    'unseenNotifications',
]

// post functions
function findPostType(type) {
    return type === 'All Types'
        ? [
              'text',
              'url',
              'image',
              'audio',
              'event',
              'poll',
              'glass-bead-game',
              //   'string',
              //   'weave',
              //   'prism',
          ]
        : type.replace(/\s+/g, '-').toLowerCase()
}

function findInitialPostAttributes(sortBy) {
    const attributes = ['id']
    if (sortBy === 'Links') attributes.push(totalPostLinks('Post'))
    if (sortBy === 'Comments') attributes.push(totalPostComments('Post'))
    if (sortBy === 'Likes') attributes.push(totalPostLikes('Post'))
    if (sortBy === 'Ratings') attributes.push(totalPostRatings('Post'))
    if (sortBy === 'Reposts') attributes.push(totalPostReposts('Post'))
    return attributes
}

function findInitialPostAttributesWithAccess(sortBy, accountId) {
    const attributes = ['id', postAccess(accountId)]
    if (sortBy === 'Links') attributes.push(totalPostLinks('Post'))
    if (sortBy === 'Comments') attributes.push(totalPostComments('Post'))
    if (sortBy === 'Likes') attributes.push(totalPostLikes('Post'))
    if (sortBy === 'Ratings') attributes.push(totalPostRatings('Post'))
    if (sortBy === 'Reposts') attributes.push(totalPostReposts('Post'))
    return attributes
}

function findFullPostAttributes(model, accountId) {
    return [
        'id',
        'type',
        'state',
        'color',
        'title',
        'text',
        // 'url',
        // 'urlImage',
        // 'urlDomain',
        // 'urlTitle',
        // 'urlDescription',
        'createdAt',
        'updatedAt',
        totalPostLikes(model),
        totalPostComments(model),
        totalPostRatings(model),
        totalPostReposts(model),
        totalPostRatingPoints(model),
        totalPostLinks(model),
        accountLike(model, accountId),
        accountRating(model, accountId),
        accountRepost(model, accountId),
        accountLink(model, accountId),
    ]
}

function findPostThrough(depth) {
    const relationship =
        depth === 'All Contained Posts' ? { [Op.or]: ['direct', 'indirect'] } : 'direct'
    return { where: { relationship }, attributes: [] }
}

function findPostWhere(location, id, startDate, type, searchQuery) {
    const where = {
        state: 'visible',
        createdAt: { [Op.between]: [startDate, Date.now()] },
        type,
    }
    if (location === 'space') where['$AllPostSpaces.id$'] = id
    if (location === 'user') where.creatorId = id
    if (searchQuery) {
        where[Op.or] = [
            { text: { [Op.like]: `%${searchQuery}%` } },
            { urlTitle: { [Op.like]: `%${searchQuery}%` } },
            { urlDescription: { [Op.like]: `%${searchQuery}%` } },
            { urlDomain: { [Op.like]: `%${searchQuery}%` } },
            { '$GlassBeadGame2.topic$': { [Op.like]: `%${searchQuery}%` } },
        ]
    }
    return where
}

function findPostInclude(accountId) {
    return [
        {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        },
        {
            model: Space,
            as: 'DirectSpaces',
            // where: { [Op.not]: { id: 1 } },
            required: false,
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'state'],
            through: { where: { relationship: 'direct', type: 'post' }, attributes: [] },
        },
        {
            model: Url,
            attributes: ['url', 'image', 'title', 'description', 'domain'],
        },
        {
            model: Image,
            attributes: ['id', 'index', 'url', 'caption'],
        },
        {
            model: Audio,
            attributes: ['url'],
        },
        {
            model: Event,
            attributes: ['id', 'title', 'startTime', 'endTime'],
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
        {
            model: Inquiry,
            attributes: ['title', 'type'],
            include: [
                {
                    model: InquiryAnswer,
                    attributes: ['id', 'text', 'createdAt'],
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
            model: GlassBeadGame2,
            // attributes: ['topic', 'topicGroup', 'topicImage'],
            // include: [
            //     {
            //         model: GlassBead,
            //         where: { state: 'visible' },
            //         attributes: ['id', 'index', 'beadUrl'],
            //         required: false,
            //         include: [
            //             {
            //                 model: User,
            //                 as: 'user',
            //                 attributes: ['handle', 'name', 'flagImagePath'],
            //             },
            //         ],
            //     },
            // ],
        },
        {
            model: Post,
            as: 'Beads',
            attributes: findFullPostAttributes('Beads', accountId),
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
        },
        // {
        //     model: Weave,
        //     attributes: [
        //         'numberOfTurns',
        //         'numberOfMoves',
        //         'allowedBeadTypes',
        //         'moveTimeWindow',
        //         'nextMoveDeadline',
        //         'audioTimeLimit',
        //         'characterLimit',
        //         'state',
        //         'privacy',
        //     ],
        // },
        {
            model: User,
            as: 'Players',
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'state'],
            through: {
                where: { type: 'glass-bead-game' },
                attributes: ['index', 'state', 'color'],
            },
        },
    ]
}

function findSpaceSpaceAttributes(accountId) {
    return [
        'id',
        'handle',
        'name',
        'description',
        'flagImagePath',
        'coverImagePath',
        'privacy',
        totalSpaceFollowers,
        totalSpaceComments,
        totalSpaceReactions,
        totalSpaceLikes,
        totalSpaceRatings,
        totalSpacePosts,
        totalSpaceChildren,
        ancestorAccess(accountId),
    ]
}

function findSpaceSpacesWhere(spaceId, depth, timeRange, searchQuery) {
    const where = {
        state: 'active',
        createdAt: { [Op.between]: [findStartDate(timeRange), Date.now()] },
        [Op.or]: [
            { handle: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
            { name: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
            { description: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
        ],
    }
    if (depth === 'All Contained Spaces') where['$SpaceAncestors.id$'] = spaceId
    else where['$DirectParentSpaces.id$'] = spaceId
    return where
}

function findSpaceSpacesInclude(depth) {
    return [
        {
            model: Space,
            as: depth === 'All Contained Spaces' ? 'SpaceAncestors' : 'DirectParentSpaces',
            attributes: [],
            through: { attributes: [], where: { state: 'open' } },
        },
    ]
}

module.exports = {
    imageMBLimit,
    audioMBLimit,
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
    unseenNotifications,
    findStartDate,
    findOrder,
    findPostType,
    postAccess,
    findInitialPostAttributes,
    findInitialPostAttributesWithAccess,
    findFullPostAttributes,
    findPostThrough,
    findPostWhere,
    findPostInclude,
    findSpaceSpaceAttributes,
    totalSpaceResults,
    findSpaceSpacesWhere,
    findSpaceSpacesInclude,
    spaceAccess,
    ancestorAccess,
    isModerator,
    isFollowing,
    totalLikesReceivedInSpace,
    noMulterErrors,
    multerParams,
    convertAndUploadAudio,
    uploadBeadFile,
    restrictedAncestors,
}
