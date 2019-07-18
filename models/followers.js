"use strict";

const bookshelf = require('../db/bookshelf');

const Follower = bookshelf.Model.extend({
  tableName: 'users_users'
});

module.exports = bookshelf.model('Follower', Follower);