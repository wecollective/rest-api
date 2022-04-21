'use strict';
module.exports = (sequelize, DataTypes) => {
  const HolonUser = sequelize.define('HolonUser', {
    id: {
        primaryKey: true,
        type: DataTypes.INTEGER,
        autoIncrement: true,
    },
    relationship: DataTypes.STRING,
    state: DataTypes.STRING,
    holonId: DataTypes.INTEGER,
    userId: DataTypes.INTEGER
  }, {});
  HolonUser.associate = function(models) {
    // associations can be defined here
  };
  return HolonUser;
};