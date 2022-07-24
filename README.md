# The REST API for weco.io

## Set up

```
npm install
```

Create .env file:

```
NODE_ENV=dev
APP_ENV=dev
DEV_APP_URL=http://localhost:3000
DEV_API_URL=http://localhost:5000
DEV_WEBSOCKET_API_URL=http://localhost:5001
DEV_DB_USER=root
DEV_DB_PASSWORD=password
DEV_DB_NAME=weco
DEV_DB_PORT=3307
ACCESS_TOKEN_SECRET=secret
```

## Develop

### Build the MySQL database in Docker

```
npm run deps
```

### Populate the database

Open a new terminal

Generate the database tables:

```
npm run migrate
```

Populate the tables with demo data:

```
npm run seed
```

### Start the development server

```
npm run dev
```

## Start the production server

```
npm start
```
