const sequelize = require('sequelize')
const Op = sequelize.Op
const {
    Space,
    User,
    Post,
    Reaction,
    GlassBeadGame,
    GlassBead,
    Event,
    Inquiry,
    InquiryAnswer,
    PostImage,
    Weave,
} = require('./models')

// space literal
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
        AND Comments.postId IN (
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

const totalSpaceChildren = [
    sequelize.literal(`(
        SELECT COUNT(*)
        FROM SpaceParents
        AS VHR
        WHERE VHR.spaceAId = Space.id
        AND VHR.state = 'open'
    )`),
    'totalChildren',
]

// user literals
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

// attributes
const defaultPostAttributes = [
    'id',
    'type',
    'state',
    'color',
    'text',
    'url',
    'urlImage',
    'urlDomain',
    'urlTitle',
    'urlDescription',
    'createdAt',
    'updatedAt',
]

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }
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
        ? [['createdAt', direction]]
        : [
              [sequelize.literal(`total${sortBy}`), direction],
              ['createdAt', 'DESC'],
          ]
}

function findPostType(type) {
    return type === 'All Types'
        ? [
              'text',
              'url',
              'image',
              'audio',
              'event',
              'inquiry',
              'glass-bead-game',
              'string',
              'weave',
              'prism',
          ]
        : type.replace(/\s+/g, '-').toLowerCase()
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

function findInitialPostAttributes(sortBy, accountId) {
    const attributes = ['id', postAccess(accountId)]
    if (sortBy === 'Comments') attributes.push(totalPostComments)
    if (sortBy === 'Likes') attributes.push(totalPostLikes)
    if (sortBy === 'Ratings') attributes.push(totalPostRatings)
    if (sortBy === 'Reposts') attributes.push(totalPostReposts)
    return attributes
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
            { '$GlassBeadGame.topic$': { [Op.like]: `%${searchQuery}%` } },
        ]
    }
    return where
}

function findPostReactions(model) {
    const totalLikes = [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = ${model}.id AND Reaction.type = 'like' AND Reaction.state = 'active')`
        ),
        'totalLikes',
    ]

    const totalComments = [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Comments AS Comment WHERE Comment.state = 'visible' AND Comment.postId = ${model}.id)`
        ),
        'totalComments',
    ]

    const totalRatings = [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = ${model}.id AND Reaction.type = 'rating' AND Reaction.state = 'active')`
        ),
        'totalRatings',
    ]

    const totalReposts = [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = ${model}.id AND Reaction.type = 'repost' AND Reaction.state = 'active')`
        ),
        'totalReposts',
    ]

    const totalRatingPoints = [
        sequelize.literal(
            `(SELECT SUM(value) FROM Reactions AS Reaction WHERE Reaction.postId = ${model}.id AND Reaction.type = 'rating' AND Reaction.state = 'active')`
        ),
        'totalRatingPoints',
    ]

    const totalLinks = [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Links AS Link WHERE Link.state = 'visible' AND Link.type != 'string-post' AND (Link.itemAId = ${model}.id OR Link.itemBId = ${model}.id))`
        ),
        'totalLinks',
    ]
    return [totalLikes, totalComments, totalRatings, totalReposts, totalRatingPoints, totalLinks]
}

function findAccountReactions(model, accountId) {
    const accountLike = [
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
    const accountRating = [
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
    const accountRepost = [
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
    const accountLink = [
        sequelize.literal(`(
            SELECT COUNT(*) > 0
            FROM Links
            AS Link
            WHERE Link.state = 'visible'
            AND Link.type != 'string-post'
            AND Link.creatorId = ${accountId}
            AND (Link.itemAId = ${model}.id OR Link.itemBId = ${model}.id)
        )`),
        'accountLink',
    ]
    return [accountLike, accountRating, accountRepost, accountLink]
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
            where: { [Op.not]: { id: 1 } },
            required: false,
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'state'],
            through: { where: { relationship: 'direct', type: 'post' }, attributes: [] },
        },
        // todo: remove, currently only used in repost modal so should be grabbed there
        {
            model: Space,
            as: 'IndirectSpaces',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
            through: { where: { relationship: 'indirect' }, attributes: [] },
        },
        {
            model: PostImage,
            attributes: ['id', 'index', 'url', 'caption'],
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
            model: GlassBeadGame,
            attributes: ['topic', 'topicGroup', 'topicImage'],
            include: [
                {
                    model: GlassBead,
                    where: { state: 'visible' },
                    attributes: ['id', 'index', 'beadUrl'],
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
                ...defaultPostAttributes,
                ...findPostReactions('StringPosts'),
                ...findAccountReactions('StringPosts', accountId),
            ],
            through: {
                where: { state: 'visible', type: 'string-post' },
                attributes: ['index', 'relationship'],
            },
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: ['handle', 'name', 'flagImagePath'],
                },
                {
                    model: PostImage,
                    attributes: ['id', 'index', 'url', 'caption'],
                },
            ],
        },
        {
            model: Weave,
            attributes: [
                'numberOfTurns',
                'numberOfMoves',
                'allowedBeadTypes',
                'moveTimeWindow',
                'nextMoveDeadline',
                'audioTimeLimit',
                'characterLimit',
                'state',
                'privacy',
            ],
        },
        {
            model: User,
            as: 'StringPlayers',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
            through: {
                where: { type: 'weave' },
                attributes: ['index', 'state', 'color'],
            },
        },
    ]
}

module.exports = {
    defaultPostAttributes,
    totalSpaceFollowers,
    totalSpaceComments,
    totalSpaceReactions,
    totalSpaceLikes,
    totalSpaceRatings,
    totalSpacePosts,
    totalSpaceChildren,
    totalUserPosts,
    totalUserComments,
    asyncForEach,
    findStartDate,
    findOrder,
    findPostType,
    postAccess,
    findInitialPostAttributes,
    findPostThrough,
    findPostWhere,
    findPostReactions,
    findAccountReactions,
    findPostInclude,
}
