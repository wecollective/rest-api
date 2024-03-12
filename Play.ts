import { isEqual, omit } from 'lodash'
import schedule from 'node-schedule'
import sequelize from 'sequelize'
import { Server, Socket } from 'socket.io'

const { Post } = require('./models')

const { Op } = sequelize

export const POST_TYPE = [
'post',
    'play',
    'comment',
    'bead',
    'poll-answer',
    'card-face',
    'gbg-room-comment',
    'url-block',
    'image-block',
    'audio-block',
] as const

export type PostType = (typeof POST_TYPE)[number]

export type Post = {
    id: number
    type: PostType
    mediaTypes: string
    title: string
    text: string
    createdAt: string
    updatedAt: string
    totalComments: number
    totalLikes: number
    totalRatings: number
    totalReposts: number
    totalLinks: number
    creatorId: number
    game?: Game
    play?: Play
}

export type Step = {
    id: string
} & (
    | {
          type: 'post'
          post: {
              title: string
              text: string
              timeout: number
          }
      }
    | {
          type: 'game'
          gameId: number
      }
    | {
          type: 'rounds'
          amount: string
          steps: Step[]
      }
    | {
          type: 'turns'
          steps: Step[]
      }
)

export type LeafStep = Extract<Step, { type: 'post' }>

export type Game = {
    steps: Step[]
}

export type PlayVariables = Record<string, string | number | boolean>

export type Play = {
    game: Game
    gameId: number
    playerIds: number[]
    status: 'waiting' | 'started' | 'paused' | 'stopped' | 'ended'
    variables: PlayVariables
} & (
    | { status: 'waiting' | 'stopped' | 'ended' }
    | { status: 'paused'; step: LeafStep }
    | { status: 'started'; step: LeafStep; stepTimeout: number }
)

async function getPost(id: number) {
    return await Post.findOne({
        where: {
            state: 'active',
            id
        }
    })
}

const getFirstLeafStep = (
    step: Step | undefined,
    variables: PlayVariables,
    playerIds: number[]
): undefined | { step: LeafStep; variables: PlayVariables } => {
    if (!step) {
        return undefined
    }
    switch (step.type) {
        case 'game':
            throw new Error('TODO')
        case 'post':
            return { step, variables }
        case 'rounds': {
            const firstStep = getFirstLeafStep(step.steps[0], variables, playerIds)
            if (!firstStep) {
                return undefined
            }
            return {
                step: firstStep.step,
                variables: {
                    ...firstStep.variables,
                    [`${step.id}_round`]: firstStep.variables[`${step.id}_round`] ?? 1,
                },
            }
        }
        case 'turns': {
            const firstStep = getFirstLeafStep(step.steps[0], variables, playerIds)
            if (!firstStep) {
                return undefined
            }
            return {
                step: firstStep.step,
                variables: {
                    ...firstStep.variables,
                    [`${step.id}_player`]: firstStep.variables[`${step.id}_player`] ?? playerIds[0],
                },
            }
        }
        default: {
            const exhaustivenessCheck: never = step
            throw exhaustivenessCheck
        }
    }
}

const getTransition = (
    steps: Step[],
    stepId: string,
    variables: PlayVariables,
    playerIds: number[]
): undefined | { current: LeafStep; next?: LeafStep; variables: PlayVariables } => {
    let current: LeafStep | undefined
    let currentVariables = variables
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]

        if (current) {
            const nextStep = getFirstLeafStep(step, currentVariables, playerIds)
            if (nextStep) {
                return { current, next: nextStep.step, variables: nextStep.variables }
            }
        } else {
            switch (step.type) {
                case 'game':
                    throw new Error('TODO')
                case 'post':
                    if (step.id === stepId) {
                        current = step
                    }
                    break
                case 'rounds': {
                    const result = getTransition(step.steps, stepId, currentVariables, playerIds)
                    if (!result) {
                        break
                    }

                    if (result.next) {
                        return result
                    }

                    const roundKey = `${step.id}_round`
                    const currentRound = currentVariables[roundKey] as number
                    if (currentRound < +step.amount) {
                        const firstStep = getFirstLeafStep(
                            step,
                            {
                                ...result.variables,
                                [roundKey]: currentRound + 1,
                            },
                            playerIds
                        )
                        if (firstStep) {
                            return {
                                current: result.current,
                                next: firstStep.step,
                                variables: firstStep.variables,
                            }
                        }
                    }

                    current = result.current
                    currentVariables = omit(result.variables, roundKey)
                    break
                }
                case 'turns': {
                    const result = getTransition(step.steps, stepId, currentVariables, playerIds)
                    if (!result) {
                        break
                    }

                    if (result.next) {
                        return result
                    }

                    const playerKey = `${step.id}_player`
                    const currentPlayerId = result.variables[playerKey] as number
                    const currentPlayerIndex = playerIds.indexOf(currentPlayerId)
                    if (currentPlayerIndex < playerIds.length - 1) {
                        const firstStep = getFirstLeafStep(
                            step,
                            {
                                ...result.variables,
                                [playerKey]: playerIds[currentPlayerIndex + 1],
                            },
                            playerIds
                        )
                        if (firstStep) {
                            return {
                                current: result.current,
                                next: firstStep.step,
                                variables: firstStep.variables,
                            }
                        }
                    }

                    current = result.current
                    currentVariables = omit(result.variables, playerKey)
                    break
                }
                default: {
                    const exhaustivenessCheck: never = step
                    throw exhaustivenessCheck
                }
            }
        }
    }

    if (current) {
        return { current, variables: currentVariables }
    }

    return undefined
}


