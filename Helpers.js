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

const imageMBLimit = 10
const audioMBLimit = 25

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

// post literals (model prop used to distinguish between Post and StringPosts)
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
            `(SELECT COUNT(*) FROM Comments AS Comment WHERE Comment.state = 'visible' AND Comment.postId = ${model}.id)`
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
            `(SELECT COUNT(*) FROM Links AS Link WHERE Link.state = 'visible' AND Link.type != 'string-post' AND (Link.itemAId = ${model}.id OR Link.itemBId = ${model}.id))`
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
            AND Link.type != 'string-post'
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
              'inquiry',
              'glass-bead-game',
              'string',
              'weave',
              'prism',
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
        'text',
        'url',
        'urlImage',
        'urlDomain',
        'urlTitle',
        'urlDescription',
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
            { '$GlassBeadGame.topic$': { [Op.like]: `%${searchQuery}%` } },
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
            attributes: findFullPostAttributes('StringPosts', accountId),
            through: {
                where: { state: 'visible', type: 'string-post' },
                attributes: ['index', 'relationship'],
            },
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
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
    restrictedAncestors,
}
