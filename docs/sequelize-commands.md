# Sequelize commands

Install sequelize-cli
`npm install --save sequelize-cli`

Initialise the project
`npx sequelize-cli init`

Migrate all models to tables in the database
`npx sequelize-cli db:migrate`

Remove all migrated tables from the database
`npx sequelize-cli db:migrate:undo:all`

Create new migration skeleton for table changes
`npx sequelize-cli migration:generate --name migration-skeleton-3`

Seed all demo content into the database
`npx sequelize-cli db:seed:all`

Will allow you to log in with admin/admin.

Remove all seeded demo content from the database
`npx sequelize-cli db:seed:undo:all`

Drop datatbase
`npx sequelize-cli db:drop`

Create datatbase
`npx sequelize-cli db:create`

## Generate Models/Tables

‘id’, ‘createdAt’, and ‘updatedAt’ attributes generated automatically by Sequelize.

### TextDataTypes

string: max 255 characters
text: unlimited characters

TODO: Describe the purpose of each table, inlcude link to table map on Draw.io

### Holon

`npx sequelize-cli model:generate --name Holon --attributes handle:string,name:string,description:string,flagImagePath:string,coverImagePath:string`

### VerticalHolonRelationship

Holon A is a direct parent of holon B
`npx sequelize-cli model:generate --name VerticalHolonRelationship --attributes state:string,holonAId:integer,holonBId:integer`

### HolonTag

Posts to holon A appear within holon B
`npx sequelize-cli model:generate --name VerticalHolonRelationship --attributes state:string,holonAId:integer,holonBId:integer`

### HolonUser

`npx sequelize-cli model:generate --name HolonUser --attributes relationship:string,holonId:integer,userId:integer`

### PostHolon

`npx sequelize-cli model:generate --name PostHolon --attributes creator:integer,relationship:string,state:string,postId:integer,holonId:integer`

### User

`npx sequelize-cli model:generate --name User --attributes handle:string,name:string,bio:string,flagImagePath:string,coverImagePath:string`

### Post

`npx sequelize-cli model:generate --name Post --attributes type:string,privacySetting:string,creator:integer,note:string,title:string,description:string,url:string,imagePath:string`

### UserUser

`npx sequelize-cli model:generate --name UserUser --attributes relationship:string,userAId:integer,userBId:integer`

### Comment

`npx sequelize-cli model:generate --name Comment --attributes creator:integer,parentCommentId:integer,postId:integer,text:string`

### Reaction

`npx sequelize-cli model:generate --name Reaction --attributes type:string,value:string,holonId:integer,userId:integer,postId:integer,commentId:integer`

### Notification

`npx sequelize-cli model:generate --name Notification --attributes type:string,text:string,holonId:integer,userId:integer,postId:integer,commentId:integer`

### Inquiry

`npx sequelize-cli model:generate --name Inquiry --attributes postId:integer,type:string,answersLocked:boolean,endTime:date`

### InquiryAnswer

`npx sequelize-cli model:generate --name InquiryAnswer --attributes creatorId:integer,postId:integer,text:string`

### Prism

`npx sequelize-cli model:generate --name Prism --attributes numberOfPlayers:integer,duration:number,privacy:string`

### PrismUser

`npx sequelize-cli model:generate --name PrismUser --attributes relationship:string,state:string,prismId:integer,userId:integer`

### PlotGraph

`npx sequelize-cli model:generate --name PlotGraph --attributes numberOfPlotGraphAxes:integer,axis1Left:string,axis1Right:string,axis2Top:string,axis2Bottom:string`

### Link

type: post-post, post-space, post-user, space-post, space-space, space-user, user-post, user-space, user-user)
relationship: turn, text
`npx sequelize-cli model:generate --name Link --attributes creatorId:integer,type:string,relationship:string,description:text,itemAId:integer,itemBId:integer`

### GlassBeadGame

`npx sequelize-cli model:generate --name GlassBeadGame --attributes postId:integer,topic:string,numberOfTurns:integer,turnDuration:integer,introDuration:integer,intervalDuration:integer,saved:boolean`

### GlassBead

`npx sequelize-cli model:generate --name GlassBead --attributes postId:integer,index:integer,userId:integer,beadUrl:string`

### GlassBeadGameComment

`npx sequelize-cli model:generate --name GlassBeadGameComment --attributes postId:integer,index:integer,userId:integer,text:text`

### Image

`npx sequelize-cli model:generate --name Image --attributes creatorId:integer,postId:integer,index:integer,url:string,caption:text`

### UserPost

`npx sequelize-cli model:generate --name UserPost --attributes userId:integer,postId:integer,type:string,relationship:string,index:integer,state:string`

### Weave

`npx sequelize-cli model:generate --name Weave --attributes postId:integer,numberOfTurns:integer,moveDuration:integer,allowedPostTypes:string,privacy:string`

### GlassBeadGame2

postId:integer
state:string
topic:string
topicGroup:string
topicImage:string
backgroundImage:string
backgroundVideo:string
backgroundVideoStartTime:string
locked:boolean
synchronous:boolean
multiplayer:boolean
nextMoveDeadline:date
allowedBeadTypes:string
playerOrder:text
totalMoves:integer
movesPerPlayer:integer
moveDuration:integer
moveTimeWindow:integer
characterLimit:integer
introDuration:integer
outroDuration:integer
intervalDuration:integer
oldGameId:integer (used to restore old gbg beads and comments)

`npx sequelize-cli model:generate --name GlassBeadGame2 --attributes postId:integer,state:string,locked:boolean,topic:string,topicGroup:string,topicImage:string,synchronous:boolean,multiplayer:boolean,nextMoveDeadline:date,allowedBeadTypes:string,playerOrder:text,totalMoves:integer,movesPerPlayer:integer,moveDuration:integer,moveTimeWindow:integer,characterLimit:integer,introDuration:integer,outroDuration:integer,intervalDuration:integer,backgroundImage:string,backgroundVideo:string,backgroundVideoStartTime:string,oldGameId:integer`

### Url

type:string (post, comment etc.)
itemId:integer
url:text
image:text
title:text
description:text
domain:text

type:string,itemId:integer,url:text,image:text,title:text,description:text,domain:text

`npx sequelize-cli model:generate --name Url --attributes type:string,itemId:integer,state:string,url:text,image:text,title:text,description:text,domain:text`

### Audio

type:string (post, comment etc.)
itemId:integer
state:string
url:text

`npx sequelize-cli model:generate --name Audio --attributes type:string,itemId:integer,state:string,url:text`

## Generate Seeders

`npx sequelize-cli seed:generate --name demo-holons`
`npx sequelize-cli seed:generate --name demo-holon-tags`
`npx sequelize-cli seed:generate --name demo-vertical-holon-relationships`
`npx sequelize-cli seed:generate --name demo-posts`
`npx sequelize-cli seed:generate --name demo-post-holons`
`npx sequelize-cli seed:generate --name demo-labels`
`npx sequelize-cli seed:generate --name demo-users`

## Migration commands

queryInterface.renameColumn('Person', 'signature', 'sig') // renameColumn(tableName, attrNameBefore, attrNameAfter, options)
queryInterface.renameTable('Person', 'User')
queryInterface.removeColumn('Links', 'localState', { transaction: t }),
queryInterface.addColumn('Reactions', 'linkId', {
type: Sequelize.DataTypes.INTEGER
}, { transaction: t })
