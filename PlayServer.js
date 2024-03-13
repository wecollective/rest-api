"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlayServerEvents = exports.initializePlayServerTasks = void 0;
const lodash_1 = require("lodash");
const node_schedule_1 = __importDefault(require("node-schedule"));
const parse_duration_1 = __importDefault(require("parse-duration"));
const sequelize_1 = __importDefault(require("sequelize"));
const { Post, Link } = require('./models');
const { createPost } = require('./Helpers');
const { Op } = sequelize_1.default;
const POST_TYPE = [
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
];
function getPost(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const post = yield Post.findOne({
            where: {
                state: 'active',
                id
            }
        });
        if (!post) {
            throw new Error(`Post ${id}  not found`);
        }
        return post;
    });
}
function updatePost(id, data) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield Post.update(data, { where: { id } });
    });
}
const getFirstMove = (step, variables, playerIds) => {
    var _a, _b;
    if (!step) {
        return undefined;
    }
    switch (step.type) {
        case 'game':
            throw new Error('TODO');
        case 'move':
            return { step, variables };
        case 'rounds': {
            const firstStep = getFirstMove(step.steps[0], variables, playerIds);
            if (!firstStep) {
                return undefined;
            }
            return {
                step: firstStep.step,
                variables: Object.assign(Object.assign({}, firstStep.variables), { [step.name]: (_a = firstStep.variables[step.name]) !== null && _a !== void 0 ? _a : 1 }),
            };
        }
        case 'turns': {
            const firstStep = getFirstMove(step.steps[0], variables, playerIds);
            if (!firstStep) {
                return undefined;
            }
            return {
                step: firstStep.step,
                variables: Object.assign(Object.assign({}, firstStep.variables), { [step.name]: (_b = firstStep.variables[step.name]) !== null && _b !== void 0 ? _b : playerIds[0] }),
            };
        }
        default: {
            const exhaustivenessCheck = step;
            throw exhaustivenessCheck;
        }
    }
};
const getTransition = (steps, stepId, variables, playerIds) => {
    let current;
    let currentVariables = variables;
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (current) {
            const nextStep = getFirstMove(step, currentVariables, playerIds);
            if (nextStep) {
                return { current, next: nextStep.step, variables: nextStep.variables };
            }
        }
        else {
            switch (step.type) {
                case 'game':
                    throw new Error('TODO');
                case 'move':
                    if (step.id === stepId) {
                        current = step;
                    }
                    break;
                case 'rounds':
                case 'turns': {
                    const result = getTransition(step.steps, stepId, currentVariables, playerIds);
                    if (!result) {
                        break;
                    }
                    if (result.next) {
                        return result;
                    }
                    let next;
                    if (step.type === 'rounds') {
                        const round = currentVariables[step.name];
                        next = round < +step.amount ? round + 1 : undefined;
                    }
                    else {
                        const playerId = currentVariables[step.name];
                        const playerIndex = playerIds.indexOf(playerId);
                        next = playerIds[playerIndex + 1];
                    }
                    if (next) {
                        const firstStep = getFirstMove(step, Object.assign(Object.assign({}, result.variables), { [step.name]: next }), playerIds);
                        if (firstStep) {
                            return {
                                current: result.current,
                                next: firstStep.step,
                                variables: firstStep.variables,
                            };
                        }
                    }
                    current = result.current;
                    currentVariables = (0, lodash_1.omit)(result.variables, step.name);
                    break;
                }
                default: {
                    const exhaustivenessCheck = step;
                    throw exhaustivenessCheck;
                }
            }
        }
    }
    if (current) {
        return { current, variables: currentVariables };
    }
    return undefined;
};
function createChild(data, parent) {
    return __awaiter(this, void 0, void 0, function* () {
        const { post } = yield createPost(data, [], parent.creatorId);
        yield Link.create({
            creatorId: parent.creatorId,
            itemAId: parent.id,
            itemAType: parent.type,
            itemBId: post.id,
            itemBType: post.type,
            relationship: 'parent',
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0
        });
        return post;
    });
}
function insertVariables(text, variables) {
    return text === null || text === void 0 ? void 0 : text.replace(/\(([^)]+)\)/, (substring, variableName) => {
        if (variableName in variables) {
            return `${variables[variableName]}`;
        }
        return substring;
    });
}
function startStep(playPost, step, variables, io) {
    return __awaiter(this, void 0, void 0, function* () {
        const play = playPost.play;
        const now = +new Date();
        const timeout = now + (0, parse_duration_1.default)(step.timeout);
        const move = {
            status: 'started',
            startedAt: now,
            timeout,
            playId: playPost.id
        };
        const movePost = yield createChild({
            type: 'post',
            mediaTypes: '',
            title: insertVariables(step.title, variables),
            text: insertVariables(step.text, variables),
            move
        }, playPost);
        const newPlay = Object.assign(Object.assign({}, play), { status: 'started', stepId: step.id, moveId: movePost.id, variables: variables });
        yield updatePost(playPost.id, { play: newPlay });
        scheduleMoveTimeout(movePost, timeout, io);
        io.in(playPost.id).emit(EVENTS.incoming.updated, { play: newPlay });
    });
}
function moveTimeout(movePost, io) {
    return __awaiter(this, void 0, void 0, function* () {
        const move = movePost.move;
        const newMove = Object.assign(Object.assign({}, move), { status: 'ended' });
        updatePost(movePost.id, {
            move: newMove
        });
        if (move.playId) {
            const playPost = yield getPost(move.playId);
            nextStep(playPost, io);
        }
    });
}
function nextStep(playPost, io) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const play = playPost.play;
        if (play.status !== 'started') {
            return;
        }
        const transition = getTransition(play.game.steps, play.stepId, play.variables, play.playerIds);
        if (transition === null || transition === void 0 ? void 0 : transition.next) {
            console.log('next', transition.next, transition.variables);
            yield startStep(playPost, transition.next, transition.variables, io);
        }
        else {
            const newPlay = {
                game: play.game,
                gameId: play.gameId,
                playerIds: play.playerIds,
                status: 'ended',
                variables: (_a = transition === null || transition === void 0 ? void 0 : transition.variables) !== null && _a !== void 0 ? _a : play.variables
            };
            // await createChild({
            //     type: 'post',
            //     mediaTypes: '',
            //     text: 'Play ended!',
            // }, playPost)
            yield updatePost(playPost.id, { play: newPlay });
            io.in(playPost.id).emit(EVENTS.incoming.updated, { play: newPlay });
        }
    });
}
function scheduleMoveTimeout(post, timeout, io) {
    node_schedule_1.default.scheduleJob(timeout, () => __awaiter(this, void 0, void 0, function* () {
        const currentPost = yield getPost(post.id);
        if (!(0, lodash_1.isEqual)(currentPost.move, post.move)) {
            // The state of the move has changed, this job is outdated.
            return;
        }
        moveTimeout(currentPost, io);
    }));
}
const EVENTS = {
    outgoing: {
        updateGame: 'outgoing-update-play-game',
        start: 'outgoing-start-play',
        stop: 'outgoing-stop-play',
        skip: 'outgoing-skip-move',
        pause: 'outgoing-pause-move',
    },
    incoming: {
        updated: 'incoming-play-updated'
    }
};
function initializePlayServerTasks(io) {
    return __awaiter(this, void 0, void 0, function* () {
        const moves = yield Post.findAll({
            where: {
                state: 'active',
                'move': { [Op.not]: null }
            }
        });
        for (const post of moves) {
            const move = post.move;
            if (move.status !== 'started') {
                continue;
            }
            console.log(move.timeout, +new Date());
            if (move.timeout < +new Date()) {
                moveTimeout(post, io);
            }
            else {
                scheduleMoveTimeout(post, move.timeout, io);
            }
        }
    });
}
exports.initializePlayServerTasks = initializePlayServerTasks;
function registerPlayServerEvents(socket, io) {
    return __awaiter(this, void 0, void 0, function* () {
        socket.on(EVENTS.outgoing.updateGame, (_a) => __awaiter(this, [_a], void 0, function* ({ id, game }) {
            const post = yield getPost(id);
            const newPlay = Object.assign(Object.assign({}, post.play), { game });
            yield updatePost(id, {
                play: newPlay
            });
            io.in(id).emit(EVENTS.incoming.updated, { play: newPlay });
        }));
        socket.on(EVENTS.outgoing.start, (_b) => __awaiter(this, [_b], void 0, function* ({ id }) {
            const playPost = yield Post.findOne({
                where: {
                    id
                }
            });
            const play = playPost.play;
            if (play.status === 'started') {
                return;
            }
            const step = getFirstMove(play.game.steps[0], play.variables, play.playerIds);
            if (!step) {
                throw new Error('No step.');
            }
            yield startStep(playPost, step.step, step.variables, io);
        }));
        socket.on(EVENTS.outgoing.skip, (_c) => __awaiter(this, [_c], void 0, function* ({ id }) {
            const post = yield Post.findOne({
                where: {
                    id
                }
            });
            const play = post.play;
            const transition = getTransition(play.game.steps, play.step.id, play.variables, play.playerIds);
            const newPlay = (transition === null || transition === void 0 ? void 0 : transition.next) ? Object.assign(Object.assign({}, play), { step: transition.next, variables: transition.variables }) : {
                game: play.game,
                gameId: play.gameId,
                playerIds: play.playerIds,
                status: 'ended',
                variables: {}
            };
            yield Post.update({
                play: newPlay
            }, {
                where: {
                    id
                }
            });
            io.in(id).emit(EVENTS.incoming.updated, { play: newPlay });
        }));
        socket.on(EVENTS.outgoing.pause, (_d) => __awaiter(this, [_d], void 0, function* ({ id }) {
            const post = yield Post.findOne({
                where: {
                    id
                }
            });
            const newPlay = Object.assign(Object.assign({}, post.play), { status: 'paused' });
            yield Post.update({
                play: newPlay
            }, {
                where: {
                    id
                }
            });
            io.in(id).emit(EVENTS.incoming.updated, { play: newPlay });
        }));
        socket.on(EVENTS.outgoing.stop, (_e) => __awaiter(this, [_e], void 0, function* ({ id }) {
            const post = yield Post.findOne({
                where: {
                    id
                }
            });
            const newPlay = Object.assign(Object.assign({}, post.play), { status: 'stopped' });
            yield Post.update({
                play: newPlay
            }, {
                where: {
                    id
                }
            });
            io.in(id).emit(EVENTS.incoming.updated, { play: newPlay });
        }));
    });
}
exports.registerPlayServerEvents = registerPlayServerEvents;
