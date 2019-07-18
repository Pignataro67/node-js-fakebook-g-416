exports.up = (knex, Promise) => {
  return Promise.all([
    knex.schema.createTableIfNotExists('users_users', (table) => {
      table.integer('user_id').references('users.id');
      table.integer('follower_id').references('users.id');
      table.unique(['user_id', 'follower_id']);
    })
  ]);
};

exports.down = (knex, Promise) => {
  return Promise.all([
    knex.schema.dropTable('users_users')
  ])
};