async function startStep(post: Post) {
    const play = post.play!
    // const { current, next, variables } = getTransition(play.game.steps, play.step.id, play.variables, play.playerIds)

    // switch (current.type) {
    //     case 'post':
    //         const timeout = parseDuration(current.post.timeout)
    //         await createPost({
    //             type: 'post',
    //             title: current.post.title,
    //             text: current.post.text,
    //         }, [], post.creatorId)
    //         scheduleEndStep(post)
    //         break;
    //     default:
    //         throw new Error('TODO')
    // }

    // const newPost = {};
    // scheduleEndStep(post);
}

async function endStep(post: Post) {
    // TODO
}

function scheduleEndStep(post: Post, timeout: number) {
    schedule.scheduleJob(timeout, async () => {
        const currentPost = await getPost(post.id)
        if (!isEqual(currentPost?.play, post.play)) {
            // The state of the play has changed, this job is outdated.
            return
        }
        endStep(currentPost)
    })
}

async function initializePlayTasks() {
    const plays: Post[] = await Post.findAll({
        where: {
            state: 'active',
            'play': { [Op.not]: null }
        }
    })

    for (const post of plays) {
        const play = post.play!
        if (play.status !== 'started') {
            continue
        }

        const stepTimeout = new Date(play.stepTimeout);
        if (stepTimeout < new Date()) {
            endStep(post)
        } else {
            scheduleEndStep(post, play.stepTimeout)
        }
    }
}

const EVENTS = {
    outgoing: {
        updateGame: 'play:outgoing-update-game',
        start: 'play:outgoing-start',
        next: 'play:outgoing-next',
        pause: 'play:outgoing-pause',
        stop: 'play:outgoing-stop'
    },
    incoming: {
        updated: 'play:incoming-updated'
    }
}

function registerPlaySocketEvents(socket: Socket, io: Server) {
    socket.on(EVENTS.outgoing.updateGame, async ({ id, game }: { id: number, game: Game }) => {
        const post = await getPost(id)

        const newPlay = {
            ...post.play,
            game
        }

        await Post.update({
            play: {
                ...post.play,
                game
            }
        }, {
            where: {
                id
            }
        })

        io.in(`${id}`).emit(EVENTS.incoming.updated, { play: newPlay })
    })

    socket.on(EVENTS.outgoing.start, async ({ id }: { id: number }) => {
        const post: Post = await Post.findOne({
            where: {
                id
            }
        })
        const play = post.play!

        let newPlay: Play;
        if (play.status === 'paused') {
            newPlay = {
                ...play,
                status: 'started',
                stepTimeout: +new Date() + play.step.post.timeout
            }
        } else {
            const firstStep = getFirstLeafStep(play.game.steps[0], play.variables, play.playerIds);
            if (!firstStep) {
                throw new Error('No step.')
            }

            newPlay = {
                ...play,
                status: 'started',
                step: firstStep.step,
                variables: firstStep.variables,
                stepTimeout:
                    +new Date() + firstStep.step.post.timeout,
            }

        }

        await Post.update({
            play: newPlay
        }, {
            where: {
                id
            }
        })
        io.in(`${id}`).emit(EVENTS.incoming.updated, { play: newPlay })

        const newPost = { ...post, play: newPlay }
        await startStep(newPost)
    })

    socket.on(EVENTS.outgoing.next, async ({ id }: { id: number }) => {
        const post = await Post.findOne({
            where: {
                id
            }
        })
        const play = post.play;
        const transition = getTransition(
            play.game.steps,
            play.step.id,
            play.variables,
            play.playerIds
        )
        const newPlay = transition?.next ? {
            ...play,
            step: transition.next,
            variables: transition.variables
        } : {
            game: play.game,
            gameId: play.gameId,
            playerIds: play.playerIds,
            status: 'ended',
            variables: {}
        }

        await Post.update({
            play: newPlay
        }, {
            where: {
                id
            }
        })
        io.in(`${id}`).emit(EVENTS.incoming.updated, { play: newPlay })
    })

    socket.on(EVENTS.outgoing.pause, async ({ id }: { id: number }) => {
        const post = await Post.findOne({
            where: {
                id
            }
        })

        const newPlay = {
            ...post.play,
            status: 'paused'
        }

        await Post.update({
            play: newPlay
        }, {
            where: {
                id
            }
        })
        io.in(`${id}`).emit(EVENTS.incoming.updated, { play: newPlay })
    })

    socket.on(EVENTS.outgoing.stop, async ({ id }: { id: number }) => {
        const post = await Post.findOne({
            where: {
                id
            }
        })

        const newPlay = {
            ...post.play,
            status: 'stopped'
        }

        await Post.update({
            play: newPlay
        }, {
            where: {
                id
            }
        })
        io.in(`${id}`).emit(EVENTS.incoming.updated, { play: newPlay })
    })
}

module.exports = {
    registerPlaySocketEvents,
    initializePlayTasks
}
