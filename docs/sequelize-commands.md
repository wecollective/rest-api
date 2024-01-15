# Sequelize commands

### Install sequelize-cli

`npm install --save sequelize-cli`

### Initialise the project

`npx sequelize-cli init`

### Migrate all models to tables in the database

`npx sequelize-cli db:migrate`

### Undo last migration

`npx sequelize-cli db:migrate:undo`

### Undo specific migration

`npx sequelize-cli db:migrate:undo --name file-name.js`

### Remove all migrated tables from the database

`npx sequelize-cli db:migrate:undo:all`

### Create new migration skeleton for table changes

`npx sequelize-cli migration:generate --name migration-skeleton-3`

### Seed all demo content into the database

-   Set up to allow log in with handle:admin, password:admin

`npx sequelize-cli db:seed:all`

### Remove all seeded demo content from the database

`npx sequelize-cli db:seed:undo:all`

### Drop datatbase

`npx sequelize-cli db:drop`

### Create datatbase

`npx sequelize-cli db:create`

### Generate table

-   ‘id’, ‘createdAt’, and ‘updatedAt’ attributes generated automatically by sequelize
-   string: max 255 characters
-   text: unlimited characters

`npx sequelize-cli model:generate --name TableName --attributes numberValue:integer,shortStringValue:string,longStringValue:text,booleanValue:boolean,dateValue:date`
