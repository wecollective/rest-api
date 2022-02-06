require("dotenv").config()
const express = require('express')
const router = express.Router()

var aws = require('aws-sdk')
var multer = require('multer')
var multerS3 = require('multer-s3')

const { User, Holon, GlassBeadGame } = require('../models')

const authenticateToken = require('../middleware/authenticateToken')

const fs = require('fs')
var ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
ffmpeg.setFfmpegPath(ffmpegPath)

aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1'
})
  
const s3 = new aws.S3({})

router.post('/image-upload', authenticateToken, (req, res) => {
    const accountId = req.user.id
    const { type, id } = req.query
    const { imageURL } = req.body

    function saveImage(imageType, url) {
        switch (imageType) {
            case 'user-flag':
                User
                    .update({ flagImagePath: url }, { where: { id: accountId }})
                    .then(res.status(200).json({ message: 'Success', imageURL: url }))
                break
            case 'user-cover':
                User
                    .update({ coverImagePath: url }, { where: { id: accountId }})
                    .then(res.status(200).json({ message: 'Success', imageURL: url }))
                break
            case 'space-flag':
                Holon
                    .update({ flagImagePath: url }, { where: { id } })
                    .then(res.status(200).json({ message: 'Success', imageURL: url }))
                break
            case 'space-cover':
                Holon
                    .update({ coverImagePath: url }, { where: { id } })
                    .then(res.status(200).json({ message: 'Success', imageURL: url }))
                break
            case 'gbg-topic':
                GlassBeadGame
                    .update({ topicImage: url }, { where: { id }})
                    .then(res.status(200).json({ message: 'Success', imageURL: url }))
                break
            case 'gbg-background':
                GlassBeadGame
                    .update({ backgroundImage: url }, { where: { id }})
                    .then(res.status(200).json({ message: 'Success', imageURL: url }))
                break
            default:
                break
        }
    }

    if (imageURL) saveImage(type, imageURL)
    else {
        multer({
            storage: multerS3({
                s3: s3,
                bucket: `weco-${process.env.NODE_ENV}-${type}-images`,
                acl: 'public-read',
                metadata: function (req, file, cb) {
                    cb(null, { mimetype: file.mimetype })
                },
                key: function (req, file, cb) {
                    const name = file.originalname.replace(/[^A-Za-z0-9]/g, '-').substring(0, 30)
                    const date = Date.now().toString()
                    const extension = file.mimetype.split('/')[1]
                    const fileName = `${type}-image-${id}-${accountId}-${name}-${date}.${extension}`
                    cb(null, fileName)
                }
            })
        }).single('image')(req, res, (err) => {
            const { file } = req
            if (file) saveImage(type, file.location)
            else res.status(500).json({ message: 'Failed', error: err })
        })
    }
})

router.post('/audio-upload', (req, res) => {
    // check file type and limits, then save raw audio in 'audio/raw' folder
    multer({
        fileFilter: (req, file, cb) => {
            if (file.mimetype === 'audio/mpeg-3') cb(null, true) // 'audio/webm'
            else {
                cb(null, false)
                cb(new Error('Only audio/mpeg-3 files allowed'))
            }
        },
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        dest: './audio/raw',
    }).single('file')(req, res, (error) => {
        // handle errors
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') res.status(413).send({ message: 'File size too large' })
            else res.status(500).send(error)
        } else if (error) {
            res.status(500).send(error)
        } else {
            const bucket = `weco-${process.env.NODE_ENV}-gbg-audio`
            // convert raw audio to mp3
            ffmpeg(req.file.path)
                .output(`audio/mp3/${req.file.filename}.mp3`)
                .on('end', function() {
                    // upload new mp3 file to s3 bucket
                    fs.readFile(`audio/mp3/${req.file.filename}.mp3`, function (err, data) {
                        if (!err) {
                            s3.putObject({
                                Bucket: bucket,
                                ACL: 'public-read',
                                Key: `${req.file.filename}.mp3`,
                                Body: data,
                                Metadata: { 'type': 'mp3', 'user': '...' }
                            }, (err) => {
                                if (err) console.log(err)
                                else {
                                    // delete old files
                                    fs.unlink(`audio/raw/${req.file.filename}`, (err => {
                                        if (err) console.log(err)
                                    }))
                                    fs.unlink(`audio/mp3/${req.file.filename}.mp3`, (err => {
                                        if (err) console.log(err)
                                    }))
                                    // send back the mp3's url
                                    res.send(`https://${bucket}.s3.eu-west-1.amazonaws.com/${req.file.filename}.mp3`)
                                }
                            })
                        }
                    })
                })
                .run()
        }
    })
})

module.exports = router