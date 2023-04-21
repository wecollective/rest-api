require('dotenv').config()
const express = require('express')
const router = express.Router()

var aws = require('aws-sdk')
var multer = require('multer')
var multerS3 = require('multer-s3')

const { User, Space, GlassBeadGame, Post, Link, Audio } = require('../models')

const authenticateToken = require('../middleware/authenticateToken')

const fs = require('fs')
var ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
ffmpeg.setFfmpegPath(ffmpegPath)

aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1',
})

const s3 = new aws.S3({})

router.post('/image-upload', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { type, id } = req.query
    const { imageURL } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        function saveImage(imageType, url) {
            switch (imageType) {
                case 'user-flag':
                    return User.update({ flagImagePath: url }, { where: { id: accountId } })
                case 'user-cover':
                    return User.update({ coverImagePath: url }, { where: { id: accountId } })
                case 'space-flag':
                    return Space.update({ flagImagePath: url }, { where: { id } })
                case 'space-cover':
                    return Space.update({ coverImagePath: url }, { where: { id } })
                case 'gbg-topic':
                    return GlassBeadGame.update({ topicImage: url }, { where: { id } })
                default:
                    break
            }
        }

        if (imageURL) {
            saveImage(type, imageURL)
                .then(() => res.status(200).json({ message: 'Success', imageURL }))
                .catch((error) => res.status(500).json({ message: 'Error', error }))
        } else {
            multer({
                storage: multerS3({
                    s3: s3,
                    bucket: `weco-${process.env.NODE_ENV}-${type}-images`,
                    acl: 'public-read',
                    metadata: function (req, file, cb) {
                        cb(null, { mimetype: file.mimetype })
                    },
                    key: function (req, file, cb) {
                        const name = file.originalname
                            .replace(/[^A-Za-z0-9]/g, '-')
                            .substring(0, 30)
                        const date = Date.now().toString()
                        const extension = file.mimetype.split('/')[1]
                        const fileName = `${type}-image-${id}-${accountId}-${name}-${date}.${extension}`
                        cb(null, fileName)
                    },
                }),
            }).single('image')(req, res, (err) => {
                const { file } = req
                if (file) {
                    saveImage(type, file.location)
                        .then(() =>
                            res.status(200).json({ message: 'Success', imageURL: file.location })
                        )
                        .catch((error) => res.status(500).json({ message: 'Error', error }))
                } else res.status(500).json({ message: 'Error', error: err })
            })
        }
    }
})

router.post('/gbg-background', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { gameId } = req.query
    const { imageURL, videoURL, videoStartTime } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        if (imageURL) {
            GlassBeadGame.update(
                {
                    backgroundImage: imageURL,
                    backgroundVideo: null,
                    backgroundVideoStartTime: null,
                },
                { where: { id: gameId } }
            ).then(res.status(200).json({ message: 'Success' }))
        } else if (videoURL) {
            GlassBeadGame.update(
                {
                    backgroundImage: null,
                    backgroundVideo: videoURL,
                    backgroundVideoStartTime: videoStartTime,
                },
                { where: { id: gameId } }
            ).then(res.status(200).json({ message: 'Success' }))
        } else {
            multer({
                storage: multerS3({
                    s3: s3,
                    bucket: `weco-${process.env.NODE_ENV}-gbg-background-images`,
                    acl: 'public-read',
                    metadata: function (req, file, cb) {
                        cb(null, { mimetype: file.mimetype })
                    },
                    key: function (req, file, cb) {
                        const name = file.originalname
                            .replace(/[^A-Za-z0-9]/g, '-')
                            .substring(0, 30)
                        const date = Date.now().toString()
                        const extension = file.mimetype.split('/')[1]
                        const fileName = `gbg-background-image-${gameId}-${accountId}-${name}-${date}.${extension}`
                        cb(null, fileName)
                    },
                }),
            }).single('image')(req, res, (err) => {
                const { file } = req
                if (file) {
                    GlassBeadGame.update(
                        {
                            backgroundImage: file.location,
                            backgroundVideo: null,
                            backgroundVideoStartTime: null,
                        },
                        { where: { id: gameId } }
                    ).then(res.status(200).json({ message: 'Success', imageURL: file.location }))
                } else res.status(500).json({ message: 'Failed', error: err })
            })
        }
    }
})

router.post('/gbg-audio-upload', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, moveNumber } = req.query

    // Glass Bead Audio uploads only...
    // check file type and limits, then save raw audio in 'audio/raw' folder
    multer({
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        dest: './temp/audio/raw',
    }).single('file')(req, res, (error) => {
        // handle errors
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE')
                res.status(413).send({ message: 'File size too large' })
            else res.status(500).send(error)
        } else if (error) {
            res.status(500).send(error)
        } else {
            const bucket = `weco-${process.env.NODE_ENV}-gbg-audio`
            // convert raw audio to mp3
            ffmpeg(req.file.path)
                .output(`temp/audio/mp3/${req.file.filename}.mp3`)
                .on('end', function () {
                    // upload new mp3 file to s3 bucket
                    fs.readFile(`temp/audio/mp3/${req.file.filename}.mp3`, function (err, data) {
                        if (!err) {
                            const fileName = `glass-bead-${postId}-${Date.now().toString()}.mp3`
                            s3.putObject(
                                {
                                    Bucket: bucket,
                                    ACL: 'public-read',
                                    Key: fileName,
                                    Body: data,
                                    Metadata: { type: 'mp3', postId: postId },
                                },
                                async (err) => {
                                    if (err) console.log(err)
                                    else {
                                        // delete old files
                                        fs.unlink(`temp/audio/raw/${req.file.filename}`, (err) => {
                                            if (err) console.log(err)
                                        })
                                        fs.unlink(
                                            `temp/audio/mp3/${req.file.filename}.mp3`,
                                            (err) => {
                                                if (err) console.log(err)
                                            }
                                        )
                                        // // send back the mp3's url
                                        // res.send(
                                        //     `https://${bucket}.s3.eu-west-1.amazonaws.com/${fileName}`
                                        // )
                                        const url = `https://${bucket}.s3.eu-west-1.amazonaws.com/${fileName}`
                                        const bead = await Post.create({
                                            type: 'gbg-audio',
                                            state: 'visible',
                                            creatorId: accountId,
                                            lastActivity: new Date(),
                                        })

                                        const createAudio = await Audio.create({
                                            type: 'post',
                                            itemId: bead.id,
                                            creatorId: accountId,
                                            url,
                                        })

                                        const createLink = await Link.create({
                                            state: 'draft',
                                            type: 'gbg-post',
                                            index: moveNumber,
                                            creatorId: accountId,
                                            itemAId: postId,
                                            itemBId: bead.id,
                                        })

                                        Promise.all([createAudio, createLink])
                                            .then(() => res.status(200).json({ id: bead.id, url }))
                                            .catch((error) => res.status(500).json({ error }))
                                    }
                                }
                            )
                        }
                    })
                })
                .run()
        }
    })
})

module.exports = router
