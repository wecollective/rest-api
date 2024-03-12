const sequelize = require('sequelize')
const { Op } = sequelize
const { User, Event, UserEvent, Notification, Post, Weave, GlassBeadGame } = require('./models')
const schedule = require('node-schedule')
const { createPost } = require('./Helpers')
const parseDuration = require('parse-duration')

const getFirstLeafStep = (step, variables, playerIds) => {
    if (!step) {
        return undefined
    }
    switch (step.type) {
        case "game":
            throw new Error("TODO")
        case "post":
            return { step, variables }
        case "rounds": {
            const firstStep = getFirstLeafStep(step.steps[0], variables, playerIds)
            if (!firstStep) {
                return undefined
            }
            return {
                step: firstStep.step,
                variables: {
                    ...firstStep.variables,
                    [`${step.id}_round`]: firstStep.variables[`${step.id}_round`] ?? 1
                }
            }
        }
        case "turns": {
            const firstStep = getFirstLeafStep(step.steps[0], variables, playerIds)
            if (!firstStep) {
                return undefined
            }
            return {
                step: firstStep.step,
                variables: {
                    ...firstStep.variables,
                    [`${step.id}_player`]:
                        firstStep.variables[`${step.id}_player`] ?? playerIds[0]
                }
            }
        }
        default: {
            const exhaustivenessCheck = step
            throw exhaustivenessCheck
        }
    }
}

const getTransition = (steps, stepId, variables, playerIds) => {
    let current
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
                case "game":
                    throw new Error("TODO")
                case "post":
                    if (step.id === stepId) {
                        current = step
                    }
                    break
                case "rounds": {
                    const result = getTransition(
                        step.steps,
                        stepId,
                        currentVariables,
                        playerIds
                    )
                    if (!result) {
                        break
                    }

                    if (result.next) {
                        return result
                    }

                    const roundKey = `${step.id}_round`
                    const currentRound = currentVariables[roundKey]
                    if (currentRound < +step.amount) {
                        const firstStep = getFirstLeafStep(
                            step,
                            {
                                ...result.variables,
                                [roundKey]: currentRound + 1
                            },
                            playerIds
                        )
                        if (firstStep) {
                            return {
                                current: result.current,
                                next: firstStep.step,
                                variables: firstStep.variables
                            }
                        }
                    }

                    current = result.current
                    currentVariables = omit(result.variables, roundKey)
                    break
                }
                case "turns": {
                    const result = getTransition(
                        step.steps,
                        stepId,
                        currentVariables,
                        playerIds
                    )
                    if (!result) {
                        break
                    }

                    if (result.next) {
                        return result
                    }

                    const playerKey = `${step.id}_player`
                    const currentPlayerId = result.variables[playerKey]
                    const currentPlayerIndex = playerIds.indexOf(currentPlayerId)
                    if (currentPlayerIndex < playerIds.length - 1) {
                        const firstStep = getFirstLeafStep(
                            step,
                            {
                                ...result.variables,
                                [playerKey]: playerIds[currentPlayerIndex + 1]
                            },
                            playerIds
                        )
                        if (firstStep) {
                            return {
                                current: result.current,
                                next: firstStep.step,
                                variables: firstStep.variables
                            }
                        }
                    }

                    current = result.current
                    currentVariables = omit(result.variables, playerKey)
                    break
                }
                default: {
                    const exhaustivenessCheck = step
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

async function startStep(post) {
    const { current, next, variables } = getTransition(post)

    switch (current.type) {
        case 'post':
            const timeout = parseDuration(current.post.timeout)
            await createPost({
                type: 'post',
                title: current.post.title,
                text: current.post.text,
            }, [], post.creatorId)
            scheduleEndStep()
            break;
        default:
            throw new Error('TODO')
    }

    const newPost = {};
    scheduleEndStep(post);
}

async function endStep(post) {
    // TODO
}

function scheduleEndStep(post) {
    schedule.scheduleJob(post.play.stepTimeout, async () => {
        const currentPost = await Post.findOne({
            where: {
                state: 'active',
                id: post.id
            }
        })
        if (!deepEquals(currentPost?.play, post.play)) {
            // The state of the play has changed, this job is outdated.
            return
        }
        endStep(currentPost)
    })
}

async function initializePlayTasks() {
    const plays = await Post.findAll({
        where: {
            state: 'active',
            'play': { [Op.not]: null }
        }
    })

    for (const post of plays) {
        const play = post.play
        if (play.status !== 'started') {
            continue
        }

        const stepTimeout = new Date(play.stepTimeout);
        if (stepTimeout < new Date()) {
            endStep(post)
        } else {
            scheduleEndStep(post)
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

function registerPlaySocketEvents(socket, io) {
    socket.on(EVENTS.outgoing.updateGame, async ({ id, game }) => {
        const post = await Post.findOne({
            where: {
                id
            }
        })

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

        io.in(id).emit(EVENTS.incoming.updated, { play: newPlay })
    })

    socket.on(EVENTS.outgoing.start, async ({ id }) => {
        const post = await Post.findOne({
            where: {
                id
            }
        })

        let newPlay;
        if (post.play.status === 'paused') {
            newPlay = {
                ...post.play,
                status: 'started',
                stepTimeout: +new Date() + post.play.step.post.timeout
            }
        } else {
            const firstStep = getFirstLeafStep(post.play.game.steps[0]);

            newPlay = {
                ...post.play,
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
        io.in(id).emit(EVENTS.incoming.updated, { play: newPlay })

        const newPost = { ...post, play: newPlay }
        await startStep(newPost)
    })

    socket.on(EVENTS.outgoing.next, async ({ id }) => {
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
        io.in(id).emit(EVENTS.incoming.updated, { play: newPlay })
    })

    socket.on(EVENTS.outgoing.pause, async ({ id }) => {
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
        io.in(id).emit(EVENTS.incoming.updated, { play: newPlay })
    })

    socket.on(EVENTS.outgoing.stop, async ({ id }) => {
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
        io.in(id).emit(EVENTS.incoming.updated, { play: newPlay })
    })
}

module.exports = {
    registerPlaySocketEvents,
    initializePlayTasks
}
