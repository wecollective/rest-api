const sequelize = require('sequelize')
const { Op } = sequelize
const { User, Event, UserEvent, Notification, Post, Weave, GlassBeadGame } = require('./models')
const schedule = require('node-schedule')

function getFirstLeafStep(
    step,
    variables,
    playerIds
) {
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
            const exhaustivenessCheck = step
            throw exhaustivenessCheck
        }
    }
}

const getNextLeafStep = (
    steps,
    stepId,
    variables,
    playerIds
) => {
    let currentFound = false
    let currentVariables = variables
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]

        if (currentFound) {
            const nextStep = getFirstLeafStep(step, currentVariables, playerIds)
            if (nextStep) {
                return nextStep
            }
        } else {
            switch (step.type) {
                case 'game':
                    throw new Error('TODO')
                case 'post':
                    if (step.id === stepId) {
                        currentFound = true
                    }
                    break
                case 'rounds': {
                    const result = getNextLeafStep(step.steps, stepId, currentVariables, playerIds)
                    if (!result) {
                        break
                    }

                    if (result.step) {
                        return result
                    }

                    const roundKey = `${step.id}_round`
                    const currentRound = currentVariables[roundKey]
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
                            return firstStep
                        }
                    }

                    currentFound = true
                    currentVariables = omit(currentVariables, roundKey)
                    break
                }
                case 'turns': {
                    const result = getNextLeafStep(step.steps, stepId, currentVariables, playerIds)
                    if (!result) {
                        break
                    }

                    if (result.step) {
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
                                [playerKey]: playerIds[currentPlayerIndex + 1],
                            },
                            playerIds
                        )
                        if (firstStep) {
                            return firstStep
                        }
                    }

                    currentFound = true
                    currentVariables = omit(currentVariables, playerKey)
                    break
                }
                default: {
                    const exhaustivenessCheck = step
                    throw exhaustivenessCheck
                }
            }
        }
    }

    if (currentFound) {
        return { variables: currentVariables }
    }

    return undefined
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
            // The state of the play has changed, we assume a new scheduled job has been triggered.
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
    })

    socket.on(EVENTS.outgoing.next, async ({ id }) => {
        const post = await Post.findOne({
            where: {
                id
            }
        })
        const play = post.play;
        const nextStep = getNextLeafStep(
            play.game.steps,
            play.step.id,
            play.variables,
            play.playerIds
        )
        const newPlay = nextStep?.step ? {
            ...play,
            step: nextStep.step,
            variables: nextStep.variables
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
