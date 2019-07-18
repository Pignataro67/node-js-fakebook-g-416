const _ = require('lodash');
const path = require('path');
const bodyParser = require('body-parser');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const knex = require('knex');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const handlebars = require('express-handlebars');
const flash = require('connect-flash');
const pry = require('pryjs');

const ENV = process.env.NODE_ENV || 'development';

const config = require('../knexfile');
const db = knex(config[ENV]);

// Initialize Express.
const app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(session({ secret: 'some secret' }));
app.use(flash());
app.use(cookieParser());
app.use(passport.initialize());
app.use(passport.session());

app.engine('handlebars', handlebars({
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, '/views/layouts')
}));
app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'handlebars');

// Configure & Initialize Bookshelf & Knex.
console.log(`Running in environment: ${ENV}`);

// ***** Models ***** //

const Comment = require('./models/comment');
const Post = require('./models/post');
const User = require('./models/user');

/// ***** Passport Strategies & Helpers ***** //

passport.use(new LocalStrategy((username, password, done) => {
  User
    .forge({ username: username })
    .fetch()
    .then((usr) => {
      if (!usr) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      usr.validatePassword(password).then((valid) => {
        if (!valid) {
          return done(null, false, { message: 'Invalid password.' });
        }
        return done(null, usr);
      });
    })
    .catch((err) => {
      return done(err);
    });
}));

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(user, done) {
  User
    .forge({id: user})
    .fetch()
    .then((usr) => {
      done(null, usr);
    })
    .catch((err) => {
      done(err);
    });
});

const isAuthenticated = (req, res, done) => {
  if (req.isAuthenticated()) {
    return done();
  }
  res.redirect('/login');
};

// ***** Server ***** //

app.get('/user/:id', isAuthenticated, (req,res) => {
  User
    .forge({id: req.params.id})
    .fetch()
    .then((usr) => {
      if (_.isEmpty(usr))
        return res.sendStatus(404);
      res.send(usr);
    })
    .catch((error) => {
      console.error(error);
      return res.sendStatus(500);
    });
});

app.post('/user', (req, res) => {
  if (_.isEmpty(req.body))
    return res.sendStatus(400);
  User
    .forge(req.body)
    .save()
    .then((usr) => {
      res.send({id: usr.id});
    })
    .catch((error) => {
      console.error(error);
      return res.sendStatus(500);
    });
});

app.get('/posts', isAuthenticated, (req, res) => {
  Post
    .collection()
    .fetch()
    .then((posts) => {
      res.send(posts);
    })
    .catch((error) => {
      res.sendStatus(500);
    });
});

app.get('/post/:id', isAuthenticated, (req,res) => {
  Post
    .forge({id: req.params.id})
    .fetch({withRelated: ['author', 'comments']})
    .then((post) => {
      if (_.isEmpty(post))
        return res.sendStatus(404);
      res.send(post);
    })
    .catch((error) => {
      console.error(error);
      return res.sendStatus(500);
    });
});

app.post('/post', isAuthenticated, (req, res) => {
  if(_.isEmpty(req.body))
    return res.sendStatus(400);
  Post
    .forge(req.body)
    .save()
    .then((post) => {
      res.send({id: post.id});
    })
    .catch((error) => {
      console.error(error);
      return res.sendStatus(500);
    });
});

app.post('/comment', isAuthenticated, (req, res) => {
  if (_.isEmpty(req.body))
    return res.sendStatus(400);
  Comment
    .forge(req.body)
    .save()
    .then((comment) => {
      res.send({id: comment.id});
    })
    .catch((error) => {
      console.error(error);
      res.sendStatus(500);
    });
});

app.get('/login', (req, res) => {
  res.render('login', { message: req.flash('error') });
});

app.post('/login',
  passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: true
  }),
  function(req, res) {
    res.redirect('/posts');
  });

app.get('/follow/:id', isAuthenticated, (req, res) => {
  if (_.isEmpty(req.params)) {
    return res.sendSatus(400);
  }

  User
    .forge({ id: req.params.id })
    .fetch()
    .then((user) => {
      if (!user) {
        return res.sendStatus(400);
      }
      return User
        .forge({ id: req.user.id })
        .following()
        .attach([ user ]);
    })
    .then(user => res.send(_.pluck(user.models, 'id')))
    .catch(err => res.status(500).json({ message: err }));
});

app.get('/unfollow/:id', isAuthenticated, (req, res) => {
  if (_.isEmpty(req.params)) {
    return res.sendStatus(400);
  }

  User
    .forge({ id: req.user.id })
    .following()
    .detach([ req.params.id ])
    .then(following => res.end())
    .catch(err => res.status(500).json({ message: err }));
});

app.get('/', isAuthenticated, (req, res) => {
  const followedIds = _.pluck(req.user.related('following').models, 'id');
  let followers = {};
  followedIds.forEach((id, index) => {
    followers[(idx === 0) ? 'where': 'orWhere'] = { 'author': id };
  });

  Post
    .query(followers)
    .orderBy('-created_at')
    .fetchAll({ withRelated: ['author']})
    .then(posts => res.send(posts))
    .catch(err => res.status(500).json({ message: err }));
})
// Exports for Server Hoisting.

const listen = (port) => {
  return new Promise((resolve, reject) => {
    return resolve(app.listen(port));
  });
};

exports.up = (justBackend) => {
  return db.migrate.latest([ENV])
    .then(() => {
      return db.migrate.currentVersion();
    })
    .then((val) => {
      console.log('Done running latest migration:', val);
      return listen(3000);
    })
    .then((server) => {
      console.log('Listening on port 3000...');
      return server
    });
};
