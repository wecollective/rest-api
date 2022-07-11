# The REST API for weco.io

## Set up

```
npm i
```

Create .env file:

```
NODE_ENV=dev
APP_ENV=dev
DEV_APP_URL=http://localhost:3000
DEV_DB_NAME=weco
DEV_DB_USER=root
DEV_DB_PASSWORD=password
ACCESS_TOKEN_SECRET=secret
```

Generate [seeds](./docs/sequelize-commands.md)

# Develop

In separate terminals run:

- `npm run deps`
- `npm run dev`

## Start

```
npm start
```
